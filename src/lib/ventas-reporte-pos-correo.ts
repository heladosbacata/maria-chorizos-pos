import {
  estimaAdjuntoCorreoDemasiadoGrande,
  mensajeErrorEnvioReporteCorreo,
  nombreArchivoReporteVentasPdf,
  prepararDatosReporteParaCorreo,
  textoResumenReporteVentasCorreo,
  type DatosReporteVentasPos,
} from "@/lib/ventas-reporte-pos-data";
import { pdfReporteVentasBase64 } from "@/lib/ventas-reporte-pos-pdf";

function emailValido(s: string): boolean {
  const t = s.trim();
  if (!t || t.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

export type EnviarReporteVentasCorreoResult =
  | { ok: true; via?: string; aviso?: string }
  | { ok: false; message: string };

async function generarPdfCorreo(d: DatosReporteVentasPos, notaCorreo?: string) {
  return pdfReporteVentasBase64(d, {
    paraCorreo: true,
    ...(notaCorreo ? { notaAdaptacionCorreo: notaCorreo } : {}),
  });
}

export async function enviarReporteVentasPosPorCorreo(params: {
  idToken: string;
  datos: DatosReporteVentasPos;
  to: string;
  cc?: string;
}): Promise<EnviarReporteVentasCorreoResult> {
  const to = params.to.trim();
  if (!emailValido(to)) {
    return { ok: false, message: "El correo del destinatario no es válido." };
  }

  let { datos: datosCorreo, notaCorreo } = prepararDatosReporteParaCorreo(params.datos);
  let pdfBase64 = await generarPdfCorreo(datosCorreo, notaCorreo);

  if (estimaAdjuntoCorreoDemasiadoGrande(pdfBase64)) {
    datosCorreo = {
      ...datosCorreo,
      nivel: "resumen",
      transacciones: [],
      productosAgregados: [],
      detallePorVenta: [],
    };
    notaCorreo =
      (notaCorreo ? `${notaCorreo}\n\n` : "") +
      "Aun así el archivo superaba el límite: se envió solo el resumen ejecutivo. Usá «Descargar PDF» para el informe completo.";
    pdfBase64 = await generarPdfCorreo(datosCorreo, notaCorreo);
  }

  if (!pdfBase64 || estimaAdjuntoCorreoDemasiadoGrande(pdfBase64)) {
    return {
      ok: false,
      message:
        "El reporte sigue siendo demasiado grande para correo. Acortá el rango de fechas o descargá el PDF en tu equipo.",
    };
  }

  const d = datosCorreo;
  const periodo =
    d.periodoLabel?.trim() ||
    `${d.desdeYmd}${d.desdeYmd !== d.hastaYmd ? ` a ${d.hastaYmd}` : ""}`;
  const subject = `Reporte de ventas ${d.puntoVenta} · ${periodo}`;
  let texto = textoResumenReporteVentasCorreo(d);
  if (notaCorreo?.trim()) {
    texto += `\n\nNota: ${notaCorreo.trim()}`;
  }

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
      text: texto,
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
    return {
      ok: false,
      message: mensajeErrorEnvioReporteCorreo(res.status, data.message),
    };
  }
  return {
    ok: true,
    via: data.via,
    ...(notaCorreo?.trim() ? { aviso: notaCorreo.trim() } : {}),
  };
}
