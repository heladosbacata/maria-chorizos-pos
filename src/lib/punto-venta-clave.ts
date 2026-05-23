/** Clave estable para comparar puntos de venta (mayúsculas / espacios). */
export function normalizarPuntoVentaClave(pv: string): string {
  return pv.trim().toLowerCase().replace(/\s+/g, " ");
}

export function puntoVentaCoincide(a: string | undefined | null, b: string | undefined | null): boolean {
  const na = normalizarPuntoVentaClave(a ?? "");
  const nb = normalizarPuntoVentaClave(b ?? "");
  return Boolean(na && nb && na === nb);
}
