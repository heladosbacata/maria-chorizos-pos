import type { NextApiRequest, NextApiResponse } from "next";

import { getFirestore } from "firebase-admin/firestore";

import { getAuth } from "firebase-admin/auth";

import { getFirebaseAdminApp } from "@/lib/firebase-admin-server";

import { cobrarClienteFrecuenteClubMillasEnFirestore } from "@/lib/club-millas-cobro-firestore-pos";

import { construirUrlConsultaClubMillas } from "@/lib/club-millas-consulta-url";

import { headersClubMillasPosSecretHaciaWms } from "@/lib/club-millas-wms-secret-header";

import { getWmsPublicBaseUrl, WMS_VERCEL_URL } from "@/lib/wms-public-base";



const CLUB_REGISTRAR_PATH = "/api/club-de-millas/pos/registrar-ticket";

const CLUB_ACUMULAR_PATH = "/api/club-de-millas/acumular-millas";

const COP_POR_TICKET_CLUB = 9000;



type BodyIn = {

  ventaId?: unknown;

  puntoVenta?: unknown;

  totalCop?: unknown;

  montoTotalCop?: unknown;

  isoTimestamp?: unknown;

  lineas?: unknown;

  clienteDocumento?: unknown;

  socioId?: unknown;

  clienteFrecuenteSocioId?: unknown;

  facturaElectronica?: unknown;

  idFacturaPos?: unknown;

  cajaId?: unknown;

};



type OkPayload =

  | {

      ok: true;

      puntosSumados: number;

      saldoMillas: number;

      urlConsultaMillas: string;

      mensaje: string;

      millas?: number;

      montoTotalCop?: number;

      yaAcumulado?: boolean;

    }

  | { ok: true; omitido: true; codigo: "monto_insuficiente"; message: string; saldoMillas?: number }

  | { ok: false; message: string; saldoMillas?: number; yaAcumulado?: boolean };



function str(v: unknown): string {

  if (typeof v === "string") return v.trim();

  if (typeof v === "number" && Number.isFinite(v)) return String(v);

  return "";

}



function wmsHostIsLocalhost(base: string): boolean {

  try {

    const u = new URL(base.includes("://") ? base : `http://${base}`);

    const h = u.hostname.toLowerCase();

    return h === "localhost" || h === "127.0.0.1" || h === "::1";

  } catch {

    return /localhost|127\.0\.0\.1/i.test(base);

  }

}



async function postWms(

  base: string,

  path: string,

  body: Record<string, unknown>,

  headers: HeadersInit

): Promise<{ status: number; data: unknown }> {

  const url = `${base.replace(/\/$/, "")}${path}`;

  try {

    const response = await fetch(url, {

      method: "POST",

      headers,

      body: JSON.stringify(body),

    });

    const data = await response.json().catch(() => ({}));

    return { status: response.status, data };

  } catch {

    return { status: 0, data: {} };

  }

}



function respuestaDesdeFirestore(

  documento: string,

  r: Awaited<ReturnType<typeof cobrarClienteFrecuenteClubMillasEnFirestore>>

): OkPayload {

  const urlConsultaMillas = construirUrlConsultaClubMillas(documento);

  if (r.ok && "omitido" in r && r.omitido) {

    return {

      ok: true,

      omitido: true,

      codigo: "monto_insuficiente",

      message: r.message,

    };

  }

  if (r.ok && !("omitido" in r)) {

    return {

      ok: true,

      puntosSumados: r.puntosSumados,

      saldoMillas: r.saldoMillas,

      urlConsultaMillas,

      millas: r.millas,

      montoTotalCop: r.montoTotalCop,

      mensaje: r.mensaje,

      ...(r.yaAcumulado ? { yaAcumulado: true } : {}),

    };

  }

  if (!r.ok) {
    return {
      ok: false,
      message: r.message,
      ...(r.saldoMillas !== undefined ? { saldoMillas: r.saldoMillas } : {}),
      ...(r.yaAcumulado ? { yaAcumulado: true } : {}),
    };
  }

  return { ok: false, message: "No se pudo acumular millas." };
}



