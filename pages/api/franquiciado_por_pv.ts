import type { NextApiRequest, NextApiResponse } from "next";

const WMS_URL =
  process.env.NEXT_PUBLIC_WMS_URL || "https://maria-chorizos-wms.vercel.app";

/**
 * Proxy: ficha del franquiciado asociada al punto de venta.
 * WMS esperado: GET /api/pos/franquiciado?puntoVenta=...
 * Respuesta sugerida: { ok: true, franquiciado: { ... } } o { ok: true, data: { ... } }
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  const puntoVenta = req.query.puntoVenta;
  if (!puntoVenta || typeof puntoVenta !== "string" || puntoVenta.trim() === "") {
    return res.status(400).json({
      ok: false,
      message: "Parámetro puntoVenta es obligatorio",
    });
  }

  const base = WMS_URL.replace(/\/$/, "");
  const url = `${base}/api/pos/franquiciado?puntoVenta=${encodeURIComponent(puntoVenta.trim())}`;
  const headers: HeadersInit = {};
  const auth = req.headers.authorization;
  if (auth) headers.Authorization = auth;

  try {
    const response = await fetch(url, { headers });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return res.status(response.status).json({
        ok: false,
        message: data?.message || data?.error || `Error ${response.status}`,
      });
    }

    return res.status(200).json(data);
  } catch (err) {
    const code = err instanceof Error && "code" in err ? String((err as NodeJS.ErrnoException).code) : "";
    const message =
      code === "ECONNREFUSED" || code === "ENOTFOUND"
        ? "No se pudo conectar con el WMS."
        : err instanceof Error
          ? err.message
          : "Error al conectar con el WMS";
    return res.status(200).json({ ok: false, message, franquiciado: null });
  }
}
