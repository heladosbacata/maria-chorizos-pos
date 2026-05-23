import QRCode from "qrcode";
import { CLUB_MILLAS_PORTAL_URL } from "@/lib/wms-club-millas-premios";
import type { TicketVentaPayload } from "@/types/impresion-pos";

export const CLUB_MILLAS_URL_INSCRIPCION = CLUB_MILLAS_PORTAL_URL;

export const INVITACION_CLUB_TIRILLA_TITULO = "CLUB DE MILLAS MARIA CHORIZOS";
export const INVITACION_CLUB_TIRILLA_LLAMADO = "INSCRIBITE HOY";
export const INVITACION_CLUB_TIRILLA_CUERPO =
  "Acumula millas en cada compra y reclama premios a nivel nacional. Escanea el QR y registrate gratis.";

/** Invitacion al club si el ticket no trae QR ni texto de acumulacion (p. ej. reimpresion). */
export async function aplicarPieClubMillasEnTicket(
  ticket: TicketVentaPayload
): Promise<TicketVentaPayload> {
  if (
    ticket.fidelizacionQrDataUrl?.trim() ||
    ticket.fidelizacionPayloadTexto?.trim() ||
    ticket.clubMillasInvitacionQrDataUrl?.trim() ||
    ticket.clubMillasInvitacionUrl?.trim()
  ) {
    return ticket;
  }
  return enriquecerTicketConInvitacionClubMillas(ticket);
}

/** Añade QR de inscripcion al club (ventas sin «cliente frecuente»). */
export async function enriquecerTicketConInvitacionClubMillas(
  ticket: TicketVentaPayload
): Promise<TicketVentaPayload> {
  const url = CLUB_MILLAS_URL_INSCRIPCION;
  try {
    const clubMillasInvitacionQrDataUrl = await QRCode.toDataURL(url, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 200,
      type: "image/png",
    });
    return { ...ticket, clubMillasInvitacionQrDataUrl, clubMillasInvitacionUrl: url };
  } catch (e) {
    console.warn("[POS] QR invitacion Club de Millas:", e);
    return { ...ticket, clubMillasInvitacionUrl: url };
  }
}
