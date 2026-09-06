/**
 * Pedido sugerido a casa matriz según rotación de inventario (consumo últimos N días)
 * y empaque de compra (x6, x100, etc.).
 */

import { inferirUnidadesPorPaquete, itemParecePaqueteCargue } from "@/lib/inventario-cargue-presentacion";
import {
  movimientoInventarioCorrespondeAInsumoKit,
  type InventarioSaldoRow,
  cantidadSaldoParaInsumoKit,
  normSkuInventario,
} from "@/lib/inventario-pos-firestore";
import type { InsumoKitItem, InventarioMovimientoDoc, TipoMovimientoInventario } from "@/types/inventario-pos";

/** Tipos que reflejan demanda real (venta / uso), no ajustes de conteo. */
export const TIPOS_CONSUMO_PEDIDO_SUGERIDO: ReadonlySet<TipoMovimientoInventario> = new Set([
  "venta_ensamble",
  "consumo_interno",
]);

export const DIAS_VENTANA_ROTACION_DEFAULT = 7;
export const DIAS_COBERTURA_PEDIDO_DEFAULT = 7;

function secondsCreatedAt(m: InventarioMovimientoDoc): number {
  const c = m.createdAt;
  if (c && typeof c === "object" && typeof (c as { seconds?: number }).seconds === "number") {
    return (c as { seconds: number }).seconds;
  }
  return 0;
}

export function redondearAMultiploEmpaque(cantidad: number, unidadesPorEmpaque: number): number {
  const e = unidadesPorEmpaque >= 1 ? unidadesPorEmpaque : 1;
  if (!Number.isFinite(cantidad) || cantidad <= 0) return 0;
  return Math.ceil(cantidad / e) * e;
}

export function unidadesPorEmpaqueInsumo(item: Pick<InsumoKitItem, "sku" | "descripcion" | "unidad">): number {
  return inferirUnidadesPorPaquete(`${item.sku} ${item.descripcion}`) ?? 1;
}

/** True si el saldo POS de este ítem se lleva en paquetes (cargue x6/x100…). */
export function saldoSeLlevaEnPaquetes(item: Pick<InsumoKitItem, "sku" | "descripcion" | "unidad">): boolean {
  const n = unidadesPorEmpaqueInsumo(item);
  return itemParecePaqueteCargue(item) || n >= 2;
}

export function consumoInsumoEnVentana(
  movimientos: InventarioMovimientoDoc[],
  item: InsumoKitItem,
  desdeEpochSec: number
): number {
  let sum = 0;
  for (const m of movimientos) {
    if (!TIPOS_CONSUMO_PEDIDO_SUGERIDO.has(m.tipo)) continue;
    if (secondsCreatedAt(m) < desdeEpochSec) continue;
    if (!movimientoInventarioCorrespondeAInsumoKit(m, item)) continue;
    const d = Number(m.delta);
    if (!Number.isFinite(d) || d >= 0) continue;
    sum += Math.abs(d);
  }
  return Math.round(sum * 1000) / 1000;
}

export type LineaPedidoSugerido = {
  sku: string;
  descripcion: string;
  unidad: string;
  saldoActual: number;
  /** Equivalente en und si el saldo es paquetes (saldo × xN). */
  saldoUnidadesEquiv: number | null;
  minimoEfectivo: number | null;
  bajoMinimo: boolean;
  consumoVentana: number;
  promedioDiario: number;
  objetivoCobertura: number;
  unidadesPorEmpaque: number;
  /** El pedido a matriz va en paquetes. */
  saldoEnPaquetes: boolean;
  /** Paquetes a pedir a casa matriz (siempre la cifra principal del pedido). */
  paquetesPedir: number;
  /** Und sueltas equivalentes (paquetes × xN), solo informativo. */
  unidadesEquivPedir: number | null;
};

export type ResultadoPedidoSugerido = {
  puntoVenta: string;
  generadoIso: string;
  diasVentana: number;
  diasCobertura: number;
  lineas: LineaPedidoSugerido[];
  resumen: {
    productosEvaluados: number;
    productosAPedir: number;
    totalPaquetesPedir: number;
  };
};

