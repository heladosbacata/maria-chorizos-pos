import { buildLineIdPos } from "@/lib/chorizo-variante-pos";
import type { ItemCuenta } from "@/types/pos-caja-item";

/** Línea enviada a POST /api/pos/inventario/aplicar-venta-ensamble (WMS). */
export interface WmsAplicarVentaEnsambleLinea {
  skuProducto: string;
  cantidad: number;
  variantes?: string[];
  varianteChorizo?: string;
  varianteArepaCombo?: string;
}

export interface WmsAplicarVentaEnsambleBody {
  lineas: WmsAplicarVentaEnsambleLinea[];
  idVenta?: string;
}

export interface WmsAplicarVentaEnsambleResult {
  ok: boolean;
  status: number;
  aplicados?: unknown;
  detalle?: unknown;
  movimientoId?: string;
  message?: string;
  error?: string;
}

function cantidadEnteraPositiva(c: number): number {
  const n = Math.round(Number(c));
  return Math.max(1, Number.isFinite(n) ? n : 1);
}

/**
 * Construye líneas alineadas con el flujo María Chorizos: `skuProducto` puede ser compuesto
 * `SKU|chorizo:picante|arepa:arepa_queso` (mismo criterio que `lineId` en caja).
 */
export function lineasWmsEnsambleDesdeItemsCuenta(items: ItemCuenta[]): WmsAplicarVentaEnsambleLinea[] {
  const out: WmsAplicarVentaEnsambleLinea[] = [];
  for (const it of items) {
    const skuBase = `${it.producto.sku ?? ""}`.trim();
    if (!skuBase) continue;
    const cantidad = cantidadEnteraPositiva(it.cantidad);
    const skuProducto = buildLineIdPos(skuBase, {
      varianteChorizo: it.varianteChorizo,
      varianteArepaCombo: it.varianteArepaCombo,
    });
    out.push({ skuProducto, cantidad });
  }
  return out;
}

export function esErrorRedAplicarEnsamble(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes("failed to fetch") ||
    m.includes("networkerror") ||
    m.includes("network request failed") ||
    m.includes("load failed") ||
    (m.includes("fetch") && m.includes("aborted"))
  );
}

export function mensajeAplicarEnsambleParaCajero(r: WmsAplicarVentaEnsambleResult): string {
  if (r.ok) return "";
  const base = r.error || r.message || `Error ${r.status}`;
  if (r.status === 401) {
    return "No se pudo descontar inventario por ensamble: sesión inválida o expirada. Volvé a iniciar sesión y avisá a soporte si sigue fallando.";
  }
  if (r.status === 403 || r.status === 404) {
    return `No se pudo descontar inventario en el almacén (${base}). Revisá que tu usuario POS tenga punto de venta asignado en el WMS. La venta ya quedó registrada en caja.`;
  }
  if (r.status >= 500 || esErrorRedAplicarEnsamble(base)) {
    return "La venta quedó registrada en caja, pero no hubo conexión con el servidor de inventario (ensamble). Se reintentará automáticamente; si persiste, avisá a soporte.";
  }
  return `La venta quedó registrada en caja, pero el descuento de inventario por ensamble respondió: ${base}. Avisá a soporte si hace falta corregir stock.`;
}

/**
 * Desde el navegador: proxy del POS (`/api/pos_aplicar_venta_ensamble`) reenvía el Bearer al WMS.
 */
export async function aplicarVentaEnsambleWms(
  idToken: string,
  body: WmsAplicarVentaEnsambleBody
): Promise<WmsAplicarVentaEnsambleResult> {
  const token = idToken.trim();
  if (!token) {
    return { ok: false, status: 401, error: "Sin token de sesión." };
  }
  if (!body.lineas?.length) {
    return { ok: true, status: 200, message: "Sin líneas de producto." };
  }

  try {
    const res = await fetch("/api/pos_aplicar_venta_ensamble", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const ok = res.ok && data?.ok !== false;

    return {
      ok,
      status: res.status,
      aplicados: data?.aplicados,
      detalle: data?.detalle,
      movimientoId: typeof data?.movimientoId === "string" ? data.movimientoId : undefined,
      message: typeof data?.message === "string" ? data.message : undefined,
      error: typeof data?.error === "string" ? data.error : undefined,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, status: 0, error: msg };
  }
}
