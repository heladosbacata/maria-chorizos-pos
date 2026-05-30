import QRCode from "qrcode";
import { CLUB_MILLAS_PORTAL_URL } from "@/lib/wms-club-millas-premios";
import type { TicketVentaPayload } from "@/types/impresion-pos";

export const CLUB_MILLAS_URL_INSCRIPCION = CLUB_MILLAS_PORTAL_URL;

export const INVITACION_CLUB_TIRILLA_TITULO = "CLUB DE MILLAS MARIA CHORIZOS";
export const INVITACION_CLUB_TIRILLA_LLAMADO = "INSCRIBITE HOY";
export const INVITACION_CLUB_TIRILLA_CUERPO =
  "Acumula millas en cada compra y reclama premios a nivel nacional. Escanea el QR y registrate gratis.";

/** Ticket con QR/código/URL BACATA de acumulación (cliente frecuente exitoso). */
export function ticketTieneQrAcumulacionClubMillas(ticket: TicketVentaPayload): boolean {
  if (ticket.fidelizacionQrDataUrl?.trim()) return true;
  const cod = ticket.clubMillasCodigoCorto?.trim().toUpperCase() ?? "";
  if (/^[A-Z0-9]{6}$/.test(cod)) return true;
  const t = ticket.fidelizacionPayloadTexto?.trim() ?? "";
  if (/^https?:\/\//i.test(t) || /^BACATA-CLUB-V1-/i.test(t)) return true;
  return false;
}

/** Mensaje de aviso/error del club (no es URL ni token escaneable). */
export function esAvisoErrorClubMillasEnTicket(ticket: TicketVentaPayload): boolean {
  const t = ticket.fidelizacionPayloadTexto?.trim() ?? "";
  if (!t || ticketTieneQrAcumulacionClubMillas(ticket)) return false;
  return /club de millas/i.test(t);
}

/** Invitación al club si no hay QR de acumulación (los avisos de error no bloquean la invitación). */
export async function aplicarPieClubMillasEnTicket(
  ticket: TicketVentaPayload
): Promise<TicketVentaPayload> {
  if (
    ticketTieneQrAcumulacionClubMillas(ticket) ||
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
