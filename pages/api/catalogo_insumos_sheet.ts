import type { NextApiRequest, NextApiResponse } from "next";
import {
  DEFAULT_GOOGLE_SHEETS_INSUMOS_GID,
  DEFAULT_GOOGLE_SHEETS_INSUMOS_ID,
  insumosDesdeGrilla,
  parseCsvToRows,
} from "@/lib/catalogo-insumos-sheet-parse";
import { sanitizeGoogleSheetsGid, sanitizeGoogleSheetsSpreadsheetId } from "@/lib/google-sheets-env-sanitize";
import {
  createSheetsReadonlyJwt,
  fetchSpreadsheetRowsWithJwt,
  getSheetsServiceAccountPublicMetaFromEnv,
  googleSheetsApiEnableUrl,
  parseServiceAccountJson,
  resolveSheetsServiceAccountJsonFromEnv,
} from "@/lib/google-sheets-service-account-read";
import type { InsumoKitItem } from "@/types/inventario-pos";
import { getWmsPublicBaseUrl } from "@/lib/wms-public-base";

type SheetSetupHint = {
  clientEmail: string;
  projectId: string;
  sheetsApiUrl: string;
  /** Texto fijo: compartir hoja una vez con clientEmail */
  shareOnceHint: string;
};

type OkResponse = {
  ok: true;
  data: InsumoKitItem[];
  fuente: string;
  totalComposicion?: number;
  /** La hoja tiene filas pero ninguna coincidió con el PV; se devolvieron todas las filas (PV vacío en filtro). */
  pvFiltroSinCoincidencias?: boolean;
};
type ErrResponse = {
  ok: false;
  message: string;
  data: InsumoKitItem[];
  /** Presente si falló la ruta con cuenta de servicio: el cajero no hace nada; el admin configura una vez. */
  sheetSetup?: SheetSetupHint;
};

function sheetSetupFromEnv(): SheetSetupHint | undefined {
  const meta = getSheetsServiceAccountPublicMetaFromEnv();
  if (!meta) return undefined;
  return {
    clientEmail: meta.clientEmail,
    projectId: meta.projectId,
    sheetsApiUrl: googleSheetsApiEnableUrl(meta.projectId),
    shareOnceHint:
      "Comparte la hoja de insumos con el correo de la cuenta de servicio (solo lectura basta). Un solo paso: todos los usuarios POS usan el mismo acceso automáticamente.",
  };
}

type WmsCatalogoInsumo = {
  sku?: string;
  descripcion?: string;
  categoria?: string;
  unidad?: string;
  factorUnidadesConsumo?: number;
  unidadCompra?: string;
  unidadConsumo?: string;
  precioCompraEmpaque?: number;
  precioCompraUnitario?: number;
};

