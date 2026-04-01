/**
 * Envío del informe de cierre de turno desde el servidor del POS.
 * Prioridad: Zoho SMTP (mismas variables que el WMS) → Resend API.
 */
import nodemailer from "nodemailer";

export type CierreInformeEmailPayload = {
  to: string;
  cc?: string[];
  subject: string;
  text: string;
};

export type CierreInformeEmailResult =
  | { ok: true; via: "zoho" | "resend"; id?: string }
  | { ok: false; error: string };

function getZohoConfig() {
  const user = process.env.ZOHO_SMTP_USER?.trim();
  const pass = process.env.ZOHO_SMTP_PASSWORD?.trim();
  const fromRaw = process.env.ZOHO_SMTP_FROM?.trim() || "";
  const host = process.env.ZOHO_SMTP_HOST?.trim() || "smtp.zoho.com";
  const portRaw = process.env.ZOHO_SMTP_PORT?.trim() || "465";
  const port = parseInt(portRaw, 10) || 465;
  const secureRaw = process.env.ZOHO_SMTP_SECURE?.trim()?.toLowerCase();
  const secure = secureRaw !== "false" && secureRaw !== "0";
  return { user, pass, fromRaw, host, port, secure };
}

/** Misma regla que el WMS: la dirección autenticada debe ser el remitente real. */
function buildFromAddress(user: string, fromRaw: string): string {
  if (!user) return "";
  if (!fromRaw || fromRaw === user) return user;
  const match = fromRaw.match(/^([^<]+)\s*<([^>]+)>$/);
  if (match) {
    const displayName = match[1].trim().replace(/^["']|["']$/g, "");
    if (displayName) return `"${displayName}" <${user}>`;
  }
  if (fromRaw.includes("@")) return user;
  return `"${fromRaw.trim()}" <${user}>`;
}

export function detectCierreEmailBackend(): "zoho" | "resend" | null {
  const { user, pass } = getZohoConfig();
  if (user && pass) return "zoho";
  if (process.env.RESEND_API_KEY?.trim()) return "resend";
  return null;
}

export async function sendPosCierreInformeEmail(
  payload: CierreInformeEmailPayload
): Promise<CierreInformeEmailResult> {
  const { to, cc, subject, text } = payload;
  const backend = detectCierreEmailBackend();

  if (backend === "zoho") {
    const { user, pass, fromRaw, host, port, secure } = getZohoConfig();
    if (!user || !pass) {
      return { ok: false, error: "Zoho SMTP incompleto (usuario o contraseña)." };
    }
    const fromAddress = buildFromAddress(user, fromRaw);
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });
    try {
      await transporter.sendMail({
        from: fromAddress,
        to,
        subject: subject.trim(),
        text: text.trim(),
        cc: cc?.length ? cc : undefined,
      });
      return { ok: true, via: "zoho" };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("[posCierreInformeEmail] Zoho SMTP:", message);
      return { ok: false, error: message };
    }
  }

  if (backend === "resend") {
    const apiKey = process.env.RESEND_API_KEY!.trim();
    const from =
      process.env.RESEND_FROM?.trim() || "Maria Chorizos POS <onboarding@resend.dev>";
    const body: Record<string, unknown> = {
      from,
      to: [to],
      subject: subject.trim(),
      text: text.trim(),
    };
    if (cc?.length) body.cc = cc;
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const data = (await r.json().catch(() => ({}))) as { message?: string; id?: string };
      if (!r.ok) {
        return { ok: false, error: data?.message || `Resend respondió ${r.status}` };
      }
      return { ok: true, via: "resend", id: data?.id };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Error al contactar Resend" };
    }
  }

  return {
    ok: false,
    error:
      "Correo no configurado. Define ZOHO_SMTP_USER y ZOHO_SMTP_PASSWORD (recomendado, mismo WMS) o RESEND_API_KEY (+ RESEND_FROM).",
  };
}
