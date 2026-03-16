import type { ProductoPOS } from "@/types";

const WMS_URL: string =
  process.env.NEXT_PUBLIC_WMS_URL || "https://maria-chorizos-wms.vercel.app";

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
  descripcion?: string;
  categoria?: string;
  precioUnitario?: number;
  unidad?: string;
  urlImagen?: string | null;
  [key: string]: unknown;
}

function toProductoPOS(item: PosProductoItem): ProductoPOS | null {
  const sku =
    item.sku ?? item.skuBarcode ?? item.skuProductoFinal;
  if (sku == null || String(sku).trim() === "") return null;
  const precio = Number(item.precioUnitario);
  return {
    sku: String(sku).trim(),
    descripcion: item.descripcion ?? String(sku),
    categoria: item.categoria ?? undefined,
    precioUnitario: Number.isFinite(precio) ? precio : 0,
    unidad: item.unidad ?? undefined,
    urlImagen: item.urlImagen ?? null,
  };
}

/**
 * Obtiene el catálogo de productos para venta en el POS desde el WMS.
 * En el navegador usa /api/productos_listar (proxy del POS) para evitar CORS.
 * En el servidor llama directo al WMS.
 * Respuesta esperada: { ok: true, data: [...], productos: [...] }; cada ítem: sku, skuBarcode, descripcion, categoria, precioUnitario, unidad, urlImagen.
 */
export async function getCatalogoPOS(
  idToken?: string | null
): Promise<CatalogoPOSResult> {
  const isBrowser = typeof window !== "undefined";
  const url = isBrowser
    ? "/api/productos_listar"
    : `${(WMS_URL || "https://maria-chorizos-wms.vercel.app").replace(/\/$/, "")}/api/pos/productos/listar`;
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

    const raw =
      data?.data ??
      data?.productos ??
      data?.result ??
      data?.items ??
      (Array.isArray(data) ? data : []);
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
