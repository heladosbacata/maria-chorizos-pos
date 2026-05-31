import type { NextApiRequest, NextApiResponse } from "next";
import { getAuth } from "firebase-admin/auth";
import { getFirebaseAdminApp } from "@/lib/firebase-admin-server";
import type { InformeAdjuntoCorreo } from "@/lib/email-informe-turno-smtp";
import { enviarCorreoComoInformePos } from "@/lib/enviar-correo-informe-pos-servidor";
import { smtpInformeTurnoConfigured } from "@/lib/email-informe-turno-smtp";
import { detectCierreEmailBackend } from "@/lib/posCierreInformeEmail";
import {
  mensajeCorreoPosSinConfigLocal,
  proxyPosApiRoute,
} from "@/lib/pos-ventas-cloud-proxy-server";

type Body = {
  subject?: string;
  text?: string;
  to?: string;
  cc?: string;
  attachments?: InformeAdjuntoCorreo[];
};

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

/** Informe de cierre, reporte de ventas por correo, etc. (requiere Bearer del cajero). */
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

  const token = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7).trim()
    : "";
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

  const correoConfigurado =
    smtpInformeTurnoConfigured() || detectCierreEmailBackend() !== null;
  if (!correoConfigurado) {
    const proxied = await proxyPosApiRoute(req, "pos_turno_informe_correo");
    if (proxied) {
      return res.status(proxied.status).json(proxied.body);
    }
    return res.status(503).json({
      ok: false,
      message: mensajeCorreoPosSinConfigLocal(),
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

  const attachments = Array.isArray(body?.attachments)
    ? body.attachments.filter(
        (attachment): attachment is InformeAdjuntoCorreo =>
          Boolean(
            attachment &&
              typeof attachment.filename === "string" &&
              attachment.filename.trim() &&
              typeof attachment.contentBase64 === "string" &&
              attachment.contentBase64.trim()
          )
      )
    : [];

  const ccRaw = typeof body?.cc === "string" ? body.cc : "";
  const ccList = listaCcDesdeTexto(ccRaw);
  const ccPartes = ccRaw
    .split(/[,;]/)
    .map((x) => x.trim())
    .filter(Boolean);
  if (ccPartes.length > 0 && ccList.length !== ccPartes.length) {
    return res.status(400).json({ ok: false, message: "Revisa los correos en «Con copia»: hay uno inválido." });
  }

  const resultado = await enviarCorreoComoInformePos({
    to: destinatario,
    subject,
    text,
    cc: ccList,
    attachments,
  });

  if (!resultado.ok) {
    return res.status(502).json({ ok: false, message: resultado.message });
  }

  return res.status(200).json({
    ok: true,
    via: resultado.via,
    ...(resultado.id ? { id: resultado.id } : {}),
  });
}
