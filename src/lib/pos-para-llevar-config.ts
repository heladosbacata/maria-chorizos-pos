/**
 * SKUs del catálogo de inventario (hoja DB_Franquicia_Insumos_Kit / Firestore)
 * para descontar empaques al marcar «Producto para llevar» en caja.
 */
export function skusConsumoParaLlevar(): { bolsaPapel: string; stickerDomicilio: string } | null {
  const bolsaPapel = process.env.NEXT_PUBLIC_POS_SKU_BOLSA_PAPEL?.trim() ?? "";
  const stickerDomicilio = process.env.NEXT_PUBLIC_POS_SKU_STICKER_DOMICILIO?.trim() ?? "";
  if (!bolsaPapel || !stickerDomicilio) return null;
  return { bolsaPapel, stickerDomicilio };
}

/** Sticker / tarjeta de fidelización (catálogo insumos). Se descuenta al activar «Soy cliente frecuente» en registrar pago. */
export function skuStickerFidelizacion(): string | null {
  const s = process.env.NEXT_PUBLIC_POS_SKU_STICKER_FIDELIZACION?.trim() ?? "";
  return s || null;
}
