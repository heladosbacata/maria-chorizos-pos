import type { NextApiRequest, NextApiResponse } from "next";
import { getWmsPublicBaseUrl } from "@/lib/wms-public-base";

/**
 * Proxy invitaciones de contador POS ↔ WMS.
 *
 * GET  → WMS GET  /api/pos/contador/invitaciones
 *      Respuesta esperada: { ok: true, cupoMax?: number, usados?: number, activos?: number,
 *        invitaciones?: [{ email, estado?, createdAt? }] }
 *
 * POST → WMS POST /api/pos/contador/invitar  body: { email: string }
 *      Auth: Authorization: Bearer <Firebase ID token> (reenviado desde el cliente).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const base = getWmsPublicBaseUrl();
  const headers: HeadersInit = {};
  const auth = req.headers.authorization;
  if (auth) headers.Authorization = auth;

  if (req.method === "GET") {
    const url = `${base}/api/pos/contador/invitaciones`;
    try {
      const response = await fetch(url, { headers });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 404) {
          return res.status(200).json({
            ok: true,
            cupoMax: 1,
            usados: 0,
            invitaciones: [],
            message: "WMS sin ruta de contador; el POS usará invitaciones por Firebase.",
          });
        }
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
      return res.status(200).json({ ok: false, message, cupoMax: 1, usados: 0, invitaciones: [] });
    }
  }

  if (req.method === "POST") {
    const body = req.body as { email?: string } | undefined;
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    if (!email) {
      return res.status(400).json({ ok: false, message: "El correo es obligatorio." });
    }
    const postHeaders: HeadersInit = { "Content-Type": "application/json" };
    if (auth) postHeaders.Authorization = auth;
    const url = `${base}/api/pos/contador/invitar`;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: postHeaders,
        body: JSON.stringify({ email }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 404) {
          return res.status(200).json({
            ok: false,
            message: "FIREBASE_INVITE",
            usarFirebase: true,
          });
        }
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

  return res.status(405).json({ ok: false, message: "Method not allowed" });
}
