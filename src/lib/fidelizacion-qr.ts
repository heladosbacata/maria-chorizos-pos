import QRCode from "qrcode";
import { CLUB_MILLAS_PORTAL_URL } from "@/lib/wms-club-millas-premios";

export interface FidelizacionLineaSku {
  sku: string;
  cantidad: number;
}

/** Ticket POS registrado en WMS (formato acordado). */
export const PREFIJO_TICKET_CLUB_MILLAS = "BACATA-CLUB-V1-";
const RE_TICKET_CLUB_MILLAS = /^BACATA-CLUB-V1-[0-9a-fA-F]{32}$/;

export type ModoContenidoQrClubMillas = "token" | "url";

/** Textos del pie de tirilla (cliente frecuente). */
export const MENSAJE_TIRILLA_CLUB_FRECUENTE_TITULO = "CLUB DE MILLAS — ACUMULA TUS MILLAS";
export const MENSAJE_TIRILLA_CLUB_FRECUENTE_PASO1 =
  "1. Escanea el QR e ingresa en maria-chorizos-wms.vercel.app/club-de-millas";
export const MENSAJE_TIRILLA_CLUB_FRECUENTE_PASO2 =
  "2. Tras iniciar sesion, escanea de nuevo este QR en Mi plan para acumular";

/**
 * url (defecto): abre /club-de-millas?c=BACATA-… (login y luego acumular en Mi plan).
 * token: solo BACATA-CLUB-V1-… para escaner premium que no lee URLs.
 */
export function modoContenidoQrClubMillas(): ModoContenidoQrClubMillas {
  const m = process.env.NEXT_PUBLIC_CLUB_MILLAS_QR_MODO?.trim().toLowerCase();
  return m === "token" ? "token" : "url";
}

/** Query en landing WMS; el portal usa `c` (ver clubMillasPosTicket en WMS). */
export function parametroQueryQrClubMillas(): string {
  const custom = process.env.NEXT_PUBLIC_CLUB_MILLAS_QR_QUERY_PARAM?.trim();
  return custom || "c";
}

function baseUrlPortalClubMillas(): string {
  const env = process.env.NEXT_PUBLIC_CLUB_MILLAS_PORTAL_URL?.trim();
  const base = (env && /^https?:\/\//i.test(env) ? env : CLUB_MILLAS_PORTAL_URL).replace(/\/$/, "");
  return base;
}

export function esTicketClubMillasPos(payload: string): boolean {
  return RE_TICKET_CLUB_MILLAS.test(payload.replace(/\s+/g, "").trim());
}

/**
 * Normaliza lo que devuelve el escáner (token plano, URL con ?qr= o ?codigo=, JSON legacy).
 */
export function extraerCodigoQrClubDesdeTextoLeido(texto: string): string {
  const t = texto.replace(/\s+/g, " ").trim();
  if (!t) return "";
  if (esTicketClubMillasPos(t)) return t.replace(/\s+/g, "");
  try {
    if (/^https?:\/\//i.test(t)) {
      const u = new URL(t);
      for (const key of ["c", "qr", "codigo", "qrCode", "ticket", "payload"]) {
        const v = u.searchParams.get(key)?.trim();
        if (v && (esTicketClubMillasPos(v) || v.length > 8)) return v.replace(/\s+/g, "");
      }
      const pathTail = u.pathname.split("/").filter(Boolean).pop() ?? "";
      if (esTicketClubMillasPos(pathTail)) return pathTail;
    }
  } catch {
    /* ignore */
  }
  const match = t.match(/BACATA-CLUB-V1-[0-9a-fA-F]{32}/i);
  if (match) return match[0]!.toUpperCase();
  return t.replace(/\s+/g, "");
}

/**
 * URL del portal para flujo «abrir en navegador → login → acumular».
 */
export function construirUrlPortalClubMillasConCodigo(qrPayload: string): string {
  const limpio = extraerCodigoQrClubDesdeTextoLeido(qrPayload);
  if (!limpio) return baseUrlPortalClubMillas();
  const u = new URL(baseUrlPortalClubMillas());
  u.searchParams.set(parametroQueryQrClubMillas(), limpio);
  return u.toString();
}

/** Texto exacto que debe ir codificado en el QR de la tirilla. */
export function contenidoQrImpresoClubMillas(qrPayload: string): string {
  const limpio = qrPayload.replace(/\s+/g, "").trim();
  if (!limpio) return "";
  if (modoContenidoQrClubMillas() === "url" && esTicketClubMillasPos(limpio)) {
    return construirUrlPortalClubMillasConCodigo(limpio);
  }
  return limpio;
}

/**
 * JSON compacto legacy (doc. interno sin ticket WMS). Preferir registrar-ticket en caja.
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
  payloadOriginal: string;
  /** Lo que el lector QR devuelve (token o URL según modo). */
  contenidoImpreso: string;
  dataUrl: string;
};

export async function generarQrTirillaClubMillas(
  qrPayload: string,
  qrUrlPreferida?: string
): Promise<QrTirillaClubMillasGenerado> {
  const payloadOriginal = qrPayload.replace(/\s+/g, "").trim();
  const urlWms = qrUrlPreferida?.trim();
  const contenidoImpreso =
    urlWms && /^https?:\/\//i.test(urlWms)
      ? urlWms
      : contenidoQrImpresoClubMillas(payloadOriginal);
  const dataUrl = await QRCode.toDataURL(contenidoImpreso, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 220,
    type: "image/png",
  });
  return { payloadOriginal, contenidoImpreso, dataUrl };
}

/** @deprecated Usar generarQrTirillaClubMillas. */
export async function generarDataUrlQrFidelizacion(payloadUtf8: string): Promise<string> {
  const { dataUrl } = await generarQrTirillaClubMillas(payloadUtf8);
  return dataUrl;
}
