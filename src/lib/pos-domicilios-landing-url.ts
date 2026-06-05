/** URL del landing de pedidos web/QR para un punto de venta. */
import { slugDomiciliosPuntoVenta } from "@/lib/pos-domicilios-slug";

/** Dominio del proyecto POS (no WMS). pedidos.* hoy puede apuntar mal en DNS. */
const POS_DOMICILIOS_PUBLIC_URL = "https://pos.mariachorizos.com/domicilios";

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
  const originBase = origin && /^https?:\/\//i.test(origin) ? `${origin.replace(/\/$/, "")}/domicilios` : "";
  const envBase =
    baseEnv && /^https?:\/\//i.test(baseEnv) && !esUrlLocalhost(baseEnv) ? baseEnv : "";
  const runtimeBase = originBase && !esUrlLocalhost(originBase) ? originBase : "";
  const base = envBase || runtimeBase || POS_DOMICILIOS_PUBLIC_URL;
  const u = new URL(`${base.replace(/\/$/, "")}/${encodeURIComponent(slugDomiciliosPuntoVenta(pv))}`);
  if (pv) u.searchParams.set("puntoVenta", pv);
  u.searchParams.set("canal", "qr");
  return u.toString();
}
