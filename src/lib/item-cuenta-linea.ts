/** Cálculo de totales por línea en la cuenta POS (precio editado, descuento % o $, cargo). */

export type DescuentoModoLinea = "ninguno" | "pesos" | "porcentaje";

export interface ItemLineInput {
  cantidad: number;
  precioCatalogo: number;
  precioUnitarioOverride?: number;
  descuentoModo?: DescuentoModoLinea;
  /** Pesos de descuento sobre la línea, o porcentaje 0–100 según modo. */
  descuentoValor?: number;
  cargo1?: string;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function precioUnitarioEfectivo(it: ItemLineInput): number {
  const p = it.precioUnitarioOverride ?? it.precioCatalogo;
  return Number.isFinite(p) && p > 0 ? p : it.precioCatalogo;
}

export function totalBrutoLinea(it: ItemLineInput): number {
  const q = Math.max(0, it.cantidad);
  return round2(precioUnitarioEfectivo(it) * q);
}

export function montoDescuentoLinea(it: ItemLineInput): number {
  const bruto = totalBrutoLinea(it);
  const modo = it.descuentoModo ?? "ninguno";
  const v = it.descuentoValor ?? 0;
  if (modo === "ninguno" || v <= 0 || bruto <= 0) return 0;
  if (modo === "pesos") return Math.min(round2(v), bruto);
  if (modo === "porcentaje") {
    const pct = Math.min(100, Math.max(0, v));
    return Math.min(round2(bruto * (pct / 100)), bruto);
  }
  return 0;
}

/** Cargos adicionales por línea (extensible). Por ahora solo «ninguno». */
export function montoCargoLinea(_it: ItemLineInput): number {
  return 0;
}

export function subtotalNetoLinea(it: ItemLineInput): number {
  return Math.max(0, round2(totalBrutoLinea(it) - montoDescuentoLinea(it) + montoCargoLinea(it)));
}

export function lineInputDesdeItemCuentaLike(it: {
  cantidad: number;
  producto: { precioUnitario: number };
  precioUnitarioOverride?: number;
  descuentoModo?: DescuentoModoLinea;
  descuentoValor?: number;
  cargo1?: string;
}): ItemLineInput {
  return {
    cantidad: it.cantidad,
    precioCatalogo: it.producto.precioUnitario,
    precioUnitarioOverride: it.precioUnitarioOverride,
    descuentoModo: it.descuentoModo ?? "ninguno",
    descuentoValor: it.descuentoValor ?? 0,
    cargo1: it.cargo1 ?? "ninguno",
  };
}
