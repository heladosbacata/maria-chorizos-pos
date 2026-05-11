import { enviarInformeTurnoPorSmtp, remitenteSmtpInformeTurno, smtpInformeTurnoConfigured } from "@/lib/email-informe-turno-smtp";
import { detectCierreEmailBackend, sendPosCierreInformeEmail } from "@/lib/posCierreInformeEmail";

/**
 * Envío transaccional desde APIs del POS (misma prioridad que informe de turno).
 * 1) SMTP genérico 2) Zoho / Resend vía `sendPosCierreInformeEmail`.
 */
export async function enviarCorreoTransaccionalPos(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  cc?: string[];
}): Promise<{ ok: true; via: "smtp" | "zoho" | "resend" } | { ok: false; error: string }> {
  if (smtpInformeTurnoConfigured()) {
    const smtp = await enviarInformeTurnoPorSmtp({
      from: remitenteSmtpInformeTurno(),
      to: opts.to,
      cc: opts.cc ?? [],
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    });
    if (!smtp.ok) return { ok: false, error: smtp.message };
    return { ok: true, via: "smtp" };
  }
  if (detectCierreEmailBackend() === null) {
    return {
      ok: false,
      error:
        "Correo no configurado. Define SMTP_HOST, SMTP_USER y SMTP_PASS; o ZOHO_SMTP_USER y ZOHO_SMTP_PASSWORD; o RESEND_API_KEY (+ RESEND_FROM).",
    };
  }
  const r = await sendPosCierreInformeEmail({
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
    ...(opts.cc?.length ? { cc: opts.cc } : {}),
  });
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, via: r.via };
}
