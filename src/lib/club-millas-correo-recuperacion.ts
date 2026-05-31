function urlPortalClubMillas(): string {
  const miPlan =
    process.env.CLUB_MILLAS_MI_PLAN_URL?.trim() ||
    process.env.NEXT_PUBLIC_CLUB_MILLAS_MI_PLAN_URL?.trim();
  if (miPlan) {
    const base = miPlan.replace(/\/mi-plan\/?$/i, "").replace(/\/$/, "");
    return base || miPlan;
  }
  return (
    process.env.NEXT_PUBLIC_CLUB_MILLAS_PORTAL_URL?.trim() ||
    "https://maria-chorizos-wms.vercel.app/club-de-millas"
  ).replace(/\/$/, "");
}

function escapeHtmlEmail(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function construirCorreoRecuperacionClaveClubMillas(opts: {
  nombreDisplay: string;
  pin: string;
  documento: string;
}): { subject: string; text: string; html: string } {
  const nombre = opts.nombreDisplay.trim() || "Cliente";
  const pin = opts.pin.trim();
  const doc = opts.documento.trim();
  const linkPortal = urlPortalClubMillas();

  const subject = "María Chorizos — tu clave del plan de millas";

  const text = [
    `Hola, ${nombre}.`,
    "",
    "Recibimos tu solicitud para recordar la clave del Club de Millas.",
    "",
    `Documento: ${doc}`,
    `Tu clave de acceso (4 dígitos) es: ${pin}`,
    "",
    `Ingresá en: ${linkPortal}`,
    "Usá tu número de documento y esta clave de 4 dígitos.",
    "",
    "Si no solicitaste este correo, ignorá el mensaje o acercate a tu punto de venta María Chorizos.",
    "",
    "— María Chorizos · Grupo Empresarial Bacatá",
  ].join("\n");

  const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8" /></head>
<body style="font-family:system-ui,Segoe UI,sans-serif;line-height:1.5;color:#1e293b;max-width:560px;margin:0 auto;padding:24px;">
  <p>Hola, <strong>${escapeHtmlEmail(nombre)}</strong>,</p>
  <p>Recibimos tu solicitud para recordar la clave del <strong>Club de Millas</strong>.</p>
  <p>Documento: <strong>${escapeHtmlEmail(doc)}</strong></p>
  <p>Tu <strong>clave de acceso</strong> al plan de millas (4 dígitos) es:</p>
  <p style="font-size:1.75rem;letter-spacing:0.2em;font-weight:800;color:#b45309;margin:16px 0;">${escapeHtmlEmail(pin)}</p>
  <p><a href="${escapeHtmlEmail(linkPortal)}" style="color:#0d9488;font-weight:600;">Ingresar al Club de Millas</a></p>
  <p style="font-size:0.85rem;color:#64748b;margin-top:32px;">Si no solicitaste este correo, ignorá el mensaje.<br/>— María Chorizos · Grupo Empresarial Bacatá</p>
</body>
</html>`.trim();

  return { subject, text, html };
}

export function enmascararCorreoClubMillas(correo: string): string {
  const c = correo.trim().toLowerCase();
  const at = c.indexOf("@");
  if (at <= 0) return "tu correo registrado";
  const user = c.slice(0, at);
  const dom = c.slice(at + 1);
  const uShow = user.length <= 2 ? user : `${user.slice(0, 2)}***`;
  return `${uShow}@${dom}`;
}
