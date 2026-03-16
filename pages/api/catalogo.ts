import type { NextApiRequest, NextApiResponse } from "next";

const WMS_URL = process.env.NEXT_PUBLIC_WMS_URL;

/**
 * Proxy GET /api/catalogo → WMS GET /api/pos/productos/listar.
 * Evita CORS: el navegador llama a este endpoint (mismo origen) y el servidor llama al WMS.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  if (!WMS_URL) {
    return res
      .status(500)
      .json({ ok: false, message: "NEXT_PUBLIC_WMS_URL no está configurada" });
  }

  const url = `${WMS_URL.replace(/\/$/, "")}/api/pos/productos/listar`;
  const headers: HeadersInit = {};
  const auth = req.headers.authorization;
  if (auth) headers.Authorization = auth;

  try {
    const response = await fetch(url, { headers });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return res
        .status(response.status)
        .json({
          ok: false,
          message: data?.message || data?.error || `Error ${response.status}`,
        });
    }

    return res.status(200).json(data);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Error al conectar con el WMS";
    return res.status(502).json({ ok: false, message });
  }
}
