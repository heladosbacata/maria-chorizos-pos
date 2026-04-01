import type { NextApiRequest, NextApiResponse } from "next";
import { getAuth } from "firebase-admin/auth";
import { getFirebaseAdminApp } from "@/lib/firebase-admin-server";
import {
  enviarInformeTurnoPorSmtp,
  remitenteSmtpInformeTurno,
  smtpInformeTurnoConfigured,
} from "@/lib/email-informe-turno-smtp";
import { detectCierreEmailBackend, sendPosCierreInformeEmail } from "@/lib/posCierreInformeEmail";

type Body = { subject?: string; text?: string; to?: string; cc?: string };

function emailValido(s: string): boolean {
  const t = s.trim();
  if (!t || t.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

function listaCcDesdeTexto(cc: string): string[] {
  return cc
    .split(/[,;]/)
    .map((x) => x.trim())
    .filter(Boolean)
    .filter(emailValido);
}

/**
 * Envía por correo el texto del informe de cierre de turno.
 *
 * Prioridad:
 * 1) SMTP genérico (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, …) vía `email-informe-turno-smtp`.
 * 2) Zoho como en el WMS (`ZOHO_SMTP_USER` + `ZOHO_SMTP_PASSWORD`, …) o Resend (`RESEND_API_KEY`).
 *
 * Requiere `FIREBASE_SERVICE_ACCOUNT_JSON` para validar el Bearer.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
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

  let destinatarioSesion: string | null = null;
  try {
    const decoded = await getAuth(app).verifyIdToken(token);
    destinatarioSesion = decoded.email?.trim() || null;
  } catch {
    return res.status(401).json({ ok: false, message: "Sesión inválida o token expirado." });
  }

  const usarSmtpGenerico = smtpInformeTurnoConfigured();
  const usarZohoOResend = detectCierreEmailBackend() !== null;
  if (!usarSmtpGenerico && !usarZohoOResend) {
    return res.status(503).json({
      ok: false,
      message:
        "Envío por correo no configurado. Agrega SMTP_HOST, SMTP_USER y SMTP_PASS; o ZOHO_SMTP_USER y ZOHO_SMTP_PASSWORD (mismo WMS); o RESEND_API_KEY.",
    });
  }

  const body = req.body as Body;
  const toSolicitado = typeof body?.to === "string" ? body.to.trim() : "";
  let destinatario: string;
  if (toSolicitado) {
    if (!emailValido(toSolicitado)) {
      return res.status(400).json({ ok: false, message: "El correo del destinatario no es válido." });
    }
    destinatario = toSolicitado;
  } else {
    if (!destinatarioSesion) {
      return res.status(400).json({
        ok: false,
        message: "Indica el correo del franquiciado o usa una cuenta POS con correo.",
      });
    }
    destinatario = destinatarioSesion;
  }

  const text = typeof body?.text === "string" ? body.text : "";
  if (!text.trim()) {
    return res.status(400).json({ ok: false, message: "Falta el cuerpo del informe (text)." });
  }

  const subject =
    typeof body?.subject === "string" && body.subject.trim()
      ? body.subject.trim()
      : "Informe de cierre de turno — Maria Chorizos POS";

  const ccRaw = typeof body?.cc === "string" ? body.cc : "";
  const ccList = listaCcDesdeTexto(ccRaw);
  const ccPartes = ccRaw
    .split(/[,;]/)
    .map((x) => x.trim())
    .filter(Boolean);
  if (ccPartes.length > 0 && ccList.length !== ccPartes.length) {
    return res.status(400).json({ ok: false, message: "Revisa los correos en «Con copia»: hay uno inválido." });
  }

  if (usarSmtpGenerico) {
    const from = remitenteSmtpInformeTurno();
    const smtp = await enviarInformeTurnoPorSmtp({
      from,
      to: destinatario,
      cc: ccList,
      subject,
      text,
    });
    if (!smtp.ok) {
      return res.status(502).json({ ok: false, message: smtp.message });
    }
    return res.status(200).json({ ok: true, via: "smtp" });
  }

  const resultado = await sendPosCierreInformeEmail({
    to: destinatario,
    subject,
    text,
    ...(ccList.length > 0 ? { cc: ccList } : {}),
  });

  if (!resultado.ok) {
    return res.status(502).json({ ok: false, message: resultado.error });
  }

  return res.status(200).json({
    ok: true,
    via: resultado.via,
    ...(resultado.id ? { id: resultado.id } : {}),
  });
}
