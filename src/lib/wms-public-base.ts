/**
 * URL pública del WMS para el POS (catálogo, ventas, APIs proxy, chat).
 *
 * Por defecto se usa el WMS en Vercel: en muchos equipos el servidor local no está encendido.
 * Para apuntar a un WMS en localhost (desarrollo), define además NEXT_PUBLIC_WMS_USE_LOCAL=1.
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
  const raw = process.env.NEXT_PUBLIC_WMS_URL?.trim();
  if (!raw) return stripTrailingSlash(WMS_VERCEL_URL);
  const normalized = stripTrailingSlash(raw);
  if (wmsHostIsLocalhost(normalized)) {
    const useLocal = process.env.NEXT_PUBLIC_WMS_USE_LOCAL === "1";
    return useLocal ? normalized : stripTrailingSlash(WMS_VERCEL_URL);
  }
  return normalized;
}