export function construirPedidoSugerido(params: {
  puntoVenta: string;
  insumos: InsumoKitItem[];
  saldoRows: InventarioSaldoRow[];
  movimientos: InventarioMovimientoDoc[];
  /** Mínimo efectivo por SKU normalizado (usuario o hoja). */
  minimoPorSku: Map<string, number | null | undefined> | Record<string, number | null | undefined>;
  diasVentana?: number;
  diasCobertura?: number;
  ahora?: Date;
}): ResultadoPedidoSugerido {
  const diasVentana = params.diasVentana ?? DIAS_VENTANA_ROTACION_DEFAULT;
  const diasCobertura = params.diasCobertura ?? DIAS_COBERTURA_PEDIDO_DEFAULT;
  const ahora = params.ahora ?? new Date();
  const desdeEpochSec = Math.floor(ahora.getTime() / 1000) - diasVentana * 86400;

  const minMap =
    params.minimoPorSku instanceof Map
      ? params.minimoPorSku
      : new Map(Object.entries(params.minimoPorSku));

  const lineas: LineaPedidoSugerido[] = [];

  const sorted = [...params.insumos].sort((a, b) =>
    a.descripcion.localeCompare(b.descripcion, "es", { sensitivity: "base" })
  );

  for (const item of sorted) {
    const skuK = normSkuInventario(item.sku);
    const saldoActual = cantidadSaldoParaInsumoKit(item, params.saldoRows);
    const minRaw = minMap.get(skuK);
    const minimoEfectivo =
      minRaw != null && Number.isFinite(minRaw) && (minRaw as number) > 0 ? (minRaw as number) : null;
    const bajoMinimo = minimoEfectivo != null && saldoActual <= minimoEfectivo;

    const consumoVentana = consumoInsumoEnVentana(params.movimientos, item, desdeEpochSec);
    const promedioDiario = diasVentana > 0 ? consumoVentana / diasVentana : 0;
    const objetivoCobertura = promedioDiario * diasCobertura;

    let necesidad = Math.max(0, objetivoCobertura - saldoActual);
    if (minimoEfectivo != null && saldoActual < minimoEfectivo) {
      necesidad = Math.max(necesidad, minimoEfectivo - saldoActual);
    }
    if (bajoMinimo && necesidad <= 0 && minimoEfectivo != null) {
      necesidad = Math.max(objetivoCobertura, minimoEfectivo * 0.5, 1);
    }

    const unidadesPorEmpaque = unidadesPorEmpaqueInsumo(item);
    const enPaquetes = saldoSeLlevaEnPaquetes(item);

    /**
     * Saldo/consumo del POS en empaques = paquetes. El pedido a matriz es en paquetes enteros.
     * Si no hay empaque, se pide en la misma unidad del saldo (1 «paquete» = 1 und).
     */
    const paquetesPedir = redondearAMultiploEmpaque(necesidad, 1);
    if (paquetesPedir <= 0) continue;

    const saldoUnidadesEquiv =
      enPaquetes && unidadesPorEmpaque > 1
        ? Math.round(saldoActual * unidadesPorEmpaque * 1000) / 1000
        : null;
    const unidadesEquivPedir =
      enPaquetes && unidadesPorEmpaque > 1
        ? Math.round(paquetesPedir * unidadesPorEmpaque * 1000) / 1000
        : null;

    lineas.push({
      sku: item.sku,
      descripcion: item.descripcion,
      unidad: item.unidad,
      saldoActual: Math.round(saldoActual * 1000) / 1000,
      saldoUnidadesEquiv,
      minimoEfectivo,
      bajoMinimo,
      consumoVentana,
      promedioDiario: Math.round(promedioDiario * 1000) / 1000,
      objetivoCobertura: Math.round(objetivoCobertura * 1000) / 1000,
      unidadesPorEmpaque,
      saldoEnPaquetes: enPaquetes,
      paquetesPedir,
      unidadesEquivPedir,
    });
  }

  lineas.sort((a, b) => {
    if (a.bajoMinimo !== b.bajoMinimo) return a.bajoMinimo ? -1 : 1;
    return b.paquetesPedir - a.paquetesPedir;
  });

  let totalPaquetesPedir = 0;
  for (const l of lineas) totalPaquetesPedir += l.paquetesPedir;

  return {
    puntoVenta: params.puntoVenta,
    generadoIso: ahora.toISOString(),
    diasVentana,
    diasCobertura,
    lineas,
    resumen: {
      productosEvaluados: sorted.length,
      productosAPedir: lineas.length,
      totalPaquetesPedir: Math.round(totalPaquetesPedir * 1000) / 1000,
    },
  };
}
