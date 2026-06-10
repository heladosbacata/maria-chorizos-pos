import { buildLineIdPos } from "@/lib/chorizo-variante-pos";
import { normSkuInventario } from "@/lib/inventario-pos-firestore";
import type { ProductoPOS } from "@/types";
import type { InsumoKitItem } from "@/types/inventario-pos";

const CATEGORIA_POS_PRODUCTOS = "db_pos_productos";

/** Rubros de catálogo que representan productos de venta/ensamble, no insumos cargables. */
const RUBRO_ENSAMBLE_RE = /\b(ensamble|combo|paquete|producto\s*pos|producto\s*terminado|venta|bebida|combo|paquetes)\b/i;

/** Ítem derivado del catálogo POS o marcado como ensamble/paquete (no es insumo cargable). */
export function itemEsEnsambleOCatalogoPos(item: InsumoKitItem): boolean {
  const cat = (item.categoria ?? "").trim();
  const catNorm = cat.toLowerCase().replace(/\s+/g, " ");
  if (catNorm === CATEGORIA_POS_PRODUCTOS) return true;
  if (cat && RUBRO_ENSAMBLE_RE.test(cat)) return true;
  // Variantes POS: «SKU · Etiqueta» (p. ej. GAS-PV-6 · Con Gas).
  if (/\s·\s/.test(item.sku)) return true;
  return false;
}

/** Solo insumos del kit/franquicia; excluye ensambles y productos del catálogo POS. */
export function filtrarCatalogoSoloInsumos(items: InsumoKitItem[]): InsumoKitItem[] {
  return items.filter((item) => !itemEsEnsambleOCatalogoPos(item));
}

/**
 * Catálogo para cargue de inventario: hoja + Firestore, sin mezclar productos POS (ensambles).
 */
export function catalogoInsumosParaCargue(
  sheet: InsumoKitItem[],
  firestore: InsumoKitItem[]
): InsumoKitItem[] {
  const base = sheet.length > 0 ? mergeCatalogoInventarioBase(sheet, firestore) : firestore;
  return filtrarCatalogoSoloInsumos(base);
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
