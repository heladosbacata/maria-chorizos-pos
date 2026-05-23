import QRCode from "qrcode";
import { CLUB_MILLAS_PORTAL_URL } from "@/lib/wms-club-millas-premios";

export interface FidelizacionLineaSku {
  sku: string;
  cantidad: number;
}

/** Query en el portal WMS donde va el texto del ticket (BACATA-CLUB-V1-… o JSON legacy). */
export function parametroQueryQrClubMillas(): string {
  const custom = process.env.NEXT_PUBLIC_CLUB_MILLAS_QR_QUERY_PARAM?.trim();
  return custom || "codigo";
}

function baseUrlPortalClubMillas(): string {
  const env = process.env.NEXT_PUBLIC_CLUB_MILLAS_PORTAL_URL?.trim();
  const base = (env && /^https?:\/\//i.test(env) ? env : CLUB_MILLAS_PORTAL_URL).replace(/\/$/, "");
  return base;
}

/**
 * URL que debe codificar el QR de la tirilla: el socio entra primero a login/registro
 * y el WMS conserva el código para acumular millas una sola vez.
 */
export function construirUrlPortalClubMillasConCodigo(qrPayload: string): string {
  const limpio = qrPayload.replace(/\s+/g, "").trim();
  if (!limpio) return baseUrlPortalClubMillas();
  const u = new URL(baseUrlPortalClubMillas());
  u.searchParams.set(parametroQueryQrClubMillas(), limpio);
  return u.toString();
}

/**
 * JSON compacto para QR de fidelización (app María Chorizos).
 * Incluye id de venta para evitar doble uso; el backend puede validar y marcar consumido.
 */
export function construirPayloadFidelizacionV1(params: {
  ventaId: string;
  puntoVenta: string;
  isoTimestamp: string;
  total: number;
  lineas: FidelizacionLineaSku[];
}): string {
  const obj = {
    v: 1 as const,
    i: params.ventaId.trim(),
    p: params.puntoVenta.trim(),
    t: params.isoTimestamp.trim(),
    T: Math.round(params.total * 100) / 100,
    k: params.lineas.map((l) => [String(l.sku).trim(), Number(l.cantidad) || 0] as [string, number]),
  };
  return JSON.stringify(obj);
}

export type QrTirillaClubMillasGenerado = {
  /** Texto original del ticket (BACATA-CLUB-V1-… o JSON). */
  payloadOriginal: string;
  /** URL del portal con el código en query (contenido del QR impreso). */
  urlQr: string;
  dataUrl: string;
};

/** Genera imagen QR que abre el portal del club con el código pendiente de validar. */
export async function generarQrTirillaClubMillas(qrPayload: string): Promise<QrTirillaClubMillasGenerado> {
  const payloadOriginal = qrPayload.replace(/\s+/g, "").trim();
  const urlQr = construirUrlPortalClubMillasConCodigo(payloadOriginal);
  const dataUrl = await QRCode.toDataURL(urlQr, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 220,
    type: "image/png",
  });
  return { payloadOriginal, urlQr, dataUrl };
}

/** @deprecated Usar generarQrTirillaClubMillas (QR con URL al portal). */
export async function generarDataUrlQrFidelizacion(payloadUtf8: string): Promise<string> {
  const { dataUrl } = await generarQrTirillaClubMillas(payloadUtf8);
  return dataUrl;
}
