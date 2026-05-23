import {
  nombreArchivoReporteVentasPdf,
  textoResumenReporteVentasCorreo,
  type DatosReporteVentasPos,
} from "@/lib/ventas-reporte-pos-data";
import { pdfReporteVentasBase64 } from "@/lib/ventas-reporte-pos-pdf";

function emailValido(s: string): boolean {
  const t = s.trim();
  if (!t || t.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

export async function enviarReporteVentasPosPorCorreo(params: {
  idToken: string;
  datos: DatosReporteVentasPos;
  to: string;
  cc?: string;
}): Promise<{ ok: true; via?: string } | { ok: false; message: string }> {
  const to = params.to.trim();
  if (!emailValido(to)) {
    return { ok: false, message: "El correo del destinatario no es válido." };
  }

  const pdfBase64 = await pdfReporteVentasBase64(params.datos);
  if (!pdfBase64) {
    return { ok: false, message: "No se pudo generar el PDF del reporte." };
  }

  const d = params.datos;
  const subject = `Reporte de ventas ${d.puntoVenta} · ${d.desdeYmd}${d.desdeYmd !== d.hastaYmd ? ` a ${d.hastaYmd}` : ""}`;

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
      text: textoResumenReporteVentasCorreo(d),
      attachments: [
        {
          filename: nombreArchivoReporteVentasPdf(d),
          contentBase64: pdfBase64,
          contentType: "application/pdf",
        },
      ],
    }),
  });

  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; via?: string };
  if (!res.ok || !data.ok) {
    const msg = data.message?.trim() || `Error ${res.status} al enviar correo.`;
    return { ok: false, message: msg };
  }
  return { ok: true, via: data.via };
}
