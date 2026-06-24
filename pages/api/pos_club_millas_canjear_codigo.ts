import type { NextApiRequest, NextApiResponse } from "next";
import { getWmsPublicBaseUrl } from "@/lib/wms-public-base";

function sendJson(res: NextApiResponse, status: number, body: unknown) {
  return res.status(status).json(body);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    return sendJson(res, 405, { ok: false, error: "Method not allowed" });
  }

  const base = getWmsPublicBaseUrl().replace(/\/$/, "");
  const qs =
    req.method === "GET" && typeof req.query.codigo === "string"
      ? `?codigo=${encodeURIComponent(req.query.codigo)}`
      : "";
  const url = `${base}/api/pos/club-de-millas/canjear-codigo${qs}`;

  const headers: HeadersInit = { Accept: "application/json" };
  const auth = req.headers.authorization;
  if (auth) headers.Authorization = auth;

  try {
    const response = await fetch(url, {
      method: req.method,
      headers: req.method === "POST" ? { ...headers, "Content-Type": "application/json" } : headers,
      ...(req.method === "POST" ? { body: JSON.stringify(req.body ?? {}) } : {}),
    });
    const data = await response.json().catch(() => ({}));
    return sendJson(res, response.status, data);
  } catch (e) {
    return sendJson(res, 200, {
      ok: false,
      error: e instanceof Error ? e.message : "Error de red",
      _posUpstreamTried: url,
    });
  }
}

