/**
 * Migración única: saldos de productos xN que se guardaron como «paquetes»
 * → unidades (×xN), alineado con el descuento WMS por unidad vendida.
 */

import {
  inferirUnidadesPorPaquete,
  itemParecePaqueteCargue,
} from "@/lib/inventario-cargue-presentacion";
import {
  registrarMovimientoInventario,
  saldoMostradoYFuenteParaInsumoKit,
  type InventarioSaldoConFuente,
  type InventarioSaldoRow,
} from "@/lib/inventario-pos-firestore";
import type { InsumoKitItem } from "@/types/inventario-pos";

export const CLAVE_MIGRACION_PAQ_A_UND = "pos_inv_migrado_paq_a_und_v1";

export function claveMigracionPaqAUnd(puntoVenta: string, uid: string): string {
  return `${CLAVE_MIGRACION_PAQ_A_UND}:${uid}:${puntoVenta.trim()}`;
}

export function migracionPaqAUndYaHecha(puntoVenta: string, uid: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(claveMigracionPaqAUnd(puntoVenta, uid)) === "1";
  } catch {
    return false;
  }
}

export function marcarMigracionPaqAUndHecha(puntoVenta: string, uid: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(claveMigracionPaqAUnd(puntoVenta, uid), "1");
  } catch {
    /* ignore */
  }
}

export type LineaMigracionPaqAUnd = {
  insumo: InsumoKitItem;
  saldoAntes: number;
  unidadesPorPaquete: number;
  saldoDespues: number;
  delta: number;
};

/** delta = saldo × (N−1) para pasar de paquetes a unidades. */
export function planMigracionPaquetesAUnidades(params: {
  insumos: InsumoKitItem[];
  saldoRows: InventarioSaldoRow[];
  saldosPorClaveMap: Map<string, InventarioSaldoConFuente>;
}): LineaMigracionPaqAUnd[] {
  const out: LineaMigracionPaqAUnd[] = [];
  for (const insumo of params.insumos) {
    const n = inferirUnidadesPorPaquete(`${insumo.sku} ${insumo.descripcion}`);
    if (n == null || n < 2) continue;
    if (!itemParecePaqueteCargue(insumo) && n < 2) continue;
    const { saldo } = saldoMostradoYFuenteParaInsumoKit(
      insumo,
      params.saldosPorClaveMap,
      params.saldoRows
    );
    if (!Number.isFinite(saldo) || Math.abs(saldo) < 1e-9) continue;
    const saldoDespues = Math.round(saldo * n * 1000) / 1000;
    const delta = Math.round((saldoDespues - saldo) * 1000) / 1000;
    if (Math.abs(delta) < 1e-9) continue;
    out.push({
      insumo,
      saldoAntes: Math.round(saldo * 1000) / 1000,
      unidadesPorPaquete: n,
      saldoDespues,
      delta,
    });
  }
  return out.sort((a, b) => a.insumo.descripcion.localeCompare(b.insumo.descripcion, "es"));
}

export async function ejecutarMigracionPaquetesAUnidades(params: {
  puntoVenta: string;
  uid: string;
  email: string | null;
  lineas: LineaMigracionPaqAUnd[];
}): Promise<{ ok: number; fallidos: string[] }> {
  const fallidos: string[] = [];
  let ok = 0;
  for (const line of params.lineas) {
    if (line.delta === 0) continue;
    const r =
      line.delta > 0
        ? await registrarMovimientoInventario({
            puntoVenta: params.puntoVenta,
            insumo: line.insumo,
            tipo: "ajuste_positivo",
            cantidad: line.delta,
            notas: `[Migración] Paquetes→unidades ×${line.unidadesPorPaquete}: ${line.saldoAntes} paq. → ${line.saldoDespues} und`,
            uid: params.uid,
            email: params.email,
            permitirNegativo: true,
          })
        : await registrarMovimientoInventario({
            puntoVenta: params.puntoVenta,
            insumo: line.insumo,
            tipo: "ajuste_negativo",
            cantidad: Math.abs(line.delta),
            notas: `[Migración] Paquetes→unidades ×${line.unidadesPorPaquete}: ${line.saldoAntes} paq. → ${line.saldoDespues} und`,
            uid: params.uid,
            email: params.email,
            permitirNegativo: true,
          });
    if (r.ok) ok += 1;
    else fallidos.push(`${line.insumo.sku}: ${r.message ?? "error"}`);
  }
  return { ok, fallidos };
}