async function cobrarViaWms(

  req: NextApiRequest,

  documento: string,

  socioId: string,

  montoTotalCop: number,

  wmsBody: Record<string, unknown>

): Promise<OkPayload> {

  const clubMillasSecret = process.env.CLUB_MILLAS_POS_SECRET?.trim();

  if (!clubMillasSecret) {

    return {

      ok: false,

      message:

        "No se pudo acumular millas en Firestore y falta CLUB_MILLAS_POS_SECRET para usar el WMS.",

    };

  }



  const primaryBase = getWmsPublicBaseUrl().replace(/\/$/, "");

  const fallbackBase = (process.env.WMS_CATALOGO_FALLBACK_URL?.trim() || WMS_VERCEL_URL).replace(/\/$/, "");

  const secretHeaders = headersClubMillasPosSecretHaciaWms(clubMillasSecret);



  let regOutcome = await postWms(primaryBase, CLUB_REGISTRAR_PATH, wmsBody, secretHeaders);

  if (

    (regOutcome.status === 0 || regOutcome.status >= 500 || regOutcome.status === 404) &&

    wmsHostIsLocalhost(primaryBase) &&

    fallbackBase.toLowerCase() !== primaryBase.toLowerCase()

  ) {

    regOutcome = await postWms(fallbackBase, CLUB_REGISTRAR_PATH, wmsBody, secretHeaders);

  }



  const regData = regOutcome.data as Record<string, unknown> | undefined;

  if (regOutcome.status < 200 || regOutcome.status >= 300 || regData?.ok !== true) {

    const msg =

      str(regData?.error) ||

      str(regData?.message) ||

      `El WMS no registró el ticket (HTTP ${regOutcome.status}).`;

    return { ok: false, message: msg };

  }



  if (regData.omitido === true) {

    return {

      ok: true,

      omitido: true,

      codigo: "monto_insuficiente",

      message: str(regData.message) || str(regData.error) || "Monto insuficiente para millas.",

    };

  }



  const qrPayload = str(regData.qrPayload);

  if (!qrPayload) {

    return { ok: false, message: "El WMS no devolvió qrPayload para acumular millas." };

  }



  const acumularBody = { socioId, documento, qrCode: qrPayload };

  let acOutcome = await postWms(primaryBase, CLUB_ACUMULAR_PATH, acumularBody, {

    "Content-Type": "application/json",

  });

  if (

    (acOutcome.status === 0 || acOutcome.status >= 500) &&

    fallbackBase.toLowerCase() !== primaryBase.toLowerCase()

  ) {

    acOutcome = await postWms(fallbackBase, CLUB_ACUMULAR_PATH, acumularBody, {

      "Content-Type": "application/json",

    });

  }



  const acData = acOutcome.data as Record<string, unknown> | undefined;

  const urlConsultaMillas = construirUrlConsultaClubMillas(documento);



  if (acData?.ok === true) {

    const puntosSumados = Number(acData.puntosSumados ?? acData.millas ?? regData.millas ?? 0) || 0;

    const saldoMillas = Number(acData.saldoMillas ?? 0) || 0;

    return {

      ok: true,

      puntosSumados,

      saldoMillas,

      urlConsultaMillas,

      millas: Number(regData.millas ?? puntosSumados) || puntosSumados,

      montoTotalCop,

      mensaje:

        str(acData.mensaje) ||

        `Sumaste ${puntosSumados} milla(s). Tu saldo: ${saldoMillas.toLocaleString("es-CO")} millas.`,

    };

  }



  if (acOutcome.status === 409 || acData?.yaAcumulado === true || acData?.duplicado === true) {

    return {

      ok: true,

      puntosSumados: 0,

      saldoMillas: Number(acData?.saldoMillas ?? 0) || 0,

      urlConsultaMillas,

      mensaje: "Las millas de esta compra ya estaban registradas.",

      yaAcumulado: true,

    };

  }



  return {

    ok: false,

    message:

      str(acData?.error) ||

      str(acData?.message) ||

      `No se pudieron acumular millas (HTTP ${acOutcome.status}).`,

    saldoMillas: Number(acData?.saldoMillas ?? 0) || undefined,

  };

}



