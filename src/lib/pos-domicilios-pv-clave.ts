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
