import QRCode from "qrcode";
import { construirLandingPedidosUrl } from "@/lib/pos-domicilios-landing-url";
import type { TicketVentaPayload } from "@/types/impresion-pos";

export const MENSAJE_DOMICILIOS_TIRILLA_LINEA1 = "No olvides pedir tus domicilios";
export const MENSAJE_DOMICILIOS_TIRILLA_LINEA2 = "AQUI";

/** Añade QR y URL de pedidos del punto de venta al ticket de tirilla. */
export async function enriquecerTicketConQrDomicilios(
  ticket: TicketVentaPayload,
  origin?: string
): Promise<TicketVentaPayload> {
  const pv = ticket.puntoVenta?.trim();
  if (!pv) return ticket;
  const resolvedOrigin =
    origin?.trim() || (typeof window !== "undefined" ? window.location.origin : undefined);
  const landingUrl = construirLandingPedidosUrl(pv, resolvedOrigin);
  try {
    const domiciliosQrDataUrl = await QRCode.toDataURL(landingUrl, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 200,
      type: "image/png",
    });
    return { ...ticket, domiciliosQrDataUrl, domiciliosLandingUrl: landingUrl };
  } catch (e) {
    console.warn("[POS] QR domicilios en tirilla:", e);
    return { ...ticket, domiciliosLandingUrl: landingUrl };
  }
}
