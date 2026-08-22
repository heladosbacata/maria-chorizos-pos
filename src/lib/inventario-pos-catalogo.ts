import { buildLineIdPos } from "@/lib/chorizo-variante-pos";
import { normSkuInventario } from "@/lib/inventario-pos-firestore";
import { precioEfectivoCarrito, type ProductoCarritoPrecio } from "@/lib/precios-compra-carrito";
import type { ProductoPOS } from "@/types";
import type { InsumoKitItem } from "@/types/inventario-pos";

const CATEGORIA_POS_PRODUCTOS = "db_pos_productos";

/** Rubros de catálogo que representan productos de venta/ensamble, no insumos cargables. */
const RUBRO_ENSAMBLE_RE = /\b(ensamble|combo|paquete|producto\s*pos|producto\s*terminado|venta|bebida|combo|paquetes)\b/i;
/** Rubros administrativos del franquiciado; no hacen parte de recetas de ensamble POS. */
const RUBRO_UTIL_FRANQUICIADO_RE =
  /\b(operacion|aseo|inocuidad|dotacion|seguridad|administrativo|papeleria|limpieza|residuos)\b/i;

function textoSinAcentos(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Ítem derivado del catálogo POS o marcado como ensamble/paquete (no es insumo cargable). */
export function itemEsEnsambleOCatalogoPos(item: InsumoKitItem): boolean {
  const cat = (item.categoria ?? "").trim();
  const catNorm = textoSinAcentos(cat);
  if (catNorm === CATEGORIA_POS_PRODUCTOS) return true;
  if (cat && RUBRO_ENSAMBLE_RE.test(cat)) return true;
  // Variantes POS: «SKU · Etiqueta» (p. ej. GAS-PV-6 · Con Gas).
  if (/\s·\s/.test(item.sku)) return true;
  // En hojas de producción, PT-* es producto terminado; en DB_Carrito puede ser producto comprable por franquiciado.
  if (/^PT-/i.test(item.sku.trim()) && !/\b(franquiciado|db_carrito|desechable|mercadeo)\b/i.test(catNorm)) {
    return true;
  }
  // Id de variante POS (p. ej. GAS-PV-6|var:con-gas).
  if (/\|var:/i.test(item.id)) return true;
  return false;
}

/** Ítems de dotación/operación del franquiciado; visibles en la hoja, pero no descuentan por receta POS. */
export function itemEsUtilFranquiciadoNoEnsamble(item: InsumoKitItem): boolean {
  const catNorm = textoSinAcentos(item.categoria ?? "");
  return Boolean(catNorm && RUBRO_UTIL_FRANQUICIADO_RE.test(catNorm));
}

/** Solo insumos de receta/cargue; excluye ensambles, productos POS y útiles administrativos. */
export function filtrarCatalogoSoloInsumos(items: InsumoKitItem[]): InsumoKitItem[] {
  return items.filter((item) => !itemEsEnsambleOCatalogoPos(item) && !itemEsUtilFranquiciadoNoEnsamble(item));
}

function clavesLookupFirestoreInsumo(item: InsumoKitItem): string[] {
  const keys = [
    normSkuInventario(item.sku),
    normSkuInventario(item.id),
    item.skuCarrito ? normSkuInventario(item.skuCarrito) : "",
  ].filter(Boolean);
  return Array.from(new Set(keys));
}

function indexarFirestoreInsumos(firestore: InsumoKitItem[]): Map<string, InsumoKitItem> {
  const fsByKey = new Map<string, InsumoKitItem>();
  for (const it of firestore) {
    for (const k of clavesLookupFirestoreInsumo(it)) {
      if (!fsByKey.has(k)) fsByKey.set(k, it);
    }
  }
  return fsByKey;
}

function enriquecerInsumoDesdeFirestore(item: InsumoKitItem, fsByKey: Map<string, InsumoKitItem>): InsumoKitItem {
  if (item.precioCompraUnitario != null && item.precioCompraUnitario > 0) return item;
  for (const k of clavesLookupFirestoreInsumo(item)) {
    const fs = fsByKey.get(k);
    if (fs?.precioCompraUnitario != null && fs.precioCompraUnitario > 0) {
      return { ...item, precioCompraUnitario: fs.precioCompraUnitario };
    }
  }
  return item;
}

export function catalogoInventarioDesdeProductosCarrito(productos: ProductoCarritoPrecio[]): InsumoKitItem[] {
  const out = new Map<string, InsumoKitItem>();
  for (const p of productos) {
    const sku = String(p.sku ?? "").trim();
    const descripcion = String(p.producto ?? "").trim();
    if (!sku || !descripcion) continue;
    const key = normSkuInventario(sku);
    if (!key || out.has(key)) continue;
    const precio = precioEfectivoCarrito(p);
    out.set(key, {
      id: sku,
      sku,
      descripcion,
      unidad: "und",
      categoria: String(p.categoria ?? "").trim() || "DB_Carrito",
      ...(precio != null ? { precioCompraUnitario: precio } : {}),
    });
  }
  return Array.from(out.values()).sort((a, b) => a.descripcion.localeCompare(b.descripcion, "es"));
}

/**
 * Catálogo para cargue e inventario POS: productos/insumos que compra el franquiciado.
 * Firestore `DB_Franquicia_Insumos_Kit` gana cuando tiene datos; DB_Carrito respalda los productos disponibles
 * para pedidos del franquiciado; la hoja queda como último respaldo.
 */
export function catalogoInsumosParaCargue(
  sheet: InsumoKitItem[],
  firestore: InsumoKitItem[],
  carrito: ProductoCarritoPrecio[] = []
): InsumoKitItem[] {
  const sheetBase = filtrarCatalogoSoloInsumos(sheet);
  const fsFiltered = filtrarCatalogoSoloInsumos(firestore);
  const carritoItems = catalogoInventarioDesdeProductosCarrito(carrito);
  const base =
    fsFiltered.length > 0
      ? mergeCatalogoInventarioBase([], fsFiltered)
      : carritoItems.length > 0
        ? carritoItems
        : sheetBase.length > 0
          ? sheetBase
          : [];
  const fsByKey = indexarFirestoreInsumos(firestore);
  return base.map((it) => enriquecerInsumoDesdeFirestore(it, fsByKey));
}

function inventarioIdDesdeSkuPos(sku: string): string {
  return sku.trim();
}

export function insumoKitItemDesdeProductoPos(producto: ProductoPOS): InsumoKitItem {
  const sku = producto.sku.trim();
  return {
    id: inventarioIdDesdeSkuPos(sku),
    sku,
    descripcion: producto.descripcion?.trim() || sku,
    unidad: producto.unidad?.trim() || "und",
    categoria: producto.categoria?.trim() || "DB_POS_Productos",
  };
}

type ItemInventarioPosNormalizado = {
  item: InsumoKitItem;
  mergeKey: string;
};

function codigoVisibleVariantePos(skuBase: string, etiqueta: string): string {
  return `${skuBase.trim()} · ${etiqueta.trim()}`;
}

function itemsInventarioDesdeProductoPos(producto: ProductoPOS): ItemInventarioPosNormalizado[] {
  const variantes = Array.isArray(producto.variantes) ? producto.variantes.filter((opt) => opt?.clave?.trim()) : [];
  if (variantes.length === 0) {
    const item = insumoKitItemDesdeProductoPos(producto);
    return [
      {
        item,
        mergeKey: normSkuInventario(item.sku) || normSkuInventario(item.id),
      },
    ];
  }

  return variantes.map((opt) => {
    const clave = String(opt.clave).trim();
    const etiqueta = String(opt.etiqueta ?? opt.clave ?? "").trim() || clave;
    const skuLinea = buildLineIdPos(producto.sku.trim(), { variantes: [clave] });
    const item: InsumoKitItem = {
      id: inventarioIdDesdeSkuPos(skuLinea),
      sku: codigoVisibleVariantePos(producto.sku.trim(), etiqueta),
      descripcion: `${producto.descripcion?.trim() || producto.sku.trim()} (${etiqueta})`,
      unidad: producto.unidad?.trim() || "und",
      categoria: producto.categoria?.trim() || "DB_POS_Productos",
    };
    return {
      item,
      mergeKey: `pos-var:${normSkuInventario(skuLinea)}`,
    };
  });
}

export function mergeCatalogoInventarioBase(preferente: InsumoKitItem[], respaldo: InsumoKitItem[]): InsumoKitItem[] {
  const merged = new Map<string, InsumoKitItem>();
  const clave = (item: InsumoKitItem) => normSkuInventario(item.sku) || normSkuInventario(item.id);

  for (const item of preferente) {
    const key = clave(item);
    if (key) merged.set(key, item);
  }
  for (const item of respaldo) {
    const key = clave(item);
    if (key && !merged.has(key)) merged.set(key, item);
  }

  return Array.from(merged.values()).sort((a, b) => a.descripcion.localeCompare(b.descripcion, "es"));
}

export function mergeCatalogoInventarioConProductosPos(
  base: InsumoKitItem[],
  productos: ProductoPOS[]
): { items: InsumoKitItem[]; agregados: number } {
  const merged = new Map<string, InsumoKitItem>();

  for (const item of base) {
    const key = normSkuInventario(item.sku) || normSkuInventario(item.id);
    if (!key) continue;
    merged.set(key, item);
  }

  let agregados = 0;
  for (const producto of productos) {
    for (const { item: itemPos, mergeKey } of itemsInventarioDesdeProductoPos(producto)) {
      if (!mergeKey) continue;

      const actual = merged.get(mergeKey);
      if (!actual) {
        merged.set(mergeKey, itemPos);
        agregados += 1;
        continue;
      }

      merged.set(mergeKey, {
        ...actual,
        descripcion:
          actual.descripcion.trim() && actual.descripcion.trim() !== actual.sku.trim()
            ? actual.descripcion
            : itemPos.descripcion,
        unidad: actual.unidad.trim() || itemPos.unidad,
        categoria: actual.categoria?.trim() || itemPos.categoria,
      });
    }
  }

  const items = Array.from(merged.values()).sort((a, b) => a.descripcion.localeCompare(b.descripcion, "es"));
  return { items, agregados };
}

/** Todas las líneas de inventario derivadas de productos POS (variantes incluidas), sin fusionar con el catálogo base. */
export function expandirItemsInventarioDesdeProductosPos(productos: ProductoPOS[]): InsumoKitItem[] {
  const out: InsumoKitItem[] = [];
  for (const producto of productos) {
    for (const { item } of itemsInventarioDesdeProductoPos(producto)) {
      out.push(item);
    }
  }
  return out;
}
