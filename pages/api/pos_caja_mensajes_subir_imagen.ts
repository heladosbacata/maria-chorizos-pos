import type { NextApiRequest, NextApiResponse } from "next";
import { getWmsPublicBaseUrl } from "@/lib/wms-public-base";

export const config = {
  api: { bodyParser: false },
};

/**
 * Proxy POST multipart → WMS `/api/pos/caja-mensajes/subir-imagen`.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const base = getWmsPublicBaseUrl().replace(/\/$/, "");
  const url = `${base}/api/pos/caja-mensajes/subir-imagen`;

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    const body = Buffer.concat(chunks);
    const contentType = req.headers["content-type"];
    if (!contentType?.includes("multipart/form-data")) {
      return res.status(400).json({ ok: false, error: "Se requiere FormData con la imagen." });
    }

    const headers: HeadersInit = {
      Accept: "application/json",
      "Content-Type": contentType,
    };
    const auth = req.headers.authorization;
    if (auth) headers.Authorization = auth;

    const response = await fetch(url, { method: "POST", headers, body });
    const data = await response.json().catch(() => ({}));
    return res.status(response.status).json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error de red";
    return res.status(503).json({ ok: false, error: message, _posUpstream: url });
  }
}
