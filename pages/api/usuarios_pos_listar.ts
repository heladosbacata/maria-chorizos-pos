import type { NextApiRequest, NextApiResponse } from "next";

const WMS_URL =
  process.env.NEXT_PUBLIC_WMS_URL || "https://maria-chorizos-wms.vercel.app";

/**
 * Proxy al WMS: contrato del cajero (Firestore por usuario).
 *
 * WMS: GET /api/pos/usuarios/registrados
 * Base: NEXT_PUBLIC_WMS_URL (dev típico http://localhost:3002; prod Vercel del WMS, p. ej. maria-chorizos-wms.vercel.app).
 * Auth: reenvía Authorization: Bearer <ID token Firebase> (mismo proyecto que valida el WMS).
 *
 * 200: { ok: true, usuarios: [ { ... } ] } — suele ser un solo elemento (usuario autenticado).
 * Campos útiles: email, uid, puntoVenta, fechaInicio, fechaVencimiento (ISO), contratoNombre,
 * contratoFechaInicio, contratoFechaVencimiento, referenciaContrato, numeroContrato, diasRestantes (pueden ser null).
 * Errores WMS: 401 sin token o inválido; 403 si no es usuario POS; 404 sin documento en users.
 * CORS en el WMS: permitir origen del POS (p. ej. maria-chorizos-pos.vercel.app y localhost del POS).
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  const base = WMS_URL.replace(/\/$/, "");
  const url = `${base}/api/pos/usuarios/registrados`;
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
    return res.status(200).json({ ok: false, message, usuarios: [] });
  }
}
