import type { NextApiRequest, NextApiResponse } from "next";
import { getWmsPublicBaseUrl } from "@/lib/wms-public-base";

/** Proxy GET/PUT → WMS `/api/pos/dian-config` */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const method = req.method;
  if (method !== "GET" && method !== "PUT") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const base = getWmsPublicBaseUrl().replace(/\/$/, "");
  const url = `${base}/api/pos/dian-config`;

  const headers: HeadersInit = { Accept: "application/json" };
  const auth = req.headers.authorization;
  if (auth) headers.Authorization = auth;
  if (method === "PUT") {
    (headers as Record<string, string>)["Content-Type"] = "application/json";
  }

  const bodyStr = method === "PUT" ? (typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {})) : undefined;

  try {
    const response = await fetch(url, {
      method,
      headers,
      ...(bodyStr ? { body: bodyStr } : {}),
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    return res.status(response.status).json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error de red";
    return res.status(503).json({ ok: false, error: message, _posUpstream: url });
  }
}
