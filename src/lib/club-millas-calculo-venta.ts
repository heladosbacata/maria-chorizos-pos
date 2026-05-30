/** Misma regla que WMS/POS: 1 milla por cada $9.000 COP de la factura. */
export const COP_POR_MILLA_CLUB = 9000;

export function millasGanadasPorMontoCop(montoTotalCop: number): number {
  const m = Math.round(montoTotalCop);
  if (!Number.isFinite(m) || m < COP_POR_MILLA_CLUB) return 0;
  return Math.floor(m / COP_POR_MILLA_CLUB);
}

export function millasSaldoProyectadoTrasCompra(
  millasActuales: number | undefined,
  montoTotalCop: number
): number | undefined {
  if (millasActuales === undefined || !Number.isFinite(millasActuales)) return undefined;
  return Math.max(0, Math.trunc(millasActuales)) + millasGanadasPorMontoCop(montoTotalCop);
}
