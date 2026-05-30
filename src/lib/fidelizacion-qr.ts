import QRCode from "qrcode";
import { CLUB_MILLAS_PORTAL_URL } from "@/lib/wms-club-millas-premios";
import type { TicketVentaPayload } from "@/types/impresion-pos";

export interface FidelizacionLineaSku {
  sku: string;
  cantidad: number;
}

/** Ticket POS registrado en WMS (formato acordado). */
export const PREFIJO_TICKET_CLUB_MILLAS = "BACATA-CLUB-V1-";
const RE_TICKET_CLUB_MILLAS = /^BACATA-CLUB-V1-[0-9a-fA-F]{32}$/;

/** Mismo alfabeto que el WMS (`clubMillasPosTicket.ts`) para código de 6 letras en tirilla. */
const CHARSET_CODIGO_CORTO_CLIENTE = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function esCodigoCortoTirillaClubMillas(raw: string): boolean {
  const s = String(raw ?? "").replace(/\s+/g, "").trim().toUpperCase();
  if (s.length !== 6) return false;
  for (let i = 0; i < s.length; i++) {
    if (!CHARSET_CODIGO_CORTO_CLIENTE.includes(s.charAt(i))) return false;
  }
  return true;
}

export type ModoContenidoQrClubMillas = "token" | "url";

/** Textos del pie de tirilla (cliente frecuente). */
export const MENSAJE_TIRILLA_CLUB_FRECUENTE_TITULO = "CLUB DE MILLAS — ACUMULA TUS MILLAS";
export const MENSAJE_TIRILLA_CLUB_FRECUENTE_PASO1 =
  "1. Entrá a club-de-millas (web) con tu cédula y PIN";
export const MENSAJE_TIRILLA_CLUB_FRECUENTE_PASO2 =
  "2. En Mi plan, escaneá este QR (o el código de 6 letras)";
export const MENSAJE_TIRILLA_CLUB_CODIGO_LABEL = "CODIGO CLUB (6 letras)";

/**
 * token (defecto): BACATA-CLUB-V1-… en el QR — compatible con escáner «Mi plan» del WMS.
 * url: URL /club-de-millas?c=… (abre el navegador al escanear con la cámara del celular).
 */
export function modoContenidoQrClubMillas(): ModoContenidoQrClubMillas {
  const m = process.env.NEXT_PUBLIC_CLUB_MILLAS_QR_MODO?.trim().toLowerCase();
  return m === "url" ? "url" : "token";
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
  const compacto = t.replace(/\s+/g, "").toUpperCase();
  if (esCodigoCortoTirillaClubMillas(compacto)) return compacto;
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
export function construirUrlPortalClubMillasConCodigo(qrPayload: string, documento?: string): string {
  const limpio = extraerCodigoQrClubDesdeTextoLeido(qrPayload);
  if (!limpio) return baseUrlPortalClubMillas();
  const u = new URL(baseUrlPortalClubMillas());
  u.searchParams.set(parametroQueryQrClubMillas(), limpio);
  const doc = String(documento ?? "").replace(/\D/g, "").trim();
  if (doc.length >= 5) u.searchParams.set("documento", doc);
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

/** URL o token BACATA para QR ESC/POS (no data: de imagen PNG). */
export function contenidoQrEscaneableClubMillasDesdeTicket(
  payload: Pick<TicketVentaPayload, "fidelizacionPayloadTexto" | "clubMillasCodigoCorto">
): string {
  const corto = payload.clubMillasCodigoCorto?.trim() ?? "";
  if (esCodigoCortoTirillaClubMillas(corto)) return corto.toUpperCase();
  const t = payload.fidelizacionPayloadTexto?.trim() ?? "";
  if (!t || /^data:/i.test(t)) return "";
  if (/^https?:\/\//i.test(t)) return t;
  if (/^BACATA-CLUB-V1-/i.test(t)) return t.replace(/\s+/g, "");
  if (esCodigoCortoTirillaClubMillas(t)) return t.replace(/\s+/g, "").toUpperCase();
  return "";
}

/**
 * Contenido del QR en tirilla: token BACATA (defecto, compatible con escáner Mi plan del WMS)
 * o URL de landing si NEXT_PUBLIC_CLUB_MILLAS_QR_MODO=url.
 */
export function elegirContenidoQrTirillaClubMillas(
  qrPayload: string,
  qrUrlPreferida?: string,
  documento?: string,
  codigoCorto?: string
): string {
  const corto = codigoCorto?.replace(/\s+/g, "").trim().toUpperCase() ?? "";
  if (esCodigoCortoTirillaClubMillas(corto)) return corto;

  const payload = qrPayload.replace(/\s+/g, "").trim();
  const urlWms = qrUrlPreferida?.trim();

  if (payload && esTicketClubMillasPos(payload)) {
    if (modoContenidoQrClubMillas() === "url") {
      return urlWms && /^https?:\/\//i.test(urlWms)
        ? urlWms
        : construirUrlPortalClubMillasConCodigo(payload, documento);
    }
    return payload;
  }

  if (payload && esCodigoCortoTirillaClubMillas(payload)) {
    return payload.toUpperCase();
  }

  if (urlWms && /^https?:\/\//i.test(urlWms)) return urlWms;
  return contenidoQrImpresoClubMillas(payload);
}

export async function generarDataUrlQrPng(contenidoImpreso: string): Promise<string | null> {
  const c = contenidoImpreso.trim();
  if (!c) return null;
  try {
    return await QRCode.toDataURL(c, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 220,
      type: "image/png",
    });
  } catch (e) {
    console.warn("[POS] generarDataUrlQrPng:", e);
    return null;
  }
}

export async function generarQrTirillaClubMillas(
  qrPayload: string,
  qrUrlPreferida?: string,
  documento?: string,
  codigoCorto?: string
): Promise<QrTirillaClubMillasGenerado> {
  const payloadOriginal = qrPayload.replace(/\s+/g, "").trim();
  const contenidoImpreso = elegirContenidoQrTirillaClubMillas(
    payloadOriginal,
    qrUrlPreferida,
    documento,
    codigoCorto
  );
  const dataUrl = (await generarDataUrlQrPng(contenidoImpreso)) ?? "";
  if (!dataUrl) {
    throw new Error("No se pudo generar la imagen del QR del Club de Millas.");
  }
  return { payloadOriginal, contenidoImpreso, dataUrl };
}

/** @deprecated Usar generarQrTirillaClubMillas. */
export async function generarDataUrlQrFidelizacion(payloadUtf8: string): Promise<string> {
  const { dataUrl } = await generarQrTirillaClubMillas(payloadUtf8);
  return dataUrl;
}
