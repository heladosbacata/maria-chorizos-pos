import type { NextApiRequest, NextApiResponse } from "next";
import { getWmsPublicBaseUrl } from "@/lib/wms-public-base";

/**
 * Proxy GET → WMS `/api/pos/metas-retos/activas`
 * Evita CORS y fallos de red del navegador al llamar directo al dominio del WMS.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const base = getWmsPublicBaseUrl().replace(/\/$/, "");
  const pv = typeof req.query.puntoVenta === "string" ? req.query.puntoVenta.trim() : "";
  const qs = pv ? `?${new URLSearchParams({ puntoVenta: pv }).toString()}` : "";
  const url = `${base}/api/pos/metas-retos/activas${qs}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    });
    const data = await response.json().catch(() => ({}));
    return res.status(response.status).json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error de red";
    return res.status(503).json({
      ok: false,
      error: message,
      message: `No se pudo consultar metas en el WMS (${base}).`,
      _posUpstream: url,
    });
  }
}
