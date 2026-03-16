/**
 * Lista inicial de puntos de venta (quemada).
 * Se usa cuando el usuario no tiene puntoVenta en Firestore.
 */
export const PUNTOS_DE_VENTA = [
  "Caja 1",
  "Caja 2",
  "Caja 3",
  "Tienda Principal",
  "Punto Externo",
] as const;

export type PuntoVentaNombre = (typeof PUNTOS_DE_VENTA)[number];