function normalizarSkuId(sku: string): string {
  return sku
    .trim()
    .replace(/\//g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 300);
}

function wmsItemAInsumoKitItem(item: WmsCatalogoInsumo): InsumoKitItem | null {
  const sku = String(item.sku ?? "").trim();
  if (!sku) return null;
  const descripcion = String(item.descripcion ?? "").trim() || sku;
  const categoria = String(item.categoria ?? "").trim();
  const unidad = String(item.unidad ?? item.unidadConsumo ?? "").trim() || "und";
  const factorUnidadesConsumo =
    typeof item.factorUnidadesConsumo === "number" &&
    Number.isFinite(item.factorUnidadesConsumo) &&
    item.factorUnidadesConsumo > 0
      ? Math.round(item.factorUnidadesConsumo * 10000) / 10000
      : undefined;
  const unidadCompra = String(item.unidadCompra ?? "").trim();
  const unidadConsumo = String(item.unidadConsumo ?? "").trim();
  const precioCompraEmpaque =
    typeof item.precioCompraEmpaque === "number" &&
    Number.isFinite(item.precioCompraEmpaque) &&
    item.precioCompraEmpaque > 0
      ? Math.round(item.precioCompraEmpaque * 100) / 100
      : undefined;
  const precioCompraUnitario =
    typeof item.precioCompraUnitario === "number" &&
    Number.isFinite(item.precioCompraUnitario) &&
    item.precioCompraUnitario > 0
      ? Math.round(item.precioCompraUnitario * 100) / 100
      : undefined;
  return {
    id: normalizarSkuId(sku),
    sku,
    descripcion,
    unidad,
    ...(categoria ? { categoria } : {}),
    ...(factorUnidadesConsumo != null ? { factorUnidadesConsumo } : {}),
    ...(unidadCompra ? { unidadCompra } : {}),
    ...(unidadConsumo ? { unidadConsumo } : {}),
    ...(precioCompraEmpaque != null ? { precioCompraEmpaque } : {}),
    ...(precioCompraUnitario != null ? { precioCompraUnitario } : {}),
  };
}

async function obtenerCatalogoDesdeWms(): Promise<OkResponse | null> {
  const base = getWmsPublicBaseUrl();
  const res = await fetch(`${base}/api/pos/insumos-inventario/listar`, { cache: "no-store" });
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    data?: WmsCatalogoInsumo[];
    fuente?: string;
    totalComposicion?: number;
  };
  if (!res.ok || json.ok !== true || !Array.isArray(json.data) || json.data.length === 0) return null;
  const data = json.data.map(wmsItemAInsumoKitItem).filter((x): x is InsumoKitItem => Boolean(x));
  if (data.length === 0) return null;
  return {
    ok: true,
    data,
    fuente: json.fuente ? `wms:${json.fuente}` : "wms",
    ...(typeof json.totalComposicion === "number" ? { totalComposicion: json.totalComposicion } : {}),
  };
}

