import type { InsumoKitItem } from "@/types/inventario-pos";
import { precioCompraParaInsumo, type MapaPreciosCarrito } from "@/lib/precios-compra-carrito";

export function factorEmpaqueInsumo(item: InsumoKitItem): number {
  const f = Number(item.factorUnidadesConsumo);
  return Number.isFinite(f) && f > 0 ? Math.round(f * 10000) / 10000 : 1;
}

export function unidadCompraInsumo(item: InsumoKitItem): string {
  return item.unidadCompra?.trim() || (factorEmpaqueInsumo(item) > 1 ? "paquete" : item.unidad || "und");
}

export function unidadConsumoInsumo(item: InsumoKitItem): string {
  return item.unidadConsumo?.trim() || item.unidad || "und";
}

export function cantidadInventarioDesdeCompra(item: InsumoKitItem, cantidadCompra: number): number {
  if (!Number.isFinite(cantidadCompra) || cantidadCompra <= 0) return 0;
  return Math.round(cantidadCompra * factorEmpaqueInsumo(item) * 10000) / 10000;
}

export function precioCompraUnitarioInsumo(item: InsumoKitItem, mapa: MapaPreciosCarrito): number | null {
  return precioCompraParaInsumo(item, mapa);
}

export function precioCompraEmpaqueInsumo(item: InsumoKitItem, mapa: MapaPreciosCarrito): number | null {
  const directo = Number(item.precioCompraEmpaque);
  if (Number.isFinite(directo) && directo > 0) return Math.round(directo * 100) / 100;
  const unitario = precioCompraUnitarioInsumo(item, mapa);
  if (unitario == null) return null;
  return Math.round(unitario * factorEmpaqueInsumo(item) * 100) / 100;
}

export function resumenConversionCargue(item: InsumoKitItem, cantidadCompra: number): string | null {
  if (!Number.isFinite(cantidadCompra) || cantidadCompra <= 0) return null;
  const factor = factorEmpaqueInsumo(item);
  if (factor <= 1) return null;
  const unidades = cantidadInventarioDesdeCompra(item, cantidadCompra);
  return `${cantidadCompra.toLocaleString("es-CO", { maximumFractionDigits: 3 })} ${unidadCompraInsumo(item)} x ${factor.toLocaleString("es-CO", { maximumFractionDigits: 3 })} = ${unidades.toLocaleString("es-CO", { maximumFractionDigits: 3 })} ${unidadConsumoInsumo(item)} al inventario`;
}
