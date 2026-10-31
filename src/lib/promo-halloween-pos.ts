import { ymdColombia } from "@/lib/fecha-colombia";

/** 30 y 31 de octubre, y 1 de noviembre (hora de Colombia). */
const DIAS_PROMO = new Set(["10-30", "10-31", "11-01"]);

export type ProductoPromoHalloweenRef = {
  sku?: string;
  descripcion?: string;
};

function norm(value: string | undefined): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function esVentanaPromoHalloween(ahora: Date = new Date()): boolean {
  const ymd = ymdColombia(ahora);
  const md = ymd.slice(5);
  return DIAS_PROMO.has(md);
}

/** Promoción Halloween del catálogo POS (sku promoha o nombre con Halloween). */
export function esProductoPromoHalloween(producto: ProductoPromoHalloweenRef): boolean {
  const sku = norm(producto.sku);
  const desc = norm(producto.descripcion);
  if (sku === "promoha" || sku.includes("halloween")) return true;
  return desc.includes("halloween");
}

export function priorizarPromoHalloween<T extends ProductoPromoHalloweenRef>(
  productos: T[],
  ahora: Date = new Date()
): T[] {
  if (!esVentanaPromoHalloween(ahora)) return productos;
  const promo: T[] = [];
  const resto: T[] = [];
  for (const producto of productos) {
    if (esProductoPromoHalloween(producto)) promo.push(producto);
    else resto.push(producto);
  }
  if (promo.length === 0) return productos;
  return [...promo, ...resto];
}
