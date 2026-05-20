/**
 * Clave estable del punto de venta para IDs de documento y consultas en Firestore.
 * Los IDs no pueden contener "/" (se interpreta como segmento de ruta).
 */
export function puntoVentaFirestoreClave(puntoVenta: string): string {
  return puntoVenta
    .trim()
    .toLowerCase()
    .replace(/\//g, "-")
    .replace(/\\/g, "-")
    .replace(/\u0000/g, "");
}

/** Id de pedido normalizado para claves de chat (DOM-1234). */
export function pedidoIdChatClave(pedidoId: string): string {
  return pedidoId.trim().toUpperCase();
}
