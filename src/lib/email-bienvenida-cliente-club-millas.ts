import { randomInt } from "node:crypto";
import { enviarCorreoTransaccionalPos } from "@/lib/email-pos-transaccional";

function urlMiPlanClubMillas(): string {
  return (
    process.env.CLUB_MILLAS_MI_PLAN_URL?.trim() ||
    process.env.NEXT_PUBLIC_CLUB_MILLAS_MI_PLAN_URL?.trim() ||
    "https://maria-chorizos-wms.vercel.app/club-de-millas/mi-plan"
  );
}

function urlWebMariaChorizos(): string {
  return process.env.MARIA_CHORIZOS_WEB_URL?.trim() || "https://mariachorizos.com";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** PIN de 4 dígitos (0000–9999) para primer acceso al plan de millas según indique el WMS. */
export function generarPinClubMillas4Digitos(): string {
  return randomInt(0, 10000).toString().padStart(4, "0");
}

export function construirCorreoBienvenidaClubMillas(opts: {
  nombreDisplay: string;
  pin: string;
}): { subject: string; text: string; html: string } {
  const nombre = opts.nombreDisplay.trim() || "Cliente";
  const pin = opts.pin.trim();
  const linkPlan = urlMiPlanClubMillas();
  const linkWeb = urlWebMariaChorizos();

  const subject = "María Chorizos — bienvenida al plan de millas";

  const text = [
    `Hola, ${nombre}.`,
    "",
    "Gracias por registrarte como cliente en María Chorizos.",
    "",
    `Tu clave de acceso temporal al plan de millas (4 dígitos) es: ${pin}`,
    "Conservala: la necesitarás donde el sistema te la pida para consultar o redimir puntos.",
    "",
    `Consultá tu plan y tus puntos en: ${linkPlan}`,
    "",
    `También podés conocer novedades y acceder a la marca en: ${linkWeb}`,
    "",
    "Si no solicitaste este registro, ignorá este mensaje.",
    "",
    "— María Chorizos · Grupo Empresarial Bacatá",
  ].join("\n");

  const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8" /></head>
<body style="font-family:system-ui,Segoe UI,sans-serif;line-height:1.5;color:#1e293b;max-width:560px;margin:0 auto;padding:24px;">
  <p>Hola, <strong>${escapeHtml(nombre)}</strong>,</p>
  <p>Gracias por registrarte como cliente en <strong>María Chorizos</strong>.</p>
  <p>Tu <strong>clave de acceso temporal</strong> al plan de millas (4 dígitos) es:</p>
  <p style="font-size:1.75rem;letter-spacing:0.2em;font-weight:800;color:#b45309;margin:16px 0;">${escapeHtml(pin)}</p>
  <p>Conservala: la necesitarás donde el sistema te la pida para consultar o redimir puntos.</p>
  <p><a href="${escapeHtml(linkPlan)}" style="color:#0d9488;font-weight:600;">Ver mi plan de millas y puntos</a></p>
  <p>También podés visitar <a href="${escapeHtml(linkWeb)}" style="color:#0d9488;">mariachorizos.com</a> para conocer la marca.</p>
  <p style="font-size:0.85rem;color:#64748b;margin-top:32px;">Si no solicitaste este registro, ignorá este mensaje.<br/>— María Chorizos · Grupo Empresarial Bacatá</p>
</body>
</html>`.trim();

  return { subject, text, html };
}

export async function enviarBienvenidaClienteClubMillasPorCorreo(opts: {
  to: string;
  nombreDisplay: string;
  pin: string;
}): Promise<{ ok: true; via: string } | { ok: false; error: string }> {
  const { subject, text, html } = construirCorreoBienvenidaClubMillas({
    nombreDisplay: opts.nombreDisplay,
    pin: opts.pin,
  });
  return enviarCorreoTransaccionalPos({ to: opts.to.trim(), subject, text, html });
}
