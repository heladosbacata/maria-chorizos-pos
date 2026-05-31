import {
  enviarInformeTurnoPorSmtp,
  type InformeAdjuntoCorreo,
  remitenteSmtpInformeTurno,
  smtpInformeTurnoConfigured,
} from "@/lib/email-informe-turno-smtp";
import { detectCierreEmailBackend, sendPosCierreInformeEmail } from "@/lib/posCierreInformeEmail";
import { mensajeCorreoPosSinConfigLocal } from "@/lib/pos-ventas-cloud-proxy-server";

export type EnviarCorreoInformePosOpts = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  cc?: string[];
  attachments?: InformeAdjuntoCorreo[];
};

export type EnviarCorreoInformePosResult =
  | { ok: true; via: string; id?: string }
  | { ok: false; message: string };

/**
 * Misma lógica que POST /api/pos_turno_informe_correo (informe de ventas, cierre de turno, etc.).
 * 1) SMTP_HOST/SMTP_USER/SMTP_PASS  2) Zoho SMTP  3) Resend
 */
export async function enviarCorreoComoInformePos(
  opts: EnviarCorreoInformePosOpts
): Promise<EnviarCorreoInformePosResult> {
  const to = opts.to.trim();
  const subject = opts.subject.trim();
  const text = opts.text.trim();
  const html = opts.html?.trim();
  const cc = opts.cc ?? [];
  const attachments = opts.attachments ?? [];

  if (!to || !subject || !text) {
    return { ok: false, message: "Faltan destinatario, asunto o cuerpo del correo." };
  }

  if (smtpInformeTurnoConfigured()) {
    const smtp = await enviarInformeTurnoPorSmtp({
      from: remitenteSmtpInformeTurno(),
      to,
      cc,
      subject,
      text,
      html,
      attachments,
    });
    if (!smtp.ok) return { ok: false, message: smtp.message };
    return { ok: true, via: "smtp" };
  }

  if (detectCierreEmailBackend() !== null) {
    const resultado = await sendPosCierreInformeEmail({
      to,
      subject,
      text,
      html,
      attachments,
      ...(cc.length > 0 ? { cc } : {}),
    });
    if (!resultado.ok) return { ok: false, message: resultado.error };
    return { ok: true, via: resultado.via, ...(resultado.id ? { id: resultado.id } : {}) };
  }

  return { ok: false, message: mensajeCorreoPosSinConfigLocal() };
}
