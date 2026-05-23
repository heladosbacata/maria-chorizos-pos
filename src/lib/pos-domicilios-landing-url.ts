/** URL del landing de pedidos web/QR para un punto de venta. */
export function construirLandingPedidosUrl(puntoVenta: string, origin?: string): string {
  const baseEnv = process.env.NEXT_PUBLIC_POS_LANDING_PEDIDOS_URL?.trim();
  const pv = puntoVenta.trim();
  const fallbackBase =
    origin && /^https?:\/\//i.test(origin)
      ? `${origin.replace(/\/$/, "")}/pedidos`
      : "https://mariachorizos.app/pedidos";
  const base = baseEnv && /^https?:\/\//i.test(baseEnv) ? baseEnv : fallbackBase;
  const u = new URL(base);
  if (pv) u.searchParams.set("puntoVenta", pv);
  u.searchParams.set("canal", "qr");
  return u.toString();
}
