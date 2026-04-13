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
    const itemPos = insumoKitItemDesdeProductoPos(producto);
    const key = normSkuInventario(itemPos.sku) || normSkuInventario(itemPos.id);
    if (!key) continue;

    const actual = merged.get(key);
    if (!actual) {
      merged.set(key, itemPos);
      agregados += 1;
      continue;
    }

    merged.set(key, {
      ...actual,
      descripcion:
        actual.descripcion.trim() && actual.descripcion.trim() !== actual.sku.trim()
          ? actual.descripcion
          : itemPos.descripcion,
      unidad: actual.unidad.trim() || itemPos.unidad,
      categoria: actual.categoria?.trim() || itemPos.categoria,
    });
  }

  const items = Array.from(merged.values()).sort((a, b) => a.descripcion.localeCompare(b.descripcion, "es"));
  return { items, agregados };
}
