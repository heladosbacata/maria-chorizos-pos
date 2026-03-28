import type { NextApiRequest, NextApiResponse } from "next";
import { getAuth } from "firebase-admin/auth";
import { getFirebaseAdminApp } from "@/lib/firebase-admin-server";

type Body = { subject?: string; text?: string };

/**
 * Envía por correo el texto del informe de cierre de turno (Resend HTTP API).
 *
 * Requiere en el servidor:
 * - `RESEND_API_KEY`
 * - `RESEND_FROM` (ej. `Maria Chorizos <onboarding@resend.dev>`) o dominio verificado en Resend
 * - `FIREBASE_SERVICE_ACCOUNT_JSON` para validar el Bearer (mismo proyecto que el POS)
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return res.status(503).json({
      ok: false,
      message:
        "Envío por correo no configurado. Agrega RESEND_API_KEY (y RESEND_FROM) en el servidor del POS.",
    });
  }

  const app = getFirebaseAdminApp();
  if (!app) {
    return res.status(503).json({
      ok: false,
      message:
        "Firebase Admin no está configurado (FIREBASE_SERVICE_ACCOUNT_JSON). Sin esto no se valida la sesión para enviar correo.",
    });
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) {
    return res.status(401).json({ ok: false, message: "Falta Authorization Bearer." });
  }

  let destinatario: string;
  try {
    const decoded = await getAuth(app).verifyIdToken(token);
    const email = decoded.email?.trim();
    if (!email) {
      return res.status(400).json({ ok: false, message: "La cuenta no tiene correo para enviar el informe." });
    }
    destinatario = email;
  } catch {
    return res.status(401).json({ ok: false, message: "Sesión inválida o token expirado." });
  }

  const body = req.body as Body;
  const text = typeof body?.text === "string" ? body.text : "";
  if (!text.trim()) {
    return res.status(400).json({ ok: false, message: "Falta el cuerpo del informe (text)." });
  }

  const subject =
    typeof body?.subject === "string" && body.subject.trim()
      ? body.subject.trim()
      : "Informe de cierre de turno — Maria Chorizos POS";

  const from =
    process.env.RESEND_FROM?.trim() || "Maria Chorizos POS <onboarding@resend.dev>";

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [destinatario],
        subject,
        text,
      }),
    });

    const data = (await r.json().catch(() => ({}))) as { message?: string; id?: string };

    if (!r.ok) {
      return res.status(502).json({
        ok: false,
        message: data?.message || `Resend respondió ${r.status}`,
      });
    }

    return res.status(200).json({ ok: true, id: data?.id });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error al contactar Resend";
    return res.status(502).json({ ok: false, message });
  }
}