/**
 * Catálogo de insumos para cargue manual desde Google Sheets.
 *
 * Prioridad:
 * 1) GOOGLE_SHEETS_INSUMOS_CSV_URL — CSV publicado.
 * 2) GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON — cuenta de servicio con acceso a la hoja (restringida OK).
 *    O GOOGLE_SHEETS_USE_FIREBASE_SA=1 y FIREBASE_SERVICE_ACCOUNT_JSON si esa SA es editor.
 * 3) GOOGLE_SHEETS_API_KEY — solo si la hoja es «Cualquiera con el enlace: lector» o pública.
 * 4) Export CSV anónimo (poco habitual con hojas privadas).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse<OkResponse | ErrResponse>) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, message: "Method not allowed", data: [] });
  }

  const puntoVenta = typeof req.query.puntoVenta === "string" ? req.query.puntoVenta.trim() : "";

  try {
    const wms = await obtenerCatalogoDesdeWms();
    if (wms) return res.status(200).json(wms);

    const { rows, fuente } = await obtenerFilasDesdeSheet();
    let data = insumosDesdeGrilla(rows, puntoVenta || null, "sheet");
    let pvFiltroSinCoincidencias = false;
    if (puntoVenta && data.length === 0 && rows.length >= 2) {
      const sinFiltroPv = insumosDesdeGrilla(rows, null, "sheet");
      if (sinFiltroPv.length > 0) {
        data = sinFiltroPv;
        pvFiltroSinCoincidencias = true;
      }
    }
    return res.status(200).json({ ok: true, data, fuente, ...(pvFiltroSinCoincidencias ? { pvFiltroSinCoincidencias: true } : {}) });
  } catch (e) {
    const message =
      e instanceof Error
        ? e.message
        : "No se pudo leer la hoja. Configura GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON (cuenta de servicio editora en la hoja), CSV publicado, o API key con hoja en modo lector por enlace.";
    const saJson = resolveSheetsServiceAccountJsonFromEnv();
    const sheetSetup = saJson ? sheetSetupFromEnv() : undefined;
    return res.status(200).json({ ok: false, message, data: [], sheetSetup });
  }
}

async function obtenerFilasDesdeSheet(): Promise<{ rows: string[][]; fuente: string }> {
  const csvUrl = process.env.GOOGLE_SHEETS_INSUMOS_CSV_URL?.trim();
  if (csvUrl) {
    const r = await fetch(csvUrl, { cache: "no-store" });
    const t = await r.text();
    if (!r.ok) throw new Error(`No se pudo descargar el CSV publicado (${r.status}).`);
    return { rows: parseCsvToRows(t), fuente: "csv_url" };
  }

  const spreadsheetId = sanitizeGoogleSheetsSpreadsheetId(
    process.env.GOOGLE_SHEETS_INSUMOS_SPREADSHEET_ID,
    DEFAULT_GOOGLE_SHEETS_INSUMOS_ID
  );
  const gid = sanitizeGoogleSheetsGid(
    process.env.GOOGLE_SHEETS_INSUMOS_GID,
    DEFAULT_GOOGLE_SHEETS_INSUMOS_GID
  );
  const rangeOverride = process.env.GOOGLE_SHEETS_INSUMOS_RANGE?.trim();

  const saJson = resolveSheetsServiceAccountJsonFromEnv();
  if (saJson) {
    const creds = parseServiceAccountJson(saJson);
    const jwt = createSheetsReadonlyJwt(creds);
    const rows = await fetchSpreadsheetRowsWithJwt(jwt, spreadsheetId, gid, rangeOverride);
    return { rows, fuente: "sheets_service_account" };
  }

  const apiKey = process.env.GOOGLE_SHEETS_API_KEY?.trim();
  if (apiKey) {
    let a1Range: string;
    if (rangeOverride) {
      a1Range = rangeOverride;
    } else {
      const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?key=${encodeURIComponent(apiKey)}&fields=sheets(properties(sheetId,title))`;
      const metaRes = await fetch(metaUrl, { cache: "no-store" });
      const metaJson = (await metaRes.json().catch(() => ({}))) as {
        sheets?: { properties?: { sheetId?: number; title?: string } }[];
        error?: { message?: string };
      };
      if (!metaRes.ok) {
        throw new Error(metaJson.error?.message || `Sheets API metadata ${metaRes.status}`);
      }
      const sheet = metaJson.sheets?.find((s) => s.properties?.sheetId === gid);
      const title = sheet?.properties?.title?.trim();
      if (!title) {
        throw new Error(
          `No se encontró la pestaña con gid/sheetId ${gid}. Define GOOGLE_SHEETS_INSUMOS_RANGE (ej. 'Hoja 1'!A:Z).`
        );
      }
      const safeTitle = title.replace(/'/g, "''");
      a1Range = `'${safeTitle}'!A:ZZ`;
    }

    const valUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(a1Range)}?key=${encodeURIComponent(apiKey)}`;
    const valRes = await fetch(valUrl, { cache: "no-store" });
    const valJson = (await valRes.json().catch(() => ({}))) as {
      values?: string[][];
      error?: { message?: string };
    };
    if (!valRes.ok) {
      throw new Error(valJson.error?.message || `Sheets API values ${valRes.status}`);
    }
    const values = valJson.values;
    if (!values?.length) throw new Error("La hoja no tiene datos en el rango indicado.");
    const rows = values.map((row) => row.map((c) => (c == null ? "" : String(c))));
    return { rows, fuente: "sheets_api" };
  }

  const exportUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;
  const ex = await fetch(exportUrl, { cache: "no-store" });
  const txt = await ex.text();
  if (!ex.ok || txt.includes("Sign in") || txt.includes("accounts.google.com")) {
    throw new Error(
      "La hoja requiere autenticación. Configura GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON con la cuenta de servicio que tenga acceso a la hoja (p. ej. bot-inventario), o comparte la hoja como «Cualquiera con el enlace: lector» y usa GOOGLE_SHEETS_API_KEY, o GOOGLE_SHEETS_INSUMOS_CSV_URL."
    );
  }
  return { rows: parseCsvToRows(txt), fuente: "export_csv" };
}
