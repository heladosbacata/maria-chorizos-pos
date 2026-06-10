import { normSkuInventario } from "@/lib/inventario-pos-firestore";
import type { InsumoKitItem } from "@/types/inventario-pos";

/** Producto del carrito de compras (app móvil / web / WMS — hoja DB_Carrito). */
export type ProductoCarritoPrecio = {
  sku?: string;
  producto?: string;
  precio?: number;
  precioPromo?: number;
  promo?: boolean;
};

export type MapaPreciosCarrito = {
  porSku: Map<string, number>;
  porNombre: Map<string, number>;
};

export function mapaPreciosCarritoVacio(): MapaPreciosCarrito {
  return { porSku: new Map(), porNombre: new Map() };
}

/** Primer segmento del nombre (antes de coma) normalizado para cruce con insumos FRAN-KIT. */
export function normNombreProductoInventario(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[,|;/]/)[0]!
    .replace(/\s+/g, " ")
    .trim();
}

export function precioEfectivoCarrito(p: ProductoCarritoPrecio): number | null {
  if (p.promo && p.precioPromo != null && p.precioPromo > 0) {
    return Math.round(p.precioPromo * 100) / 100;
  }
  const pr = Number(p.precio);
  return Number.isFinite(pr) && pr > 0 ? Math.round(pr * 100) / 100 : null;
}

export function buildMapaPreciosCarrito(productos: ProductoCarritoPrecio[]): MapaPreciosCarrito {
  const porSku = new Map<string, number>();
  const porNombre = new Map<string, number>();
  for (const p of productos) {
    const precio = precioEfectivoCarrito(p);
    if (precio == null) continue;
    const k = normSkuInventario(String(p.sku ?? ""));
    if (k) porSku.set(k, precio);
    const nombre = normNombreProductoInventario(String(p.producto ?? ""));
    if (nombre && !porNombre.has(nombre)) porNombre.set(nombre, precio);
  }
  return { porSku, porNombre };
}

/** @deprecated Usar buildMapaPreciosCarrito */
export function buildMapaPreciosCarritoPorSku(productos: ProductoCarritoPrecio[]): Map<string, number> {
  return buildMapaPreciosCarrito(productos).porSku;
}

export function precioCompraCarritoParaInsumo(item: InsumoKitItem, mapa: MapaPreciosCarrito): number | null {
  const skuKeys = [item.skuCarrito, item.sku].filter(Boolean) as string[];
  for (const raw of skuKeys) {
    const k = normSkuInventario(raw);
    if (k && mapa.porSku.has(k)) return mapa.porSku.get(k)!;
  }
  const kid = normSkuInventario(item.id);
  if (kid && mapa.porSku.has(kid)) return mapa.porSku.get(kid)!;

  const nombre = normNombreProductoInventario(item.descripcion);
  if (nombre && mapa.porNombre.has(nombre)) return mapa.porNombre.get(nombre)!;

  return null;
}

/** Precio definido en DB_Franquicia_Insumos_Kit (columna PRECIO_COMPRA_UNITARIO). */
export function precioCompraDesdeHojaInsumo(item: InsumoKitItem): number | null {
  const p = item.precioCompraUnitario;
  if (p != null && Number.isFinite(p) && p > 0) return Math.round(p * 100) / 100;
  return null;
}

/**
 * Precio de compra para cargue inventario: primero hoja insumos, luego DB_Carrito (respaldo).
 */
export function precioCompraParaInsumo(
  item: InsumoKitItem,
  mapaCarrito: MapaPreciosCarrito = mapaPreciosCarritoVacio()
): number | null {
  const hoja = precioCompraDesdeHojaInsumo(item);
  if (hoja != null) return hoja;
  return precioCompraCarritoParaInsumo(item, mapaCarrito);
}

export function contarInsumosConPrecioHoja(insumos: InsumoKitItem[]): number {
  let n = 0;
  for (const it of insumos) {
    if (precioCompraDesdeHojaInsumo(it) != null) n += 1;
  }
  return n;
}

export function contarInsumosConPrecioCompra(
  insumos: InsumoKitItem[],
  mapaCarrito: MapaPreciosCarrito = mapaPreciosCarritoVacio()
): number {
  let n = 0;
  for (const it of insumos) {
    if (precioCompraParaInsumo(it, mapaCarrito) != null) n += 1;
  }
  return n;
}

/** @deprecated Usar contarInsumosConPrecioCompra */
export function contarInsumosConPrecioCarrito(insumos: InsumoKitItem[], mapa: MapaPreciosCarrito): number {
  return contarInsumosConPrecioCompra(insumos, mapa);
}

/** Precios de compra sugeridos por id de ítem del catálogo (solo filas con match en carrito). */
export function preciosCompraInicialesDesdeCarrito(
  insumos: InsumoKitItem[],
  mapa: MapaPreciosCarrito
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const it of insumos) {
    const p = precioCompraParaInsumo(it, mapa);
    if (p != null) out[it.id] = String(p);
  }
  return out;
}

/** Fusiona precios del carrito sin pisar celdas que el usuario ya editó. */
export function mergePreciosCompraConCarrito(
  prev: Record<string, string>,
  insumos: InsumoKitItem[],
  mapa: MapaPreciosCarrito
): Record<string, string> {
  const sugeridos = preciosCompraInicialesDesdeCarrito(insumos, mapa);
  const out = { ...sugeridos };
  for (const [id, val] of Object.entries(prev)) {
    if ((val ?? "").trim() !== "") out[id] = val;
  }
  return out;
}

export function formatPrecioCompraCop(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return "—";
  return n.toLocaleString("es-CO", { maximumFractionDigits: 0 });
}
