import {
  aplicarPieClubMillasEnTicket,
  ticketTieneQrAcumulacionClubMillas,
} from "@/lib/club-millas-invitacion-ticket";
import { enriquecerTicketConQrDomicilios } from "@/lib/domicilios-qr-ticket";
import { ticketTieneSaldoClubMillasEnTirilla } from "@/lib/club-millas-invitacion-ticket";
import {
  contenidoQrEscaneableClubMillasDesdeTicket,
  generarDataUrlQrPng,
} from "@/lib/fidelizacion-qr";
import type { TicketVentaPayload } from "@/types/impresion-pos";

/** PNG del QR de consulta Mi plan si solo vino la URL. */
async function asegurarImagenQrConsultaClub(ticket: TicketVentaPayload): Promise<TicketVentaPayload> {
  if (ticket.clubMillasConsultaQrDataUrl?.trim()) return ticket;
  const url = ticket.clubMillasConsultaUrl?.trim();
  if (!url) return ticket;
  const dataUrl = await generarDataUrlQrPng(url);
  return dataUrl ? { ...ticket, clubMillasConsultaQrDataUrl: dataUrl } : ticket;
}

/** Legacy: QR de acumulación manual si aún viene en el ticket. */
async function asegurarImagenQrAcumulacionClub(ticket: TicketVentaPayload): Promise<TicketVentaPayload> {
  if (ticketTieneSaldoClubMillasEnTirilla(ticket)) return ticket;
  if (ticket.fidelizacionQrDataUrl?.trim()) return ticket;
  const contenido = contenidoQrEscaneableClubMillasDesdeTicket(ticket);
  if (!contenido) return ticket;
  const dataUrl = await generarDataUrlQrPng(contenido);
  return dataUrl ? { ...ticket, fidelizacionQrDataUrl: dataUrl } : ticket;
}

async function asegurarImagenQrInvitacionClub(ticket: TicketVentaPayload): Promise<TicketVentaPayload> {
  if (ticketTieneQrAcumulacionClubMillas(ticket)) return ticket;
  if (ticket.clubMillasInvitacionQrDataUrl?.trim()) return ticket;
  const url = ticket.clubMillasInvitacionUrl?.trim();
  if (!url) return ticket;
  const dataUrl = await generarDataUrlQrPng(url);
  return dataUrl ? { ...ticket, clubMillasInvitacionQrDataUrl: dataUrl } : ticket;
}

/**
 * QR de domicilios del punto + invitación Club de Millas (si no hay QR de cliente frecuente).
 * Debe aplicarse al cobrar antes de vista previa / impresión (no solo en reimpresiones).
 */
export async function enriquecerTicketTirillaAlCobrar(
  ticket: TicketVentaPayload,
  origin?: string
): Promise<TicketVentaPayload> {
  let t = await enriquecerTicketConQrDomicilios(ticket, origin);
  t = await aplicarPieClubMillasEnTicket(t);
  const [conConsulta, conAcumulacion, conInvitacion] = await Promise.all([
    asegurarImagenQrConsultaClub(t),
    asegurarImagenQrAcumulacionClub(t),
    asegurarImagenQrInvitacionClub(t),
  ]);
  return {
    ...t,
    ...(conConsulta.clubMillasConsultaQrDataUrl
      ? { clubMillasConsultaQrDataUrl: conConsulta.clubMillasConsultaQrDataUrl }
      : {}),
    ...(conAcumulacion.fidelizacionQrDataUrl
      ? { fidelizacionQrDataUrl: conAcumulacion.fidelizacionQrDataUrl }
      : {}),
    ...(conInvitacion.clubMillasInvitacionQrDataUrl
      ? { clubMillasInvitacionQrDataUrl: conInvitacion.clubMillasInvitacionQrDataUrl }
      : {}),
    ...(conInvitacion.clubMillasInvitacionUrl
      ? { clubMillasInvitacionUrl: conInvitacion.clubMillasInvitacionUrl }
      : {}),
  };
}
