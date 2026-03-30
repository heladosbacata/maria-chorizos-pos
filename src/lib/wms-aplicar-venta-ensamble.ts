import { buildLineIdPos } from "@/lib/chorizo-variante-pos";
import type { ItemCuenta } from "@/types/pos-caja-item";

/** Línea enviada a POST /api/pos/inventario/aplicar-venta-ensamble (WMS). */
export interface WmsAplicarVentaEnsambleLinea {
  /** Id compuesto o SKU catálogo (p. ej. `SKU|chorizo:picante|arepa:arepa_queso`). */
  skuProducto: string;
  cantidad: number;
  /** SKU base del catálogo POS (sin sufijos `|…`); algunos despliegues del WMS lo leen como `sku`. */
  sku?: string;
  variantes?: string[];
  varianteChorizo?: string;
  varianteArepaCombo?: string;
}

export interface WmsAplicarVentaEnsambleBody {
  lineas: WmsAplicarVentaEnsambleLinea[];
  idVenta?: string;
  /** Punto de venta explícito (el WMS puede usarlo además de `users/{uid}.puntoVenta`). */
  puntoVenta?: string;
}

export interface WmsAplicarVentaEnsambleResult {
  ok: boolean;
  status: number;
  aplicados?: unknown;
  detalle?: unknown;
  movimientoId?: string;
  message?: string;
  error?: string;
  /** URL del WMS usada por el proxy (header o cuerpo en error de red). */
  wmsUpstreamUrl?: string;
}

function cantidadEnteraPositiva(c: number): number {
  const n = Math.round(Number(c));
  return Math.max(1, Number.isFinite(n) ? n : 1);
}

/**
 * Construye líneas alineadas con el flujo María Chorizos: `skuProducto` puede ser compuesto
 * `SKU|chorizo:picante|arepa:arepa_queso` (mismo criterio que `lineId` en caja).
 */
/** Parte antes del primer `|` (SKU catálogo POS); el resto son variantes María Chorizos. */
export function skuBaseDesdeSkuProductoEnsamble(skuProducto: string): string {
  const s = skuProducto.trim();
  const i = s.indexOf("|");
  return i === -1 ? s : s.slice(0, i).trim();
}

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
    out.push({ skuProducto, cantidad, sku: skuBase });
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

/** Si el WMS devuelve `aplicados`, permite saber si hubo descuentos reales de insumos. */
export function contarAplicadosEnsambleReportados(r: WmsAplicarVentaEnsambleResult): number | null {
  const a = r.aplicados;
  if (a == null) return null;
  if (typeof a === "number" && Number.isFinite(a)) return Math.max(0, a);
  if (Array.isArray(a)) return a.length;
  return null;
}

/** Aviso cuando la venta OK pero no hubo líneas de ensamble aplicadas (p. ej. sin BOM en Sheets). */
export function mensajeEnsambleOkSinDescuentoInventario(r?: WmsAplicarVentaEnsambleResult): string {
  const base =
    "Venta registrada. El inventario de insumos no cambió: el WMS no aplicó ensamble para estos productos " +
    "(suele faltar composición en DB_POS_Composición o el SKU/variante no coincide con la hoja). " +
    "En Inventarios abrí «Diagnóstico último cobro» y usá «Actualizar stock».";
  const extra = r?.message?.trim() ? `\n\nDetalle del servidor: ${r.message.trim()}` : "";
  return base + extra;
}

export const ULTIMO_ENSAMBLE_SESSION_KEY = "pos_mc_ultimo_ensamble_v1";

export interface UltimoEnsambleSesionDiag {
  atIso: string;
  idVenta?: string;
  lineasEnviadas: { skuProducto: string; cantidad: number; sku?: string }[];
  puntoVentaEnviado?: string;
  ok: boolean;
  status: number;
  aplicadosCount: number | null;
  message?: string;
  error?: string;
  movimientoId?: string;
  detalleResumen?: string;
  /** Mismo proyecto que usa el cliente Firestore del POS (debe coincidir con el WMS). */
  firebaseProjectId?: string;
  /** URL a la que el servidor del POS reenvió el POST (si se expuso). */
  wmsUpstreamUrl?: string;
  /** NEXT_PUBLIC_WMS_URL en el build del cliente (puede no coincidir con el servidor en algunos despliegues). */
  nextPublicWmsUrl?: string;
}

function detalleToResumen(d: unknown): string | undefined {
  if (d == null) return undefined;
  try {
    const s = JSON.stringify(d);
    return s.length > 800 ? `${s.slice(0, 800)}…` : s;
  } catch {
    return String(d);
  }
}

/** Guarda el último intento de ensamble en la pestaña (sessionStorage) y avisa a Inventarios. */
export function guardarUltimoEnsambleEnSesion(
  body: WmsAplicarVentaEnsambleBody,
  result: WmsAplicarVentaEnsambleResult
): void {
  if (typeof window === "undefined") return;
  const fp = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();
  const wmsPublic = process.env.NEXT_PUBLIC_WMS_URL?.trim();
  const diag: UltimoEnsambleSesionDiag = {
    atIso: new Date().toISOString(),
    idVenta: body.idVenta,
    lineasEnviadas: body.lineas.map((l) => ({
      skuProducto: l.skuProducto,
      cantidad: l.cantidad,
      ...(l.sku ? { sku: l.sku } : {}),
    })),
    ...(body.puntoVenta?.trim() ? { puntoVentaEnviado: body.puntoVenta.trim() } : {}),
    ok: result.ok,
    status: result.status,
    aplicadosCount: contarAplicadosEnsambleReportados(result),
    message: result.message,
    error: result.error,
    movimientoId: result.movimientoId,
    detalleResumen: detalleToResumen(result.detalle),
    ...(fp ? { firebaseProjectId: fp } : {}),
    ...(result.wmsUpstreamUrl ? { wmsUpstreamUrl: result.wmsUpstreamUrl } : {}),
    ...(wmsPublic ? { nextPublicWmsUrl: wmsPublic } : {}),
  };
  try {
    sessionStorage.setItem(ULTIMO_ENSAMBLE_SESSION_KEY, JSON.stringify(diag));
    window.dispatchEvent(new CustomEvent("pos-ultimo-ensamble-actualizado"));
  } catch {
    /* ignore */
  }
}

export function leerUltimoEnsambleSesion(): UltimoEnsambleSesionDiag | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(ULTIMO_ENSAMBLE_SESSION_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as unknown;
    if (!p || typeof p !== "object") return null;
    const o = p as Record<string, unknown>;
    if (typeof o.atIso !== "string" || !Array.isArray(o.lineasEnviadas)) return null;
    return p as UltimoEnsambleSesionDiag;
  } catch {
    return null;
  }
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
    const upstreamHeader = res.headers.get("x-pos-wms-upstream")?.trim();
    const upstreamBody =
      typeof data?._posUpstreamTried === "string" ? (data._posUpstreamTried as string) : undefined;

    return {
      ok,
      status: res.status,
      aplicados: data?.aplicados,
      detalle: data?.detalle,
      movimientoId: typeof data?.movimientoId === "string" ? data.movimientoId : undefined,
      message: typeof data?.message === "string" ? data.message : undefined,
      error: typeof data?.error === "string" ? data.error : undefined,
      wmsUpstreamUrl: upstreamHeader || upstreamBody,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, status: 0, error: msg };
  }
}
