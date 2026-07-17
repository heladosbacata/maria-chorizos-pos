/** Descuento fijo del código promocional influencer en cobro POS (bajo «Soy cliente frecuente»). */

export const INFLUENCER_PROMO_DESCUENTO_PCT = 10;

export function normalizarCodigoInfluencer(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

export function esCodigoInfluencerValido(raw: string): boolean {
  return normalizarCodigoInfluencer(raw).length >= 3;
}

/** Monto a descontar (10 % del total), redondeado a pesos enteros. */
export function calcularDescuentoInfluencerMonto(total: number): number {
  if (!(total > 0) || !Number.isFinite(total)) return 0;
  return Math.max(0, Math.round((total * INFLUENCER_PROMO_DESCUENTO_PCT) / 100));
}

export function totalConDescuentoInfluencer(total: number): number {
  if (!(total > 0) || !Number.isFinite(total)) return 0;
  return Math.max(0, Math.round(total - calcularDescuentoInfluencerMonto(total)));
}
