import { ymdColombia } from "@/lib/fecha-colombia";
import { normalizarPuntoVentaClave } from "@/lib/punto-venta-clave";

/** 30 y 31 de octubre, y 1 de noviembre (hora de Colombia). */
const DIAS_PROMO = new Set(["10-30", "10-31", "11-01"]);

/** Unidades de la promo por punto de venta, cada año. */
export const PROMO_HALLOWEEN_CUPO_MAX = 5;

export const EVENTO_CUPO_PROMO_HALLOWEEN = "pos-promo-halloween-cupo";

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

/** Documento de cupo del punto, separado por año para que el 30 de octubre siguiente vuelva a 5. */
export function idDocumentoCupoPromoHalloween(puntoVenta: string, ahora: Date = new Date()): string {
  const anio = ymdColombia(ahora).slice(0, 4);
  const base = normalizarPuntoVentaClave(puntoVenta)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  return `${base || "punto"}__promoha__${anio}`;
}

export function disponiblesPromoHalloween(
  vendidos: number,
  cupoMax: number = PROMO_HALLOWEEN_CUPO_MAX
): number {
  const v = Number.isFinite(vendidos) ? Math.max(0, Math.floor(vendidos)) : 0;
  const max = Number.isFinite(cupoMax) ? Math.max(0, Math.floor(cupoMax)) : PROMO_HALLOWEEN_CUPO_MAX;
  return Math.max(0, max - v);
}

export function textoMarcadorPromoHalloween(disponibles: number | null): string {
  if (disponibles == null) return "Disponible: …";
  const n = Math.max(0, Math.floor(disponibles));
  if (n <= 0) return "Promo no disponible";
  return `Disponible: ${n} ${n === 1 ? "unidad" : "unidades"}`;
}

type ItemPromoRef = {
  cantidad: number;
  sku?: string;
  descripcion?: string;
  producto?: ProductoPromoHalloweenRef;
};

export function cantidadUnidadesPromoHalloween(items: ItemPromoRef[]): number {
  let total = 0;
  for (const item of items) {
    const sku = item.producto?.sku ?? item.sku;
    const descripcion = item.producto?.descripcion ?? item.descripcion;
    if (!esProductoPromoHalloween({ sku, descripcion })) continue;
    const cantidad = Number(item.cantidad);
    if (Number.isFinite(cantidad) && cantidad > 0) total += Math.round(cantidad);
  }
  return total;
}
