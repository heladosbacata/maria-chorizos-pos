import type { NextApiRequest, NextApiResponse } from "next";

const WMS_URL =
  process.env.NEXT_PUBLIC_WMS_URL || "https://maria-chorizos-wms.vercel.app";

/**
 * Actualiza datos de un cajero POS en el WMS (p. ej. punto de venta).
 *
 * WMS esperado: PATCH o POST /api/pos/usuarios/actualizar
 * Body: { email: string, puntoVenta?: string, ... }
 * Auth: Bearer ID token.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST" && req.method !== "PATCH") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  const body = req.body as { email?: string; puntoVenta?: string } | undefined;
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  if (!email) {
    return res.status(400).json({ ok: false, message: "El correo del usuario es obligatorio." });
  }

  const base = WMS_URL.replace(/\/$/, "");
  const url = `${base}/api/pos/usuarios/actualizar`;
  const auth = req.headers.authorization;
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (auth) headers.Authorization = auth;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body ?? {}),
    });
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
    return res.status(502).json({ ok: false, message });
  }
}