export default async function handler(req: NextApiRequest, res: NextApiResponse<OkPayload>) {

  if (req.method !== "POST") {

    return res.status(405).json({ ok: false, message: "Method not allowed" });

  }



  const app = getFirebaseAdminApp();

  if (!app) {

    return res.status(503).json({

      ok: false,

      message: "FIREBASE_SERVICE_ACCOUNT_JSON no configurada en el servidor del POS.",

    });

  }



  const idToken = req.headers.authorization?.startsWith("Bearer ")

    ? req.headers.authorization.slice(7).trim()

    : "";

  if (!idToken) {

    return res.status(401).json({ ok: false, message: "Falta Authorization Bearer (sesión del cajero)." });

  }

  try {

    await getAuth(app).verifyIdToken(idToken);

  } catch {

    return res.status(401).json({ ok: false, message: "Sesión inválida o token expirado." });

  }



  const b = (typeof req.body === "object" && req.body !== null ? req.body : {}) as BodyIn;

  const puntoVenta = str(b.puntoVenta);

  const montoTotalCopRaw =

    b.montoTotalCop !== undefined && b.montoTotalCop !== null

      ? typeof b.montoTotalCop === "number"

        ? b.montoTotalCop

        : Number(b.montoTotalCop)

      : NaN;

  const totalCopRaw = typeof b.totalCop === "number" ? b.totalCop : Number(b.totalCop);

  const isoTimestamp = str(b.isoTimestamp);

  const documento = str(b.clienteDocumento).replace(/\D/g, "");

  let socioId = str(b.socioId) || str(b.clienteFrecuenteSocioId);



  if (!puntoVenta || !isoTimestamp) {

    return res.status(400).json({ ok: false, message: "Faltan puntoVenta o isoTimestamp." });

  }

  if (!documento || documento.length < 5) {

    return res.status(400).json({ ok: false, message: "Falta documento del cliente frecuente validado." });

  }



  const montoTotalCop =

    Number.isFinite(montoTotalCopRaw) && montoTotalCopRaw > 0

      ? Math.round(montoTotalCopRaw)

      : Number.isFinite(totalCopRaw) && totalCopRaw > 0

        ? Math.round(totalCopRaw)

        : 0;



  if (montoTotalCop < COP_POR_TICKET_CLUB) {

    return res.status(200).json({

      ok: true,

      omitido: true,

      codigo: "monto_insuficiente",

      message: `Club de Millas: el total no alcanza el mínimo ($${COP_POR_TICKET_CLUB.toLocaleString("es-CO")} COP por milla).`,

    });

  }



  const preferWms = process.env.CLUB_MILLAS_COBRO_PREFER_WMS === "1";

  const ventaId = str(b.ventaId) || `pos-${Date.now()}`;



  if (!preferWms) {

    const db = getFirestore(app);

    const firestoreResult = await cobrarClienteFrecuenteClubMillasEnFirestore(db, {

      documento,

      socioId: socioId || undefined,

      montoTotalCop,

      puntoVenta,

      idFacturaPos: str(b.idFacturaPos),

      cajaId: str(b.cajaId),

      ventaId,

    });

    if (firestoreResult.ok || ("omitido" in firestoreResult && firestoreResult.omitido)) {

      return res.status(200).json(respuestaDesdeFirestore(documento, firestoreResult));

    }

    if (!process.env.CLUB_MILLAS_POS_SECRET?.trim()) {

      return res.status(200).json(respuestaDesdeFirestore(documento, firestoreResult));

    }

  }



  const wmsBody: Record<string, unknown> = {

    ventaId,

    puntoVenta,

    montoTotalCop,

    totalCop: Number.isFinite(totalCopRaw) ? Math.round(totalCopRaw * 100) / 100 : montoTotalCop,

    isoTimestamp,

    lineas: [],

    documento,

    clienteDocumento: documento,

    socioId,

    ...(str(b.idFacturaPos) ? { idFacturaPos: str(b.idFacturaPos) } : {}),

    ...(str(b.cajaId) ? { cajaId: str(b.cajaId) } : {}),

  };



  const lineasRaw = Array.isArray(b.lineas) ? b.lineas : [];

  for (const row of lineasRaw as { sku?: unknown; cantidad?: unknown }[]) {

    if (!row || typeof row !== "object") continue;

    const sku = str(row.sku);

    const c = typeof row.cantidad === "number" ? row.cantidad : Number(row.cantidad);

    if (!sku || !Number.isFinite(c)) continue;

    (wmsBody.lineas as { sku: string; cantidad: number }[]).push({

      sku,

      cantidad: Math.round(c * 1000) / 1000,

    });

  }



  if (!socioId) {

    const primaryBase = getWmsPublicBaseUrl().replace(/\/$/, "");

    const path = `/api/club-de-millas/pos/validar-documento?documento=${encodeURIComponent(documento)}`;

    try {

      const res = await fetch(`${primaryBase.replace(/\/$/, "")}${path}`, {

        method: "GET",

        headers: { Accept: "application/json" },

        cache: "no-store",

      });

      const data = (await res.json().catch(() => ({}))) as { socioId?: string; data?: { socioId?: string } };

      socioId = str(data.socioId) || str(data.data?.socioId);

    } catch {

      /* firestore resolver en cobrarViaWms path */

    }

  }



  if (!socioId) {

    const db = getFirestore(app);

    const firestoreRetry = await cobrarClienteFrecuenteClubMillasEnFirestore(db, {

      documento,

      montoTotalCop,

      puntoVenta,

      idFacturaPos: str(b.idFacturaPos),

      cajaId: str(b.cajaId),

      ventaId,

    });

    return res.status(200).json(respuestaDesdeFirestore(documento, firestoreRetry));

  }



  wmsBody.socioId = socioId;

  const wmsResult = await cobrarViaWms(req, documento, socioId, montoTotalCop, wmsBody);

  return res.status(200).json(wmsResult);

}

