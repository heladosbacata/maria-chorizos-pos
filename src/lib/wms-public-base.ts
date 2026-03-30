/**
 * URL pública del WMS para el POS (catálogo, proxy `productos_listar`, `pos_aplicar_venta_ensamble`, ventas, chat).
 *
 * En despliegue se recomienda definir siempre `NEXT_PUBLIC_WMS_URL` (ej. https://maria-chorizos-wms.vercel.app).
 * Alias equivalente: `NEXT_PUBLIC_WMS_API_URL` (si ambos existen, gana `NEXT_PUBLIC_WMS_URL`).
 * Si falta, se usa el WMS en Vercel por defecto.
 * Para WMS en localhost: `NEXT_PUBLIC_WMS_URL=http://localhost:3002` y `NEXT_PUBLIC_WMS_USE_LOCAL=1`.
 */

export const WMS_VERCEL_URL = "https://maria-chorizos-wms.vercel.app";

function stripTrailingSlash(s: string): string {
  return s.replace(/\/$/, "");
}

export function wmsHostIsLocalhost(base: string): boolean {
  try {
    const u = new URL(base.includes("://") ? base : `http://${base}`);
    const h = u.hostname.toLowerCase();
    return h === "localhost" || h === "127.0.0.1" || h === "::1";
  } catch {
    return /localhost|127\.0\.0\.1/i.test(base);
  }
}

/**
 * Base URL del WMS (sin barra final).
 */
export function getWmsPublicBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_WMS_URL?.trim() || process.env.NEXT_PUBLIC_WMS_API_URL?.trim();
  if (!raw) return stripTrailingSlash(WMS_VERCEL_URL);
  const normalized = stripTrailingSlash(raw);
  if (wmsHostIsLocalhost(normalized)) {
    const useLocal = process.env.NEXT_PUBLIC_WMS_USE_LOCAL === "1";
    return useLocal ? normalized : stripTrailingSlash(WMS_VERCEL_URL);
  }
  return normalized;
}
