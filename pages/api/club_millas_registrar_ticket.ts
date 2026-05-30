import type { NextApiRequest, NextApiResponse } from "next";
import { getAuth } from "firebase-admin/auth";
import { getFirebaseAdminApp } from "@/lib/firebase-admin-server";
import { headersClubMillasPosSecretHaciaWms } from "@/lib/club-millas-wms-secret-header";
import { extraerCodigoQrClubDesdeTextoLeido } from "@/lib/fidelizacion-qr";
import { getWmsPublicBaseUrl, WMS_VERCEL_URL } from "@/lib/wms-public-base";

/** COP por cada “ticket” de club (regla de negocio acordada con el WMS). */
const COP_POR_TICKET_CLUB = 9000;

const CLUB_REGISTRAR_PATH = "/api/club-de-millas/pos/registrar-ticket";

type LineaIn = { sku?: unknown; cantidad?: unknown };

type BodyIn = {
  ventaId?: unknown;
  puntoVenta?: unknown;
  totalCop?: unknown;
  /** Total factura en COP entero (contrato WMS; si falta se deriva de totalCop). */
  montoTotalCop?: unknown;
  isoTimestamp?: unknown;
  lineas?: unknown;
  clienteDocumento?: unknown;
  facturaElectronica?: unknown;
  idFacturaPos?: unknown;
  cajaId?: unknown;
};

type OkPayload =
  | { ok: true; qrPayload?: string; qrUrl?: string; codigoCorto?: string }
  | { ok: true; omitido: true; codigo: "monto_insuficiente"; message: string }
  | { ok: false; message: string };

function wmsHostIsLocalhost(base: string): boolean {
  try {
    const u = new URL(base.includes("://") ? base : `http://${base}`);
    const h = u.hostname.toLowerCase();
    return h === "localhost" || h === "127.0.0.1" || h === "::1";
  } catch {
    return /localhost|127\.0\.0\.1/i.test(base);
  }
}

function str(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
}

const QR_URL_KEYS = ["qrUrl", "qr_url", "urlQr", "url_qr", "enlaceQr", "linkQr"] as const;

function pickUrlHttp(o: Record<string, unknown>): string | null {
  for (const key of QR_URL_KEYS) {
    const q = str(o[key]);
    if (q && /^https?:\/\//i.test(q)) return q;
  }
  return null;
}

function extraerQrUrlWms(data: unknown): string | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const o = data as Record<string, unknown>;
  const direct = pickUrlHttp(o);
  if (direct) return direct;
  for (const nestKey of ["data", "result", "ticket", "payload"] as const) {
    const nested = o[nestKey];
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      const q = pickUrlHttp(nested as Record<string, unknown>);
      if (q) return q;
    }
  }
  return null;
}

function pickCodigoCorto(o: Record<string, unknown>): string | null {
  for (const key of ["codigoCorto", "codigo_corto", "codigo", "shortCode"] as const) {
    const direct = str(o[key]).toUpperCase().replace(/\s+/g, "");
    if (/^[A-Z0-9]{6}$/.test(direct)) return direct;
  }
  return null;
}

function extraerCodigoCortoWms(data: unknown): string | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const o = data as Record<string, unknown>;
  const direct = pickCodigoCorto(o);
  if (direct) return direct;
  for (const nestKey of ["data", "result", "ticket", "payload"] as const) {
    const nested = o[nestKey];
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      const c = pickCodigoCorto(nested as Record<string, unknown>);
      if (c) return c;
    }
  }
  return null;
}

function mensajeDesdeRespuestaWms(data: unknown): string {
  if (!data || typeof data !== "object" || Array.isArray(data)) return "";
  const o = data as Record<string, unknown>;
  const direct = str(o.message) || str(o.error);
  if (direct) return direct;
  for (const nestKey of ["data", "result"] as const) {
    const nested = o[nestKey];
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      const n = nested as Record<string, unknown>;
      const m = str(n.message) || str(n.error);
      if (m) return m;
    }
  }
  return "";
}

function construirQrPayloadDesdeToken(token: string): string | null {
  const t = token.replace(/\s+/g, "").trim().toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(t)) return null;
  return `BACATA-CLUB-V1-${t}`;
}

