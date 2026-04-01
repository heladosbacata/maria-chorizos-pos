import type { NextApiRequest, NextApiResponse } from "next";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { DEFAULT_GOOGLE_SHEETS_INSUMOS_ID } from "@/lib/catalogo-insumos-sheet-parse";
import { getFirebaseAdminApp, getCreadorFirestoreContext } from "@/lib/firebase-admin-server";
import { sanitizeGoogleSheetsSpreadsheetId } from "@/lib/google-sheets-env-sanitize";
import {
  parseServiceAccountJson,
  resolveSheetsServiceAccountJsonFromEnv,
} from "@/lib/google-sheets-service-account-read";
import {
  appendSpreadsheetValues,
  createSheetsReadWriteJwt,
  leerPrimeraFilaRango,
} from "@/lib/google-sheets-service-account-write";

const COL = "posClientes";

const HEADERS = [
  "puntoVenta",
  "exportadoEn",
  "tipoCliente",
  "nombreDisplay",
  "tipoIdentificacion",
  "numeroIdentificacion",
  "digitoVerificacion",
  "email",
  "telefono",
  "direccion",
  "ciudad",
  "notas",
  "idFirestore",
  "creadoPorUid",
  "creadoPorEmail",
  "creadoEn",
];

function primeraFilaDesdeRango(rangeA1: string): string {
  const idx = rangeA1.lastIndexOf("!");
  if (idx < 0) {
    throw new Error("GOOGLE_SHEETS_CLIENTES_RANGE debe incluir pestaña, ej. 'DB_Pos_Clientes'!A:P");
  }
  return `${rangeA1.slice(0, idx).trim()}!1:1`;
}

function fmtTs(x: unknown): string {
  if (!x) return "";
  if (x instanceof Timestamp) return x.toDate().toISOString();
  if (typeof x === "object" && x !== null && "toDate" in x && typeof (x as { toDate: () => Date }).toDate === "function") {
    try {
      return (x as { toDate: () => Date }).toDate().toISOString();
    } catch {
      return "";
    }
  }
  return "";
}

/**
 * POST: exporta clientes del punto de venta del usuario a Google Sheets (append).
 * Requiere GOOGLE_SHEETS_CLIENTES_RANGE y cuenta de servicio con permiso de edición en la hoja.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  const app = getFirebaseAdminApp();
  if (!app) {
    return res.status(503).json({ ok: false, message: "Firebase Admin no configurado." });
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) {
    return res.status(401).json({ ok: false, message: "Falta Authorization Bearer." });
  }

  const ctx = await getCreadorFirestoreContext(app, token);
  if (!ctx.ok) {
    return res.status(401).json({ ok: false, message: ctx.message });
  }
  if (!ctx.puntoVenta) {
    return res.status(400).json({ ok: false, message: "Sin punto de venta en el perfil." });
  }

  const rangeRaw = process.env.GOOGLE_SHEETS_CLIENTES_RANGE?.trim();
  if (!rangeRaw) {
    return res.status(501).json({
      ok: false,
      message:
        "Exportación a Sheet no configurada. En Vercel define GOOGLE_SHEETS_CLIENTES_RANGE (ej. 'DB_Pos_Clientes'!A:P). Podés usar «Descargar CSV» en el POS.",
    });
  }

  const saJson = resolveSheetsServiceAccountJsonFromEnv();
  if (!saJson) {
    return res.status(501).json({
      ok: false,
      message:
        "Falta cuenta de servicio para Google Sheets (GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON o GOOGLE_SHEETS_USE_FIREBASE_SA=1).",
    });
  }

  const spreadsheetId = sanitizeGoogleSheetsSpreadsheetId(
    process.env.GOOGLE_SHEETS_CLIENTES_SPREADSHEET_ID,
    sanitizeGoogleSheetsSpreadsheetId(process.env.GOOGLE_SHEETS_INSUMOS_SPREADSHEET_ID, DEFAULT_GOOGLE_SHEETS_INSUMOS_ID)
  );

  const db = getFirestore(app);
  const pv = ctx.puntoVenta;
  let snap;
  try {
    snap = await db.collection(COL).where("puntoVenta", "==", pv).limit(500).get();
  } catch (e) {
    return res.status(500).json({
      ok: false,
      message: e instanceof Error ? e.message : "Error leyendo clientes.",
    });
  }

  const exportadoEn = new Date().toISOString();
  const auth = getAuth(app);

  const rows: string[][] = [];
  for (const doc of snap.docs) {
    const d = doc.data();
    const tipoCliente = d.tipoCliente === "empresa" ? "empresa" : "persona";
    let nombreDisplay = "";
    if (tipoCliente === "empresa" && typeof d.razonSocial === "string") nombreDisplay = d.razonSocial.trim();
    else {
      nombreDisplay = [d.nombres, d.apellidos].filter(Boolean).join(" ").trim();
    }
    if (!nombreDisplay) nombreDisplay = String(d.numeroIdentificacion ?? doc.id).slice(0, 80);

    const dc =
      d.datosComplementarios && typeof d.datosComplementarios === "object"
        ? (d.datosComplementarios as Record<string, unknown>)
        : {};
    const direccion = typeof dc.direccion === "string" ? dc.direccion : "";
    const ciudad = typeof dc.ciudad === "string" ? dc.ciudad : "";
    const notas = typeof dc.notas === "string" ? dc.notas : "";

    const ind = typeof d.indicativoTelefono === "string" ? d.indicativoTelefono.trim() : "";
    const tel = typeof d.telefono === "string" ? d.telefono.trim() : "";
    const telefono = [ind, tel].filter(Boolean).join(" ");

    const uid = typeof d.createdByUid === "string" ? d.createdByUid : "";
    let creadoPorEmail = "";
    if (uid) {
      try {
        const ur = await auth.getUser(uid);
        creadoPorEmail = ur.email ?? "";
      } catch {
        /* sin usuario o eliminado */
      }
    }

    rows.push([
      pv,
      exportadoEn,
      tipoCliente,
      nombreDisplay,
      String(d.tipoIdentificacion ?? ""),
      String(d.numeroIdentificacion ?? ""),
      String(d.digitoVerificacion ?? ""),
      String(d.email ?? ""),
      telefono,
      direccion,
      ciudad,
      notas,
      doc.id,
      uid,
      creadoPorEmail,
      fmtTs(d.createdAt),
    ]);
  }

  try {
    const creds = parseServiceAccountJson(saJson);
    const jwt = createSheetsReadWriteJwt(creds);
    const primeraFilaRango = primeraFilaDesdeRango(rangeRaw);
    const existente = await leerPrimeraFilaRango(jwt, spreadsheetId, primeraFilaRango);
    const necesitaHeader = existente.length === 0 || existente.every((c) => !String(c).trim());

    const toAppend: string[][] = [];
    if (necesitaHeader) toAppend.push(HEADERS);
    toAppend.push(...rows);

    await appendSpreadsheetValues(jwt, spreadsheetId, rangeRaw, toAppend);

    const msg =
      necesitaHeader && rows.length === 0
        ? "Se escribió la fila de encabezados. Cuando haya clientes registrados desde caja, volvé a exportar para agregar filas."
        : `Listo: ${toAppend.length} fila(s) agregadas al final de la pestaña.`;

    return res.status(200).json({
      ok: true,
      filasEscritas: toAppend.length,
      message: msg,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al escribir en Sheets.";
    return res.status(502).json({ ok: false, message: msg });
  }
}
