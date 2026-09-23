import type { NextApiRequest, NextApiResponse } from "next";
import { getWmsPublicBaseUrl } from "@/lib/wms-public-base";

/**
 * Proxy POST same-origin → WMS (evita CORS / "Failed to fetch" desde túneles o orígenes no whitelisteados).
 */
export async function proxyPostHaciaWms(
  req: NextApiRequest,
  res: NextApiResponse,
  wmsPath: string
): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  const base = getWmsPublicBaseUrl().replace(/\/$/, "");
  const path = wmsPath.startsWith("/") ? wmsPath : `/${wmsPath}`;
  const url = `${base}${path}`;

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  const auth = req.headers.authorization;
  if (auth) headers.Authorization = auth;

  const bodyStr = typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {});

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: bodyStr,
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    });
    const data = await response.json().catch(() => ({}));
    res.status(response.status).json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error de red";
    res.status(503).json({ ok: false, error: message, _posUpstream: url });
  }
}
