/**
 * Lista de puntos de venta (franquicia) en selects del POS.
 * Se usa al elegir punto tras login y en administración de usuarios.
 */
export const PUNTOS_DE_VENTA = [
  "Cajero 1",
  "Cajero 2",
  "Cajero 3",
  "Franquiciado",
] as const;

export type PuntoVentaNombre = (typeof PUNTOS_DE_VENTA)[number];
