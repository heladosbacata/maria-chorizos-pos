import type { NextApiRequest, NextApiResponse } from "next";
import { getWmsPublicBaseUrl } from "@/lib/wms-public-base";

/** Proxy GET → WMS `/api/pos/broadcast/unread` */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const base = getWmsPublicBaseUrl().replace(/\/$/, "");
  const url = `${base}/api/pos/broadcast/unread`;

  const headers: HeadersInit = { Accept: "application/json" };
  const auth = req.headers.authorization;
  if (auth) headers.Authorization = auth;

  try {
    const response = await fetch(url, { method: "GET", headers, cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    return res.status(response.status).json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error de red";
    return res.status(503).json({ ok: false, error: message, _posUpstream: url });
  }
}
