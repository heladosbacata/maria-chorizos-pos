import type { NextApiRequest, NextApiResponse } from "next";
import { getWmsPublicBaseUrl } from "@/lib/wms-public-base";

function sendJson(res: NextApiResponse, status: number, body: unknown) {
  return res.status(status).json(body);
}

/**
 * Proxy POST → WMS `/api/pos/inventario/aplicar-venta-ensamble`.
 * Reenvía `Authorization: Bearer <Firebase idToken>` del cliente.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { ok: false, error: "Method not allowed" });
  }

  const base = getWmsPublicBaseUrl().replace(/\/$/, "");
  const url = `${base}/api/pos/inventario/aplicar-venta-ensamble`;

  const headers: HeadersInit = { "Content-Type": "application/json" };
  const auth = req.headers.authorization;
  if (auth) headers.Authorization = auth;

  let bodyStr: string;
  if (typeof req.body === "string") {
    bodyStr = req.body;
  } else {
    bodyStr = JSON.stringify(req.body ?? {});
  }

  try {
    console.info("[pos_aplicar_venta_ensamble] POST →", url);
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: bodyStr,
    });
    const data = await response.json().catch(() => ({}));
    /** En dev el cliente puede leer el encabezado y guardarlo en el diagnóstico de Inventarios. */
    if (process.env.NODE_ENV === "development" || process.env.POS_EXPOSE_WMS_UPSTREAM === "1") {
      res.setHeader("X-Pos-Wms-Upstream", url);
    }
    return sendJson(res, response.status, data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error de red";
    return sendJson(res, 200, {
      ok: false,
      error: message,
      _posUpstreamTried: url,
    });
  }
}
