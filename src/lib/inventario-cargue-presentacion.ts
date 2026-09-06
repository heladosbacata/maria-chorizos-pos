import type { InsumoKitItem } from "@/types/inventario-pos";
import { clasificarUnidadInventario } from "@/lib/inventario-valorizacion-unidades";

export type PresentacionCargueInventario = {
  /** El cajero debe indicar paquetes (no unidades sueltas). */
  esPaquete: boolean;
  /** Unds por paquete si se pudo inferir del SKU/nombre (ej. x6 → 6). */
  unidadesPorPaquete: number | null;
  labelCantidad: string;
  placeholderCantidad: string;
  labelPrecio: string;
  /** Texto corto bajo el precio / unidad. */
  labelUnidadCorta: string;
  /** Ayuda visible para evitar confusión und vs paquete. */
  ayuda: string;
};

function textoBusqueda(item: Pick<InsumoKitItem, "sku" | "descripcion" | "unidad">): string {
  return `${item.sku} ${item.descripcion} ${item.unidad}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function formatNumInventario(n: number): string {
  return n.toLocaleString("es-CO", { maximumFractionDigits: 3 });
}

/**
 * Extrae N de patrones tipo x6, X10, -X6, paquete x6, und x6.
 * No usa el número de contenido genérico (ej. 600ml).
 */
export function inferirUnidadesPorPaquete(texto: string): number | null {
  const t = texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const patterns = [
    /(?:^|[\s_\-·.])x\s*(\d{1,3})(?:\b|$)/i,
    /\bpaquete[s]?\s*(?:de\s*)?(\d{1,3})\b/i,
    /\b(\d{1,3})\s*(?:und|unidades?)\s*(?:por\s*)?(?:paq|paquete)/i,
    /\bpaq(?:uete)?s?\s*x\s*(\d{1,3})\b/i,
  ];
  for (const re of patterns) {
    const m = re.exec(t);
    if (!m?.[1]) continue;
    const n = Number(m[1]);
    if (Number.isFinite(n) && n >= 2 && n <= 500) return n;
  }
  return null;
}

export function itemParecePaqueteCargue(
  item: Pick<InsumoKitItem, "sku" | "descripcion" | "unidad">
): boolean {
  const t = textoBusqueda(item);
  const und = (item.unidad ?? "").trim().toLowerCase();
  if (/\b(paq|paquete|pack|bulto|caja)\b/.test(und)) return true;
  if (/\bpaquete/.test(t)) return true;
  if (inferirUnidadesPorPaquete(`${item.sku} ${item.descripcion}`) != null) return true;
  return false;
}

export type VistaSaldoEmpaque = {
  /** Factor xN del empaque de matriz; null si no aplica. */
  unidadesPorPaquete: number | null;
  /**
   * Producto de empaque (x6, x100…): la UI muestra paquetes+unidades.
   * El saldo del sistema / WMS está en **unidades sueltas**.
   */
  saldoEnPaquetes: boolean;
  /** Paquetes enteros (sin decimales). */
  paquetes: number | null;
  /** Unidades sueltas fuera de paquetes enteros (0…N-1). */
  unidadesSueltas: number | null;
  /** Total de unidades (saldo del sistema). */
  unidadesEquivalentes: number | null;
  /** Línea principal (ej. «14 paquetes + 1 unidad»). */
  textoPrincipal: string;
  /** Línea secundaria (ej. «85 und en total · x6»). */
  textoSecundario: string | null;
  /** Etiqueta corta para columna Unidad. */
  labelUnidad: string;
};

/**
 * Parte un saldo en **unidades** a paquetes enteros + unidades sueltas.
 * Ej.: 85 und con x6 → 14 paquetes + 1 unidad.
 */
export function desglosarSaldoUnidades(
  saldoUnidades: number,
  unidadesPorPaquete: number
): { paquetesEnteros: number; unidadesSueltas: number; totalUnidades: number } {
  const n = unidadesPorPaquete >= 2 ? unidadesPorPaquete : 1;
  const totalUnidades = Math.max(0, Math.round(Number(saldoUnidades) || 0));
  const paquetesEnteros = Math.floor(totalUnidades / n);
  const unidadesSueltas = totalUnidades % n;
  return { paquetesEnteros, unidadesSueltas, totalUnidades };
}

/** @deprecated Usar desglosarSaldoUnidades (el saldo del sistema es en und). */
export function desglosarSaldoPaquetes(
  saldoPaquetes: number,
  unidadesPorPaquete: number
): { paquetesEnteros: number; unidadesSueltas: number; totalUnidades: number } {
  const n = unidadesPorPaquete >= 2 ? unidadesPorPaquete : 1;
  return desglosarSaldoUnidades(saldoPaquetes * n, n);
}

function textoPaquetesYUnidades(paquetesEnteros: number, unidadesSueltas: number): string {
  const paqTxt =
    paquetesEnteros === 1 ? "1 paquete" : `${paquetesEnteros.toLocaleString("es-CO")} paquetes`;
  if (unidadesSueltas <= 0) return paqTxt;
  const undTxt = unidadesSueltas === 1 ? "1 unidad" : `${unidadesSueltas.toLocaleString("es-CO")} unidades`;
  if (paquetesEnteros <= 0) return undTxt;
  return `${paqTxt} + ${undTxt}`;
}

/** Cargue: paquetes escritos por el cajero → unidades a guardar (WMS descuenta und). */
export function cantidadUnidadesDesdeCarguePaquetes(
  cantidadPaquetes: number,
  unidadesPorPaquete: number
): number {
  const n = unidadesPorPaquete >= 2 ? unidadesPorPaquete : 1;
  return Math.round(cantidadPaquetes * n * 1000) / 1000;
}

/** Precio por paquete → precio por unidad de saldo (para costo medio). */
export function precioUnitarioDesdePrecioPaquete(
  precioPaquete: number,
  unidadesPorPaquete: number
): number {
  const n = unidadesPorPaquete >= 2 ? unidadesPorPaquete : 1;
  return Math.round((precioPaquete / n) * 100) / 100;
}

/**
 * Presenta el saldo (en unidades del sistema) como paquetes enteros + unidades sueltas.
 */
export function vistaSaldoConEmpaque(
  saldo: number,
  item: Pick<InsumoKitItem, "sku" | "descripcion" | "unidad">
): VistaSaldoEmpaque {
  const n = inferirUnidadesPorPaquete(`${item.sku} ${item.descripcion}`);
  const esPaquete = itemParecePaqueteCargue(item) || (n != null && n >= 2);
  const saldoR = Math.round(saldo * 1000) / 1000;

  if (esPaquete && n != null && n >= 2) {
    const { paquetesEnteros, unidadesSueltas, totalUnidades } = desglosarSaldoUnidades(saldoR, n);
    return {
      unidadesPorPaquete: n,
      saldoEnPaquetes: true,
      paquetes: paquetesEnteros,
      unidadesSueltas,
      unidadesEquivalentes: totalUnidades,
      textoPrincipal: textoPaquetesYUnidades(paquetesEnteros, unidadesSueltas),
      textoSecundario: `${totalUnidades.toLocaleString("es-CO")} und en total · x${n}`,
      labelUnidad: `paq. x${n}`,
    };
  }

  const unidadClas = clasificarUnidadInventario(item.unidad ?? "", item.descripcion ?? "", item.sku ?? "");
  if (unidadClas === "ml") {
    const mlEnteros = Math.round(saldoR);
    const litros = Math.round((mlEnteros / 1000) * 1000) / 1000;
    return {
      unidadesPorPaquete: null,
      saldoEnPaquetes: false,
      paquetes: null,
      unidadesSueltas: null,
      unidadesEquivalentes: mlEnteros,
      textoPrincipal: `${mlEnteros.toLocaleString("es-CO")} ml`,
      textoSecundario: `${formatNumInventario(litros)} L`,
      labelUnidad: "ml",
    };
  }

  const u = (item.unidad ?? "").trim() || "und";
  const entero = Number.isInteger(saldoR) ? saldoR : Math.round(saldoR * 1000) / 1000;
  return {
    unidadesPorPaquete: n,
    saldoEnPaquetes: false,
    paquetes: null,
    unidadesSueltas: null,
    unidadesEquivalentes: entero,
    textoPrincipal: `${formatNumInventario(entero)} ${u}`,
    textoSecundario: null,
    labelUnidad: u,
  };
}

/**
 * Presentación UX del cargue: el cajero escribe paquetes; al guardar se multiplica ×xN
 * porque el saldo del sistema y el ensamble WMS trabajan en unidades.
 */
export function presentacionCargueInventario(
  item: Pick<InsumoKitItem, "sku" | "descripcion" | "unidad"> | null | undefined
): PresentacionCargueInventario {
  if (!item) {
    return {
      esPaquete: false,
      unidadesPorPaquete: null,
      labelCantidad: "Cantidad",
      placeholderCantidad: "—",
      labelPrecio: "Precio de compra (COP / unidad)",
      labelUnidadCorta: "und",
      ayuda: "",
    };
  }

  const unidadesPorPaquete = inferirUnidadesPorPaquete(`${item.sku} ${item.descripcion}`);
  const esPaquete = itemParecePaqueteCargue(item);

  if (!esPaquete) {
    const unidadClas = clasificarUnidadInventario(
      item.unidad ?? "",
      item.descripcion ?? "",
      item.sku ?? ""
    );
    if (unidadClas === "ml") {
      return {
        esPaquete: false,
        unidadesPorPaquete: null,
        labelCantidad: "Cantidad (ml)",
        placeholderCantidad: "Ej. 1000",
        labelPrecio: "Precio de compra (COP / litro)",
        labelUnidadCorta: "ml",
        ayuda:
          "Indique mililitros (ej. 1000 = 1 L). El precio de la hoja es por litro; el valor del cargue se calcula como ml÷1000×precio.",
      };
    }
    if (unidadClas === "g") {
      return {
        esPaquete: false,
        unidadesPorPaquete: null,
        labelCantidad: "Cantidad (g)",
        placeholderCantidad: "Ej. 1000",
        labelPrecio: "Precio de compra (COP / kg)",
        labelUnidadCorta: "g",
        ayuda:
          "Indique gramos. Si el precio es por kilo, el valor del cargue se calcula como g÷1000×precio.",
      };
    }
    const u = (item.unidad ?? "").trim() || "und";
    return {
      esPaquete: false,
      unidadesPorPaquete: null,
      labelCantidad: "Cantidad",
      placeholderCantidad: "Ej. 10",
      labelPrecio: `Precio de compra (COP / ${u})`,
      labelUnidadCorta: u,
      ayuda: `Indique cuántas unidades (${u}) llegaron.`,
    };
  }

  const nTxt = unidadesPorPaquete != null ? String(unidadesPorPaquete) : "varias";
  return {
    esPaquete: true,
    unidadesPorPaquete,
    labelCantidad: "Cantidad de paquetes",
    placeholderCantidad: "Ej. 10 paquetes",
    labelPrecio: "Precio de compra (COP / paquete)",
    labelUnidadCorta: unidadesPorPaquete != null ? `paquete (x${unidadesPorPaquete})` : "paquete",
    ayuda:
      unidadesPorPaquete != null
        ? `Escriba cuántos paquetes llegaron. Al guardar se registran ${nTxt} und por paquete (el WMS descuenta 1 und por cada arepa/unidad vendida).`
        : "Escriba cuántos paquetes llegaron. Al guardar se convierten a unidades para que el ensamble WMS descuente bien.",
  };
}
