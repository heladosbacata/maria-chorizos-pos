/**
 * Precios POS con IVA incluido → desglose subtotal + IVA (misma lógica que el WMS en `posAlegraEmitirCobro`).
 * Tasa por defecto 19 %; alinear con `ALEGRA_POS_IVA_TASA` en el servidor usando `NEXT_PUBLIC_POS_IVA_TASA` si se usa otra.
 */

const TASA_IVA_DEFAULT = 0.19;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function getIvaTasaDecimalPosCliente(): number {
  const raw =
    typeof process !== "undefined" && process.env.NEXT_PUBLIC_POS_IVA_TASA != null
      ? String(process.env.NEXT_PUBLIC_POS_IVA_TASA).trim()
      : "";
  if (!raw) return TASA_IVA_DEFAULT;
  const n = parseFloat(raw.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0 || n > 0.5) return TASA_IVA_DEFAULT;
  return n;
}

export function resumenIvaDesdeTotalConIvaIncluido(totalConIva: number): {
  subtotalSinIva: number;
  iva: number;
  total: number;
  tasaDecimal: number;
  tasaPorcentaje: number;
} {
  const tasa = getIvaTasaDecimalPosCliente();
  const divisor = 1 + tasa;
  const total = round2(Math.max(0, Number(totalConIva) || 0));
  if (total <= 0) {
    return { subtotalSinIva: 0, iva: 0, total: 0, tasaDecimal: tasa, tasaPorcentaje: Math.round(tasa * 10_000) / 100 };
  }
  const subtotalSinIva = round2(total / divisor);
  const iva = round2(total - subtotalSinIva);
  return {
    subtotalSinIva,
    iva,
    total,
    tasaDecimal: tasa,
    tasaPorcentaje: Math.round(tasa * 10_000) / 100,
  };
}
