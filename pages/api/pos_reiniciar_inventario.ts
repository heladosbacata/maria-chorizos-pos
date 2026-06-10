import type { NextApiRequest, NextApiResponse } from "next";
import { getAuth } from "firebase-admin/auth";
import { getFirebaseAdminApp, getCreadorFirestoreContext } from "@/lib/firebase-admin-server";
import { POS_CONTADOR_ROLE } from "@/lib/auth-roles";
import { enviarCorreoComoInformePos } from "@/lib/enviar-correo-informe-pos-servidor";
import { fechaHoraColombia } from "@/lib/fecha-colombia";
import { emailDesdeFichaFranquiciado } from "@/lib/franquiciado-pos";
import { reiniciarInventarioPuntoVentaAdmin } from "@/lib/reiniciar-inventario-admin";
import { getWmsPublicBaseUrl } from "@/lib/wms-public-base";

function emailValido(s: string): boolean {
  const t = s.trim();
  return t.length > 3 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

async function correoFranquiciadoDesdeWms(puntoVenta: string, token: string): Promise<string | null> {
  const base = getWmsPublicBaseUrl();
  if (!base) return null;
  try {
    const url = `${base}/api/pos/franquiciado?puntoVenta=${encodeURIComponent(puntoVenta.trim())}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return null;
    const ficha =
      data?.franquiciado && typeof data.franquiciado === "object"
        ? data.franquiciado
        : data?.data && typeof data.data === "object"
          ? data.data
          : null;
    return emailDesdeFichaFranquiciado(ficha);
  } catch {
    return null;
  }
}

/**
 * POST: lleva todos los saldos de inventario del punto de venta a cero y notifica al franquiciado.
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
        "FIREBASE_SERVICE_ACCOUNT_JSON no está configurada. No se puede reiniciar inventario desde el servidor.",
    });
  }

  const token = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7).trim() : "";
  if (!token) {
    return res.status(401).json({ ok: false, message: "Falta Authorization Bearer." });
  }

  const ctx = await getCreadorFirestoreContext(app, token);
  if (!ctx.ok) {
    return res.status(401).json({ ok: false, message: ctx.message });
  }
  if (ctx.role === POS_CONTADOR_ROLE) {
    return res.status(403).json({
      ok: false,
      message: "Las cuentas de contador no pueden reiniciar inventario.",
    });
  }
  if (!ctx.puntoVenta) {
    return res.status(400).json({ ok: false, message: "Tu perfil no tiene punto de venta." });
  }

  const b = req.body as Record<string, unknown>;
  const pvBody = typeof b.puntoVenta === "string" ? b.puntoVenta.trim() : "";
  if (pvBody !== ctx.puntoVenta) {
    return res.status(403).json({
      ok: false,
      message: "El punto de venta enviado no coincide con tu perfil.",
    });
  }

  let emailUsuario: string | null = null;
  try {
    const dec = await getAuth(app).verifyIdToken(token);
    emailUsuario = dec.email ?? null;
  } catch {
    return res.status(401).json({ ok: false, message: "Sesión inválida o token expirado." });
  }

  const reinicio = await reiniciarInventarioPuntoVentaAdmin(app, {
    puntoVenta: ctx.puntoVenta,
    uid: ctx.uid,
    email: emailUsuario,
  });
  if (!reinicio.ok) {
    return res.status(400).json({ ok: false, message: reinicio.message });
  }

  const correoBody = typeof b.correoFranquiciado === "string" ? b.correoFranquiciado.trim() : "";
  let correoFranquiciado =
    correoBody && emailValido(correoBody) ? correoBody : await correoFranquiciadoDesdeWms(ctx.puntoVenta, token);
  if (!correoFranquiciado && emailUsuario && emailValido(emailUsuario)) {
    correoFranquiciado = emailUsuario;
  }

  const ahora = fechaHoraColombia(new Date(), { dateStyle: "full", timeStyle: "short" });
  const { resumen } = reinicio;
  const subject = `⚠ Reinicio de inventario — ${ctx.puntoVenta}`;
  const text = [
    "Se ejecutó un reinicio completo de inventario en Maria Chorizos POS.",
    "",
    `Punto de venta: ${ctx.puntoVenta}`,
    `Fecha y hora (Colombia): ${ahora}`,
    `Usuario que confirmó: ${emailUsuario ?? ctx.uid}`,
    "",
    "Resumen de la operación:",
    `· Ajustes legacy (saldos POS a cero): ${resumen.legacyAjustados}`,
    `· Saldos ensamble WMS llevados a cero: ${resumen.ensambleEnCero}`,
    `· Registros que ya estaban en cero: ${resumen.yaEnCero}`,
    "",
    "Todos los saldos visibles en Inventarios quedaron en cero. El historial de movimientos se conserva;",
    "cada ítem ajustado tiene una línea de ajuste con la nota de reinicio.",
    "",
    "Si no autorizaste esta acción, contactá de inmediato a soporte o a la matriz.",
  ].join("\n");

  const html = `
    <div style="font-family:Segoe UI,system-ui,sans-serif;max-width:560px;margin:0 auto;color:#1e293b">
      <div style="background:linear-gradient(135deg,#7f1d1d,#991b1b);color:#fff;padding:20px 24px;border-radius:12px 12px 0 0">
        <h1 style="margin:0;font-size:20px">Reinicio de inventario</h1>
        <p style="margin:8px 0 0;opacity:0.9;font-size:14px">Maria Chorizos POS</p>
      </div>
      <div style="border:1px solid #e2e8f0;border-top:0;padding:24px;border-radius:0 0 12px 12px;background:#fff">
        <p style="margin:0 0 16px;line-height:1.5">Se confirmó y ejecutó un <strong>reinicio completo</strong> del inventario del punto de venta.</p>
        <table style="width:100%;font-size:14px;border-collapse:collapse">
          <tr><td style="padding:6px 0;color:#64748b">Punto de venta</td><td style="padding:6px 0;font-weight:600">${ctx.puntoVenta}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b">Fecha (Colombia)</td><td style="padding:6px 0">${ahora}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b">Usuario</td><td style="padding:6px 0">${emailUsuario ?? ctx.uid}</td></tr>
        </table>
        <ul style="margin:16px 0;padding-left:20px;line-height:1.6;font-size:14px">
          <li>Ajustes legacy a cero: <strong>${resumen.legacyAjustados}</strong></li>
          <li>Saldos ensamble WMS a cero: <strong>${resumen.ensambleEnCero}</strong></li>
          <li>Ya en cero: ${resumen.yaEnCero}</li>
        </ul>
        <p style="margin:0;font-size:13px;color:#64748b">Si no autorizaste esta acción, contactá de inmediato a soporte.</p>
      </div>
    </div>`;

  let correoEnviado = false;
  let avisoCorreo: string | undefined;
  if (correoFranquiciado) {
    const mail = await enviarCorreoComoInformePos({
      to: correoFranquiciado,
      subject,
      text,
      html,
    });
    correoEnviado = mail.ok;
    if (!mail.ok) avisoCorreo = mail.message;
  } else {
    avisoCorreo = "No se encontró correo del franquiciado; el inventario se reinició pero no se envió notificación.";
  }

  return res.status(200).json({
    ok: true,
    resumen,
    correoEnviado,
    correoDestino: correoFranquiciado ?? null,
    ...(avisoCorreo ? { avisoCorreo } : {}),
  });
}
