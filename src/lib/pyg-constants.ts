export const PYG_FEE_MENSUAL_DEFAULT = 100_000;

export function resolverFeeMensualPyg(guardado?: number | null): number {
  const n = Number(guardado) || 0;
  return n > 0 ? Math.round(n) : PYG_FEE_MENSUAL_DEFAULT;
}
