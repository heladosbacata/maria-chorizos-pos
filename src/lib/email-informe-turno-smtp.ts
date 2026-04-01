import nodemailer from "nodemailer";

export function smtpInformeTurnoConfigured(): boolean {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  return Boolean(host && user && pass);
}

/**
 * Envía el informe de cierre por SMTP (Gmail con app password, Outlook, hosting, etc.).
 * Variables: SMTP_HOST, SMTP_PORT (587 por defecto), SMTP_USER, SMTP_PASS, SMTP_FROM (recomendado),
 * SMTP_SECURE=1 para puerto 465; SMTP_TLS_REJECT_UNAUTHORIZED=0 solo si tu CA es autofirmada.
 */
export async function enviarInformeTurnoPorSmtp(opts: {
  from: string;
  to: string;
  cc: string[];
  subject: string;
  text: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  if (!host || !user || !pass) {
    return { ok: false, message: "Faltan SMTP_HOST, SMTP_USER o SMTP_PASS." };
  }

  const portRaw = process.env.SMTP_PORT?.trim();
  const parsed = portRaw ? parseInt(portRaw, 10) : 587;
  const port = Number.isFinite(parsed) && parsed > 0 ? parsed : 587;
  const secureEnv = process.env.SMTP_SECURE?.trim().toLowerCase();
  const secure =
    secureEnv === "1" ||
    secureEnv === "true" ||
    secureEnv === "yes" ||
    port === 465;

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    tls: {
      rejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED === "0" ? false : true,
    },
  });

  try {
    await transporter.sendMail({
      from: opts.from,
      to: opts.to,
      ...(opts.cc.length > 0 ? { cc: opts.cc.join(", ") } : {}),
      subject: opts.subject,
      text: opts.text,
    });
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error al enviar por SMTP.";
    return { ok: false, message };
  }
}

export function remitenteSmtpInformeTurno(): string {
  const from = process.env.SMTP_FROM?.trim();
  if (from) return from;
  const user = process.env.SMTP_USER?.trim();
  if (user && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user)) {
    return `Maria Chorizos POS <${user}>`;
  }
  return user ? `Maria Chorizos POS <${user}>` : "Maria Chorizos POS <noreply@localhost>";
}
