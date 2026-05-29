/** URL del landing de pedidos web/QR para un punto de venta. */
const POS_PEDIDOS_PUBLIC_URL = "https://maria-chorizos-pos.vercel.app/pedidos";

function esUrlLocalhost(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return /localhost|127\.0\.0\.1/i.test(url);
  }
}

export function construirLandingPedidosUrl(puntoVenta: string, origin?: string): string {
  const baseEnv = process.env.NEXT_PUBLIC_POS_LANDING_PEDIDOS_URL?.trim();
  const pv = puntoVenta.trim();
  const originBase = origin && /^https?:\/\//i.test(origin) ? `${origin.replace(/\/$/, "")}/pedidos` : "";
  const envBase =
    baseEnv && /^https?:\/\//i.test(baseEnv) && !esUrlLocalhost(baseEnv) ? baseEnv : "";
  const runtimeBase = originBase && !esUrlLocalhost(originBase) ? originBase : "";
  const base = envBase || runtimeBase || POS_PEDIDOS_PUBLIC_URL;
  const u = new URL(base);
  if (pv) u.searchParams.set("puntoVenta", pv);
  u.searchParams.set("canal", "qr");
  return u.toString();
}
