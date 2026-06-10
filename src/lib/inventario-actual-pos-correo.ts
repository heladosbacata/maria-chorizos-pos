import {
  nombreArchivoInformeInventarioActualPdf,
  textoResumenInformeInventarioCorreo,
  type DatosInformeInventarioActual,
} from "@/lib/inventario-actual-pos-data";
import { pdfInformeInventarioActualBase64 } from "@/lib/inventario-actual-pos-pdf";
import { fechaHoraColombia } from "@/lib/fecha-colombia";
import {
  estimaAdjuntoCorreoDemasiadoGrande,
  mensajeErrorEnvioReporteCorreo,
} from "@/lib/ventas-reporte-pos-data";

function emailValido(s: string): boolean {
  const t = s.trim();
  if (!t || t.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

export type EnviarInformeInventarioCorreoResult =
  | { ok: true; via?: string }
  | { ok: false; message: string };

export async function enviarInformeInventarioActualPorCorreo(params: {
  idToken: string;
  datos: DatosInformeInventarioActual;
  to: string;
  cc?: string;
}): Promise<EnviarInformeInventarioCorreoResult> {
  const to = params.to.trim();
  if (!emailValido(to)) {
    return { ok: false, message: "El correo del destinatario no es válido." };
  }

  const pdfBase64 = await pdfInformeInventarioActualBase64(params.datos);
  if (!pdfBase64 || estimaAdjuntoCorreoDemasiadoGrande(pdfBase64)) {
    return {
      ok: false,
      message:
        "El informe es demasiado grande para enviarlo por correo. Descargá el PDF en tu equipo o contactá soporte.",
    };
  }

  const d = params.datos;
  const cuando = fechaHoraColombia(new Date(d.generadoIso), { dateStyle: "short", timeStyle: "short" });
  const subject = `Inventario actual · ${d.puntoVenta} · ${cuando}`;
  const text = textoResumenInformeInventarioCorreo(d);

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
      text,
      attachments: [
        {
          filename: nombreArchivoInformeInventarioActualPdf(d),
          contentBase64: pdfBase64,
          contentType: "application/pdf",
        },
      ],
    }),
  });

  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; via?: string };
  if (!res.ok || !data.ok) {
    return {
      ok: false,
      message: mensajeErrorEnvioReporteCorreo(res.status, data.message),
    };
  }
  return { ok: true, via: data.via };
}
