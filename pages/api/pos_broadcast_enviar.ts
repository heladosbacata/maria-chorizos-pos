import type { NextApiRequest, NextApiResponse } from "next";
import { getWmsPublicBaseUrl } from "@/lib/wms-public-base";

/** Proxy POST → WMS `/api/pos/broadcast/enviar` */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const base = getWmsPublicBaseUrl().replace(/\/$/, "");
  const url = `${base}/api/pos/broadcast/enviar`;

  const headers: HeadersInit = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  const auth = req.headers.authorization;
  if (auth) headers.Authorization = auth;

  const bodyStr = typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {});

  try {
    const response = await fetch(url, { method: "POST", headers, body: bodyStr, cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    return res.status(response.status).json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error de red";
    return res.status(503).json({ ok: false, error: message, _posUpstream: url });
  }
}