function extraerQrPayloadWms(data: unknown): string | null {
  if (typeof data === "string") {
    const t = data.trim();
    return t.length > 0 ? t : null;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const o = data as Record<string, unknown>;
  for (const key of ["qrPayload", "qr_payload", "payload", "codigoQr", "ticket"] as const) {
    const q = str(o[key]);
    if (q) return q;
  }
  const desdeToken = construirQrPayloadDesdeToken(str(o.token));
  if (desdeToken) return desdeToken;
  for (const nestKey of ["data", "result", "ticket", "payload"] as const) {
    const nested = o[nestKey];
    if (!nested || typeof nested !== "object" || Array.isArray(nested)) continue;
    const n = nested as Record<string, unknown>;
    for (const key of ["qrPayload", "qr_payload", "payload", "codigoQr", "ticket"] as const) {
      const q = str(n[key]);
      if (q) return q;
    }
    const t2 = construirQrPayloadDesdeToken(str(n.token));
    if (t2) return t2;
  }
  return null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<OkPayload>) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  const app = getFirebaseAdminApp();
  if (!app) {
    return res.status(503).json({
      ok: false,
      message:
        "FIREBASE_SERVICE_ACCOUNT_JSON no está configurada: hace falta verificar la sesión del cajero en el servidor para registrar el ticket del Club de Millas.",
    });
  }

  const authHeader = req.headers.authorization;
  const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!idToken) {
    return res.status(401).json({ ok: false, message: "Falta Authorization Bearer (sesión del cajero)." });
  }
  try {
    await getAuth(app).verifyIdToken(idToken);
  } catch {
    return res.status(401).json({ ok: false, message: "Sesión inválida o token expirado." });
  }

  const clubMillasSecret = process.env.CLUB_MILLAS_POS_SECRET?.trim();
  if (!clubMillasSecret) {
    return res.status(503).json({
      ok: false,
      message:
        "Variable CLUB_MILLAS_POS_SECRET no definida en el servidor del POS. Debe coincidir con la del WMS (Vercel / entorno).",
    });
  }

  const b = (typeof req.body === "object" && req.body !== null ? req.body : {}) as BodyIn;
  const ventaId = str(b.ventaId);
  const puntoVenta = str(b.puntoVenta);
  const totalCopRaw = typeof b.totalCop === "number" ? b.totalCop : Number(b.totalCop);
  const montoTotalCopRaw =
    b.montoTotalCop !== undefined && b.montoTotalCop !== null
      ? typeof b.montoTotalCop === "number"
        ? b.montoTotalCop
        : Number(b.montoTotalCop)
      : NaN;
  const isoTimestamp = str(b.isoTimestamp);
  const lineasRaw = Array.isArray(b.lineas) ? b.lineas : [];
  const idFacturaPos = str(b.idFacturaPos);
  const cajaId = str(b.cajaId);

  if (!ventaId || !puntoVenta) {
    return res.status(400).json({ ok: false, message: "Faltan ventaId o puntoVenta." });
  }
  if (!Number.isFinite(totalCopRaw) || totalCopRaw <= 0) {
    return res.status(400).json({ ok: false, message: "totalCop inválido." });
  }
  if (!isoTimestamp) {
    return res.status(400).json({ ok: false, message: "Falta isoTimestamp." });
  }

  const totalRedondeado = Math.round(totalCopRaw * 100) / 100;
  const montoTotalCop = Number.isFinite(montoTotalCopRaw) && montoTotalCopRaw > 0 ? Math.round(montoTotalCopRaw) : Math.round(totalRedondeado);
  if (montoTotalCop < 1 || !Number.isFinite(montoTotalCop)) {
    return res.status(400).json({ ok: false, message: "montoTotalCop debe ser un entero COP mayor a 0." });
  }

  const ticketsEfectivos = Math.floor(montoTotalCop / COP_POR_TICKET_CLUB);
  if (ticketsEfectivos < 1) {
    return res.status(200).json({
      ok: true,
      omitido: true,
      codigo: "monto_insuficiente",
      message:
        "Club de Millas: el total de esta factura no alcanza el mínimo para generar código QR en esta compra " +
        `(se requiere al menos $${COP_POR_TICKET_CLUB.toLocaleString("es-CO")} COP según la regla acordada; millas = floor(monto/9000)).`,
    });
  }

  const lineas: { sku: string; cantidad: number }[] = [];
  for (const row of lineasRaw as LineaIn[]) {
    if (!row || typeof row !== "object") continue;
    const sku = str(row.sku);
    const c = typeof row.cantidad === "number" ? row.cantidad : Number(row.cantidad);
    if (!sku || !Number.isFinite(c)) continue;
    lineas.push({ sku, cantidad: Math.round(c * 1000) / 1000 });
  }

  const fe = b.facturaElectronica;
  let facturaElectronica: { numero?: string; cufe?: string; enviadoAt?: string } | undefined;
  if (fe && typeof fe === "object" && !Array.isArray(fe)) {
    const f = fe as Record<string, unknown>;
    facturaElectronica = {
      ...(str(f.numero) ? { numero: str(f.numero) } : {}),
      ...(str(f.cufe) ? { cufe: str(f.cufe) } : {}),
      ...(str(f.enviadoAt) ? { enviadoAt: str(f.enviadoAt) } : {}),
    };
    if (Object.keys(facturaElectronica).length === 0) facturaElectronica = undefined;
  }

  const wmsBody: Record<string, unknown> = {
    ventaId,
    puntoVenta,
    montoTotalCop,
    totalCop: totalRedondeado,
    isoTimestamp,
    lineas,
    ...(str(b.clienteDocumento)
      ? {
          documento: str(b.clienteDocumento).replace(/\D/g, ""),
          clienteDocumento: str(b.clienteDocumento),
        }
      : {}),
    ...(facturaElectronica ? { facturaElectronica } : {}),
    ...(idFacturaPos ? { idFacturaPos } : {}),
    ...(cajaId ? { cajaId } : {}),
  };

  const primaryBase = getWmsPublicBaseUrl().replace(/\/$/, "");
  const fallbackBase = (process.env.WMS_CATALOGO_FALLBACK_URL?.trim() || WMS_VERCEL_URL).replace(/\/$/, "");

  const secretParaWms: string = clubMillasSecret;

  async function postEn(base: string): Promise<{ status: number; data: unknown }> {
    const url = `${base.replace(/\/$/, "")}${CLUB_REGISTRAR_PATH}`;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: headersClubMillasPosSecretHaciaWms(secretParaWms),
        body: JSON.stringify(wmsBody),
      });
      const data = await response.json().catch(() => ({}));
      return { status: response.status, data };
    } catch {
      return { status: 0, data: {} };
    }
  }

  let outcome = await postEn(primaryBase);
  if (
    (outcome.status === 0 || outcome.status >= 500 || outcome.status === 404) &&
    wmsHostIsLocalhost(primaryBase) &&
    fallbackBase.toLowerCase() !== primaryBase.toLowerCase()
  ) {
    try {
      outcome = await postEn(fallbackBase);
    } catch {
      /* mantener outcome anterior */
    }
  }

  const { status, data } = outcome;

  if (data && typeof data === "object" && !Array.isArray(data)) {
    const body = data as Record<string, unknown>;
    if (body.ok === true && body.omitido === true && str(body.codigo) === "monto_insuficiente") {
      return res.status(200).json({
        ok: true,
        omitido: true,
        codigo: "monto_insuficiente",
        message:
          mensajeDesdeRespuestaWms(data) ||
          "Club de Millas: el total de esta factura no alcanza el mínimo para generar código QR en esta compra.",
      });
    }
    if (body.ok === false || body.success === false) {
      return res.status(200).json({
        ok: false,
        message:
          mensajeDesdeRespuestaWms(data) ||
          "El WMS rechazó el registro del ticket del Club de Millas.",
      });
    }
  }

  const docEnviado = str(b.clienteDocumento).replace(/\D/g, "");
  if (!docEnviado && process.env.CLUB_MILLAS_DEBUG_LOG === "1") {
    console.warn("[club_millas_registrar_ticket] Sin clienteDocumento en el body; el WMS puede no devolver qrUrl.");
  }

  if (!Number.isFinite(status) || status < 200 || status >= 300) {
    const msg =
      mensajeDesdeRespuestaWms(data) ||
      `El WMS respondió HTTP ${status} al registrar el ticket del Club de Millas.`;
    if (status === 400 && /monto|millas|9000|alcanza/i.test(msg)) {
      return res.status(200).json({
        ok: true,
        omitido: true,
        codigo: "monto_insuficiente",
        message: msg,
      });
    }
    return res.status(200).json({ ok: false, message: msg });
  }

  const qrUrl = extraerQrUrlWms(data);
  const codigoCorto = extraerCodigoCortoWms(data);
  let qrPayload = extraerQrPayloadWms(data);
  if (!qrPayload && qrUrl) {
    const desdeUrl = extraerCodigoQrClubDesdeTextoLeido(qrUrl);
    if (desdeUrl) qrPayload = desdeUrl;
  }

  if (!qrPayload && !qrUrl && !codigoCorto) {
    return res.status(200).json({
      ok: false,
      message:
        "El WMS no devolvió qrPayload, qrUrl ni código corto. Revisá POST /api/club-de-millas/pos/registrar-ticket.",
    });
  }

  const limpio = qrPayload ? qrPayload.replace(/\s+/g, "").trim() : "";
  if (limpio) {
    const esperadoPrefijo = /^BACATA-CLUB-V1-[0-9a-fA-F]{32}$/;
    if (!esperadoPrefijo.test(limpio)) {
      console.warn(
        "[club_millas_registrar_ticket] qrPayload no coincide con BACATA-CLUB-V1- + 32 hex; el WMS o la tirilla pueden rechazarlo:",
        limpio.slice(0, 80)
      );
    }
  }

  if (process.env.CLUB_MILLAS_DEBUG_LOG === "1") {
    console.info("[club_millas_registrar_ticket] WMS ok", {
      montoTotalCop,
      totalRedondeado,
      qrPayloadLen: limpio.length,
      qrPayloadPrefijo: limpio.slice(0, 24),
      tieneQrUrl: Boolean(qrUrl),
      tieneCodigoCorto: Boolean(codigoCorto),
    });
  }

  return res.status(200).json({
    ok: true,
    ...(limpio ? { qrPayload: limpio } : {}),
    ...(qrUrl ? { qrUrl } : {}),
    ...(codigoCorto ? { codigoCorto } : {}),
  });
}
