/** Parsea texto tipo "10.000,50" o "10000" a número (pesos). */
export function parsePesosCopInput(s: string): number {
  const t = String(s ?? "")
    .trim()
    .replace(/[^\d.,-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const n = parseFloat(t);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

export function formatPesosCop(n: number, conDecimales = true): string {
  return n.toLocaleString("es-CO", {
    minimumFractionDigits: conDecimales ? 2 : 0,
    maximumFractionDigits: conDecimales ? 2 : 0,
  });
}
