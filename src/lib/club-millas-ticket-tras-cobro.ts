import {
  construirUrlConsultaClubMillas,
  MENSAJE_TIRILLA_CLUB_ACUMULADO_AUTO,
} from "@/lib/club-millas-consulta-url";
import { generarDataUrlQrPng } from "@/lib/fidelizacion-qr";
import type { TicketVentaPayload } from "@/types/impresion-pos";

export type ClubMillasCobroApiResponse = {
  ok?: boolean;
  omitido?: boolean;
  codigo?: string;
  message?: string;
  mensaje?: string;
  puntosSumados?: number;
  saldoMillas?: number;
  urlConsultaMillas?: string;
  yaAcumulado?: boolean;
};

/** Aplica en el ticket el resultado de registrar + acumular millas al cobrar. */
export type EnriquecerClubMillasTrasCobroOpts = {
  millasAntes?: number;
};

export async function enriquecerTicketConClubMillasTrasCobro(
  ticket: TicketVentaPayload,
  clubJson: ClubMillasCobroApiResponse,
  documento: string,
  opts?: EnriquecerClubMillasTrasCobroOpts
): Promise<TicketVentaPayload> {
  const millasAntesIn =
    opts?.millasAntes !== undefined && Number.isFinite(opts.millasAntes)
      ? Math.trunc(opts.millasAntes)
      : undefined;
  const msg =
    typeof clubJson.mensaje === "string"
      ? clubJson.mensaje.trim()
      : typeof clubJson.message === "string"
        ? clubJson.message.trim()
        : "";

  if (clubJson.ok === true && clubJson.omitido === true) {
    return {
      ...ticket,
      fidelizacionPayloadTexto:
        msg ||
        "Club de Millas: el total de esta factura no alcanza el mínimo para sumar millas en esta compra.",
    };
  }

  if (clubJson.ok === true && clubJson.omitido !== true) {
    const saldo = Number(clubJson.saldoMillas ?? NaN);
    if (!Number.isFinite(saldo)) {
      return {
        ...ticket,
        fidelizacionPayloadTexto: msg || "Club de Millas: no se obtuvo el saldo tras el cobro.",
      };
    }
    const puntos = Number(clubJson.puntosSumados ?? 0) || 0;
    const millasAntes =
      millasAntesIn !== undefined
        ? millasAntesIn
        : puntos > 0 && saldo >= puntos
          ? saldo - puntos
          : undefined;
    const urlConsulta =
      typeof clubJson.urlConsultaMillas === "string" && clubJson.urlConsultaMillas.trim()
        ? clubJson.urlConsultaMillas.trim()
        : construirUrlConsultaClubMillas(documento);
    const qrImg = await generarDataUrlQrPng(urlConsulta);
    return {
      ...ticket,
      ...(millasAntes !== undefined ? { clubMillasSaldoAntes: millasAntes } : {}),
      clubMillasSaldoTotal: saldo,
      clubMillasGanadasCompra: puntos,
      clubMillasConsultaUrl: urlConsulta,
      ...(qrImg ? { clubMillasConsultaQrDataUrl: qrImg } : {}),
      clubMillasMensajePie: msg || MENSAJE_TIRILLA_CLUB_ACUMULADO_AUTO,
      fidelizacionQrDataUrl: undefined,
      fidelizacionPayloadTexto: undefined,
      clubMillasCodigoCorto: undefined,
      clubMillasLandingUrl: undefined,
    };
  }

  return {
    ...ticket,
    fidelizacionPayloadTexto:
      msg || "Club de Millas: no se pudieron registrar las millas. Revisá conexión o reintentá.",
  };
}
