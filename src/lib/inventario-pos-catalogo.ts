import { buildLineIdPos } from "@/lib/chorizo-variante-pos";
import { normSkuInventario } from "@/lib/inventario-pos-firestore";
import type { ProductoPOS } from "@/types";
import type { InsumoKitItem } from "@/types/inventario-pos";

function inventarioIdDesdeSkuPos(sku: string): string {
  return `wms-pos-${encodeURIComponent(sku.trim())}`;
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
      sku: producto.sku.trim(),
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
