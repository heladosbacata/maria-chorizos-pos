import type { NextApiRequest, NextApiResponse } from "next";
import { getWmsPublicBaseUrl } from "@/lib/wms-public-base";

/** Proxy POST → WMS /api/pos/envios-matriz/{id}/recepcion */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  const id = typeof req.query.id === "string" ? req.query.id : "";
  if (!id) {
    return res.status(400).json({ ok: false, message: "Falta id del envío." });
  }

  const base = getWmsPublicBaseUrl();
  const url = `${base}/api/pos/envios-matriz/${encodeURIComponent(id)}/recepcion`;

  const headers: HeadersInit = { "Content-Type": "application/json" };
  const auth = req.headers.authorization;
  if (auth) headers.Authorization = auth;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(req.body ?? {}),
    });
    const data = await response.json().catch(() => ({}));
    return res.status(response.status).json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al conectar con el WMS";
    return res.status(503).json({ ok: false, message });
  }
}
