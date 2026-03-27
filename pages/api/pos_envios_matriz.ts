import type { NextApiRequest, NextApiResponse } from "next";

const WMS_URL =
  process.env.NEXT_PUBLIC_WMS_URL || "https://maria-chorizos-wms.vercel.app";

/**
 * Proxy GET → WMS /api/pos/envios-matriz?estado=&limite=
 * Reenvía Authorization: Bearer del cliente.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  const base = WMS_URL.replace(/\/$/, "");
  const estado = typeof req.query.estado === "string" ? req.query.estado : "pendiente";
  const limite = typeof req.query.limite === "string" ? req.query.limite : "50";
  const url = `${base}/api/pos/envios-matriz?${new URLSearchParams({ estado, limite }).toString()}`;

  const headers: HeadersInit = {};
  const auth = req.headers.authorization;
  if (auth) headers.Authorization = auth;

  try {
    const response = await fetch(url, { headers });
    const data = await response.json().catch(() => ({}));
    return res.status(response.status).json(data);
  } catch (err) {
    const code = err instanceof Error && "code" in err ? String((err as NodeJS.ErrnoException).code) : "";
    const message =
      code === "ECONNREFUSED" || code === "ENOTFOUND"
        ? "No se pudo conectar con el WMS."
        : err instanceof Error
          ? err.message
          : "Error al conectar con el WMS";
    return res.status(503).json({ ok: false, message, data: [], pendientes: 0 });
  }
}
