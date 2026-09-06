/**
 * Envío del resumen de «Ajuste de inventario» por correo (API informe POS).
 */

import { fechaHoraColombia } from "@/lib/fecha-colombia";
import { mensajeErrorEnvioReporteCorreo } from "@/lib/ventas-reporte-pos-data";

function emailValido(s: string): boolean {
  const t = s.trim();
  if (!t || t.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

export type LineaAjusteInventarioCorreo = {
  sku: string;
  descripcion: string;
  saldoAnterior: number;
  saldoNuevo: number;
  delta: number;
};

export type DatosAjusteInventarioCorreo = {
  puntoVenta: string;
  fechaAjusteYmd: string;
  ajustadoPorNombre: string;
  motivo: string;
  lineas: LineaAjusteInventarioCorreo[];
  generadoIso?: string;
};

export function textoResumenAjusteInventarioCorreo(d: DatosAjusteInventarioCorreo): string {
  const lineas = d.lineas
    .map(
      (l) =>
        `· ${l.sku} — ${l.descripcion}: ${l.saldoAnterior} → ${l.saldoNuevo} (${l.delta >= 0 ? "+" : ""}${l.delta})`
    )
    .join("\n");
  return [
    `Ajuste de inventario — ${d.puntoVenta}`,
    `Fecha del ajuste: ${d.fechaAjusteYmd}`,
    `Realizado por: ${d.ajustadoPorNombre}`,
    `Motivo: ${d.motivo}`,
    "",
    "Detalle:",
    lineas || "(sin líneas)",
    "",
    `Generado: ${fechaHoraColombia(new Date(d.generadoIso ?? Date.now()), { dateStyle: "short", timeStyle: "short" })}`,
  ].join("\n");
}

export function htmlResumenAjusteInventarioCorreo(d: DatosAjusteInventarioCorreo): string {
  const filas = d.lineas
    .map((l) => {
      const signo = l.delta >= 0 ? "+" : "";
      const color = l.delta >= 0 ? "#047857" : "#b91c1c";
      return `<tr>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-family:monospace;font-size:12px;">${escapeHtml(l.sku)}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:13px;">${escapeHtml(l.descripcion)}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;font-variant-numeric:tabular-nums;">${l.saldoAnterior}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;font-variant-numeric:tabular-nums;">${l.saldoNuevo}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:700;color:${color};font-variant-numeric:tabular-nums;">${signo}${l.delta}</td>
      </tr>`;
    })
    .join("");

  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="640" style="max-width:640px;width:100%;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr><td style="background:#C41E3A;padding:20px 24px;color:#fff;">
          <p style="margin:0;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#FFC81C;font-weight:700;">POS GEB · Inventarios</p>
          <h1 style="margin:8px 0 0;font-size:22px;">Ajuste de inventario</h1>
        </td></tr>
        <tr><td style="padding:20px 24px;color:#111827;font-size:14px;line-height:1.5;">
          <p style="margin:0 0 8px;"><strong>Punto de venta:</strong> ${escapeHtml(d.puntoVenta)}</p>
          <p style="margin:0 0 8px;"><strong>Fecha del ajuste:</strong> ${escapeHtml(d.fechaAjusteYmd)}</p>
          <p style="margin:0 0 8px;"><strong>Realizado por:</strong> ${escapeHtml(d.ajustadoPorNombre)}</p>
          <p style="margin:0 0 16px;"><strong>Motivo:</strong> ${escapeHtml(d.motivo)}</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;">
            <thead>
              <tr style="background:#f9fafb;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280;">
                <th style="padding:8px;">Código</th>
                <th style="padding:8px;">Descripción</th>
                <th style="padding:8px;text-align:right;">Antes</th>
                <th style="padding:8px;text-align:right;">Después</th>
                <th style="padding:8px;text-align:right;">Delta</th>
              </tr>
            </thead>
            <tbody>${filas || `<tr><td colspan="5" style="padding:12px;color:#6b7280;">Sin cambios</td></tr>`}</tbody>
          </table>
          <p style="margin:16px 0 0;font-size:12px;color:#6b7280;">
            Generado ${escapeHtml(
              fechaHoraColombia(new Date(d.generadoIso ?? Date.now()), { dateStyle: "short", timeStyle: "short" })
            )}. Los saldos del módulo Inventarios quedan actualizados en el POS.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function enviarResumenAjusteInventarioPorCorreo(params: {
  idToken: string;
  datos: DatosAjusteInventarioCorreo;
  to: string;
  cc?: string;
}): Promise<{ ok: true; via?: string } | { ok: false; message: string }> {
  const to = params.to.trim();
  if (!emailValido(to)) {
    return { ok: false, message: "El correo del destinatario no es válido." };
  }
  const d = { ...params.datos, generadoIso: params.datos.generadoIso ?? new Date().toISOString() };
  const subject = `Ajuste de inventario · ${d.puntoVenta} · ${d.fechaAjusteYmd}`;
  const res = await fetch("/api/pos_turno_informe_correo", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.idToken}`,
    },
    body: JSON.stringify({
      to,
      ...(params.cc?.trim() ? { cc: params.cc.trim() } : {}),
      subject,
      text: textoResumenAjusteInventarioCorreo(d),
      html: htmlResumenAjusteInventarioCorreo(d),
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; via?: string };
  if (!res.ok || !data.ok) {
    return { ok: false, message: mensajeErrorEnvioReporteCorreo(res.status, data.message) };
  }
  return { ok: true, via: data.via };
}
