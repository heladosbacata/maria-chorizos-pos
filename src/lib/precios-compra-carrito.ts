import { normSkuInventario } from "@/lib/inventario-pos-firestore";
import type { InsumoKitItem } from "@/types/inventario-pos";

/** Producto del carrito de compras (app móvil / web / WMS — hoja DB_Carrito). */
export type ProductoCarritoPrecio = {
  sku?: string;
  precio?: number;
  precioPromo?: number;
  promo?: boolean;
};

export function precioEfectivoCarrito(p: ProductoCarritoPrecio): number | null {
  if (p.promo && p.precioPromo != null && p.precioPromo > 0) {
    return Math.round(p.precioPromo * 100) / 100;
  }
  const pr = Number(p.precio);
  return Number.isFinite(pr) && pr > 0 ? Math.round(pr * 100) / 100 : null;
}

export function buildMapaPreciosCarritoPorSku(productos: ProductoCarritoPrecio[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const p of productos) {
    const precio = precioEfectivoCarrito(p);
    if (precio == null) continue;
    const k = normSkuInventario(String(p.sku ?? ""));
    if (k) map.set(k, precio);
  }
  return map;
}

export function precioCompraCarritoParaInsumo(item: InsumoKitItem, mapa: Map<string, number>): number | null {
  const k = normSkuInventario(item.sku);
  if (k && mapa.has(k)) return mapa.get(k)!;
  const kid = normSkuInventario(item.id);
  if (kid && mapa.has(kid)) return mapa.get(kid)!;
  return null;
}

/** Precios de compra sugeridos por id de ítem del catálogo (solo filas con match en carrito). */
export function preciosCompraInicialesDesdeCarrito(
  insumos: InsumoKitItem[],
  mapa: Map<string, number>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const it of insumos) {
    const p = precioCompraCarritoParaInsumo(it, mapa);
    if (p != null) out[it.id] = String(p);
  }
  return out;
}

/** Fusiona precios del carrito sin pisar celdas que el usuario ya editó. */
export function mergePreciosCompraConCarrito(
  prev: Record<string, string>,
  insumos: InsumoKitItem[],
  mapa: Map<string, number>
): Record<string, string> {
  const sugeridos = preciosCompraInicialesDesdeCarrito(insumos, mapa);
  const out = { ...sugeridos };
  for (const [id, val] of Object.entries(prev)) {
    if ((val ?? "").trim() !== "") out[id] = val;
  }
  return out;
}
