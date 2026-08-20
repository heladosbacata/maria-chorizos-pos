/**
 * Nombres genéricos que el POS no debe tratar como punto de venta real.
 * «Franquiciado» es un cargo; «Cajero N» es el terminal.
 */
export function pareceEtiquetaCajeroNoPunto(pv: string): boolean {
  const s = String(pv ?? "").trim();
  if (!s) return false;
  if (/^(cajero|caja)\s*\d*$/i.test(s)) return true;
  if (/^franquiciad[oa]s?$/i.test(s)) return true;
  return false;
}

/** @deprecated No usar como catálogo de locales; el PV real viene de Firestore / WMS. */
export const PUNTOS_DE_VENTA: readonly string[] = [];

export type PuntoVentaNombre = string;
