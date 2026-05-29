/**
 * Slug estable para QR impresos de domicilios.
 *
 * La URL pública puede cambiar de infraestructura, pero el slug debe ser el
 * identificador impreso en volantes. Si algún punto cambia de nombre, se puede
 * agregar aquí una equivalencia slug -> puntoVenta sin reimprimir QR.
 */
export const PUNTO_VENTA_POR_SLUG_DOMICILIOS: Record<string, string> = {};

export function slugDomiciliosPuntoVenta(puntoVenta: string): string {
  const slug = puntoVenta
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "punto";
}

export function puntoVentaDesdeSlugDomicilios(slug: string, fallback?: string | null): string {
  const limpio = slugDomiciliosPuntoVenta(slug);
  const directo = PUNTO_VENTA_POR_SLUG_DOMICILIOS[limpio];
  if (directo?.trim()) return directo.trim();
  if (fallback?.trim()) return fallback.trim();
  return limpio
    .split("-")
    .filter(Boolean)
    .map((parte) => parte.charAt(0).toUpperCase() + parte.slice(1))
    .join(" ");
}
