import type { ProductoPOS } from "@/types";
import { getWmsPublicBaseUrl } from "@/lib/wms-public-base";

export interface CatalogoPOSResult {
  ok: boolean;
  productos?: ProductoPOS[];
  message?: string;
}

/** Item devuelto por GET /api/pos/productos/listar (WMS). Acepta variaciones de nombres de campo. */
interface PosProductoItem {
  sku?: string;
  skuBarcode?: string;
  skuProductoFinal?: string;
  codigo?: string;
  Codigo?: string;
  descripcion?: string;
  nombre?: string;
  Nombre?: string;
  nombre_producto?: string;
  categoria?: string;
  precioUnitario?: number;
  precio?: number;
  Precio?: number;
  precioVenta?: number;
  unidad?: string;
  urlImagen?: string | null;
  variantes?: Array<{
    clave?: string;
    etiqueta?: string;
    precioVenta?: number;
  }>;
  posVariantesMaria?: {
    grupos?: Array<{
      codigo?: string;
      etiquetaGrupo?: string;
      opciones?: Array<{
        valor?: string;
        etiqueta?: string;
        precioVenta?: number;
      }>;
    }>;
  };
  preciosPorVariante?: Record<string, number>;
  [key: string]: unknown;
}

/** Evita que `items: []` vacío tape un array con datos en otra clave del JSON. */
function pickProductosRawArray(...cands: unknown[]): unknown[] {
  for (const c of cands) {
    if (Array.isArray(c) && c.length > 0) return c;
  }
  for (const c of cands) {
    if (Array.isArray(c)) return c;
  }
  return [];
}

function numPrecio(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v.replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : NaN;
  }
  return NaN;
}

function variantesDesdePosVariantesMaria(item: PosProductoItem): Array<{
  clave: string;
  etiqueta: string;
  precioVenta: number | undefined;
}> {
  const grupos = Array.isArray(item.posVariantesMaria?.grupos) ? item.posVariantesMaria.grupos : [];
  if (grupos.length === 0) return [];
  // El landing actual maneja una sola seleccion de variante por producto.
  // Para modales multi-grupo en WMS, usamos el primer grupo como variante visible.
  const grupo = grupos[0];
  const codigoGrupo = String(grupo?.codigo ?? "").trim();
  const opciones = Array.isArray(grupo?.opciones) ? grupo.opciones : [];
  const out: Array<{ clave: string; etiqueta: string; precioVenta: number | undefined }> = [];
  for (const op of opciones) {
    const valor = String(op?.valor ?? "").trim();
    if (!valor) continue;
    const clave = codigoGrupo ? `${codigoGrupo}:${valor}` : valor;
    const etiqueta = String(op?.etiqueta ?? valor).trim() || valor;
    const precioVenta =
      typeof op?.precioVenta === "number" && Number.isFinite(op.precioVenta) ? op.precioVenta : undefined;
    out.push({ clave, etiqueta, precioVenta });
  }
  return out;
}

function toProductoPOS(item: PosProductoItem): ProductoPOS | null {
  const sku =
    item.sku ??
    item.skuBarcode ??
    item.skuProductoFinal ??
    item.codigo ??
    item.Codigo;
  if (sku == null || String(sku).trim() === "") return null;
  const rawPrecio = item.precioUnitario ?? item.precio ?? item.Precio ?? item.precioVenta;
  const precio = numPrecio(rawPrecio);
  const desc =
    item.descripcion ??
    item.nombre ??
    item.Nombre ??
    item.nombre_producto ??
    String(sku);
  let variantes: Array<{ clave: string; etiqueta: string; precioVenta: number | undefined }> = Array.isArray(item.variantes)
    ? item.variantes
        .filter((v) => v && typeof v.clave === "string" && String(v.clave).trim())
        .map((v) => ({
          clave: String(v.clave).trim(),
          etiqueta: String(v.etiqueta ?? v.clave ?? "").trim() || String(v.clave).trim(),
          precioVenta:
            typeof v.precioVenta === "number" && Number.isFinite(v.precioVenta) ? v.precioVenta : undefined,
        }))
    : [];
  if (variantes.length === 0) {
    variantes = variantesDesdePosVariantesMaria(item);
  }
  return {
    sku: String(sku).trim(),
    descripcion: desc,
    categoria: item.categoria ?? undefined,
    precioUnitario: Number.isFinite(precio) && !Number.isNaN(precio) ? precio : 0,
    unidad: item.unidad ?? undefined,
    urlImagen: item.urlImagen ?? null,
    variantes,
    preciosPorVariante:
      item.preciosPorVariante && typeof item.preciosPorVariante === "object"
        ? Object.fromEntries(
            Object.entries(item.preciosPorVariante).filter(
              ([k, v]) => !!String(k).trim() && typeof v === "number" && Number.isFinite(v)
            )
          )
        : {},
  };
}

/**
 * Obtiene el catálogo de productos para venta en el POS desde el WMS.
 * En el navegador usa /api/productos_listar (proxy del POS) para evitar CORS.
 * En el servidor llama directo al WMS.
 * Respuesta esperada: { ok: true, data: [...], productos: [...] }; cada ítem: sku, skuBarcode, descripcion, categoria, precioUnitario, unidad, urlImagen.
 */
export async function getCatalogoPOS(
  idToken?: string | null,
  puntoVenta?: string | null
): Promise<CatalogoPOSResult> {
  const isBrowser = typeof window !== "undefined";
  const pv = String(puntoVenta ?? "").trim();
  const urlBase = isBrowser
    ? "/api/productos_listar"
    : `${getWmsPublicBaseUrl()}/api/pos/productos/listar`;
  const url = pv ? `${urlBase}?puntoVenta=${encodeURIComponent(pv)}` : urlBase;
  const headers: HeadersInit = {};
  if (idToken) {
    headers.Authorization = `Bearer ${idToken}`;
  }

  try {
    const res = await fetch(url, { headers });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const msg = data?.message || data?.error || `Error ${res.status}`;
      if (res.status === 404) {
        return { ok: false, message: "Catálogo no disponible por ahora." };
      }
      return { ok: false, message: msg };
    }

    // Si la API devolvió 200 pero ok: false (ej. WMS no disponible), tratar como error
    if (data && data.ok === false) {
      return { ok: false, message: data.message ?? "No se pudo cargar el catálogo." };
    }

    const d = data as Record<string, unknown>;
    const nested =
      d?.result && typeof d.result === "object" && !Array.isArray(d.result)
        ? (d.result as Record<string, unknown>)
        : null;
    const raw = pickProductosRawArray(
      d?.data,
      d?.productos,
      d?.result,
      d?.items,
      nested?.data,
      nested?.productos,
      nested?.items,
      nested?.result,
      Array.isArray(data) ? data : null
    );
    const productos: ProductoPOS[] = [];
    for (const item of raw) {
      const p = toProductoPOS(item as PosProductoItem);
      if (p) productos.push(p);
    }

    return { ok: true, productos };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al cargar el catálogo";
    const isCorsOrNetwork =
      msg.includes("Failed to fetch") ||
      msg.includes("NetworkError") ||
      msg.includes("CORS") ||
      msg.includes("Load failed");
    return {
      ok: false,
      message: isCorsOrNetwork ? "Catálogo no disponible por ahora." : msg,
    };
  }
}
