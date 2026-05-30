import {
  aplicarPieClubMillasEnTicket,
  ticketTieneQrAcumulacionClubMillas,
} from "@/lib/club-millas-invitacion-ticket";
import { enriquecerTicketConQrDomicilios } from "@/lib/domicilios-qr-ticket";
import {
  contenidoQrEscaneableClubMillasDesdeTicket,
  generarDataUrlQrPng,
} from "@/lib/fidelizacion-qr";
import type { TicketVentaPayload } from "@/types/impresion-pos";

/** Si el WMS devolvió URL/token pero falló la imagen PNG, la genera antes de imprimir. */
async function asegurarImagenQrAcumulacionClub(ticket: TicketVentaPayload): Promise<TicketVentaPayload> {
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
  t = await asegurarImagenQrAcumulacionClub(t);
  t = await aplicarPieClubMillasEnTicket(t);
  t = await asegurarImagenQrInvitacionClub(t);
  return t;
}
