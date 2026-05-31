import type { NextApiRequest, NextApiResponse } from "next";
import { enviarCorreoComoInformePos } from "@/lib/enviar-correo-informe-pos-servidor";
import type { InformeAdjuntoCorreo } from "@/lib/email-informe-turno-smtp";
import {
  mensajeCorreoPosSinConfigLocal,
  proxyPosApiRoute,
  puedeUsarPosDeployProxyLocal,
} from "@/lib/pos-ventas-cloud-proxy-server";

type Ok = { ok: true; via?: string };
type Err = { ok: false; error?: string; message?: string };

function validarSecret(req: NextApiRequest): boolean {
  const expected = process.env.CLUB_MILLAS_POS_SECRET?.trim();
  if (!expected) return false;
  const h = req.headers["x-club-millas-pos-secret"];
  return typeof h === "string" && h.trim() === expected;
}

/**
 * Envío servidor a servidor con la misma lógica que informe de ventas / cierre
 * (POST /api/pos_turno_informe_correo). Usado por el WMS (Club de millas, etc.).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse<Ok | Err>) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  if (!validarSecret(req)) {
    return res.status(401).json({ ok: false, error: "No autorizado." });
  }

  const body = (typeof req.body === "object" && req.body !== null ? req.body : {}) as {
    to?: unknown;
    subject?: unknown;
    text?: unknown;
    html?: unknown;
    cc?: unknown;
    attachments?: unknown;
  };

  const to = typeof body.to === "string" ? body.to.trim() : "";
  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const text = typeof body.text === "string" ? body.text : "";
  const html = typeof body.html === "string" ? body.html : text;

  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return res.status(400).json({ ok: false, error: "Destinatario inválido." });
  }
  if (!subject || !text.trim()) {
    return res.status(400).json({ ok: false, error: "Faltan asunto o cuerpo." });
  }

  const cc =
    typeof body.cc === "string"
      ? body.cc
          .split(/[,;]/)
          .map((x) => x.trim())
          .filter(Boolean)
      : [];

  const attachments = Array.isArray(body.attachments)
    ? body.attachments.filter(
        (a): a is InformeAdjuntoCorreo =>
          Boolean(
            a &&
              typeof a === "object" &&
              typeof (a as InformeAdjuntoCorreo).filename === "string" &&
              typeof (a as InformeAdjuntoCorreo).contentBase64 === "string"
          )
      )
    : [];

  const envio = await enviarCorreoComoInformePos({ to, subject, text, html, cc, attachments });
  if (!envio.ok) {
    if (puedeUsarPosDeployProxyLocal()) {
      const proxied = await proxyPosApiRoute(req, "pos_correo_informe_servicio");
      if (proxied) {
        const proxBody = proxied.body as Ok | Err;
        return res.status(proxied.status).json(proxBody);
      }
    }
    return res.status(200).json({ ok: false, error: envio.message, message: envio.message });
  }

  return res.status(200).json({ ok: true, via: envio.via });
}
