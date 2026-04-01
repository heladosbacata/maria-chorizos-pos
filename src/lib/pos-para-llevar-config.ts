/**
 * SKUs opcionales del catálogo (hoja DB_Franquicia_Insumos_Kit / Firestore) para descontar empaques
 * al marcar «Producto para llevar». Si faltan en .env, el POS intenta reconocer ítems por nombre en el catálogo.
 */

export function skuBolsaPapelParaLlevarEnv(): string | null {
  const s = process.env.NEXT_PUBLIC_POS_SKU_BOLSA_PAPEL?.trim() ?? "";
  return s || null;
}

export function skuStickerDomicilioParaLlevarEnv(): string | null {
  const s = process.env.NEXT_PUBLIC_POS_SKU_STICKER_DOMICILIO?.trim() ?? "";
  return s || null;
}

/**
 * @deprecated Usar skuBolsaPapelParaLlevarEnv / skuStickerDomicilioParaLlevarEnv + resolvers de catálogo.
 * Solo true cuando ambas env están definidas (compatibilidad).
 */
export function skusConsumoParaLlevar(): { bolsaPapel: string; stickerDomicilio: string } | null {
  const bolsaPapel = skuBolsaPapelParaLlevarEnv();
  const stickerDomicilio = skuStickerDomicilioParaLlevarEnv();
  if (!bolsaPapel || !stickerDomicilio) return null;
  return { bolsaPapel, stickerDomicilio };
}

/** Sticker / tarjeta de fidelización (catálogo insumos). Se descuenta al activar «Soy cliente frecuente» en registrar pago. */
export function skuStickerFidelizacion(): string | null {
  const s = process.env.NEXT_PUBLIC_POS_SKU_STICKER_FIDELIZACION?.trim() ?? "";
  return s || null;
}
