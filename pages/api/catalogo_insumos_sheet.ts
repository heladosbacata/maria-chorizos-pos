import type { NextApiRequest, NextApiResponse } from "next";
import {
  DEFAULT_GOOGLE_SHEETS_INSUMOS_GID,
  DEFAULT_GOOGLE_SHEETS_INSUMOS_ID,
  insumosDesdeGrilla,
  parseCsvToRows,
} from "@/lib/catalogo-insumos-sheet-parse";
import type { InsumoKitItem } from "@/types/inventario-pos";

type OkResponse = { ok: true; data: InsumoKitItem[]; fuente: string };
type ErrResponse = { ok: false; message: string; data: InsumoKitItem[] };

/**
 * Catálogo de insumos para cargue manual desde Google Sheets.
 *
 * Opciones (por prioridad):
 * 1) GOOGLE_SHEETS_INSUMOS_CSV_URL — URL CSV publicada (Archivo → Compartir → Publicar en la web).
 * 2) GOOGLE_SHEETS_API_KEY + GOOGLE_SHEETS_INSUMOS_SPREADSHEET_ID — API v4 (la hoja debe ser visible:
 *    "Cualquiera con el enlace puede ver" o pública). Opcional GOOGLE_SHEETS_INSUMOS_RANGE (ej. Hoja1!A:F).
 *    Si no hay rango, se usa la pestaña cuyo sheetId coincide con GOOGLE_SHEETS_INSUMOS_GID (415609818 por defecto).
 * 3) Exportación CSV clásica (sin API key): solo si la hoja es accesible sin login (poco habitual).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse<OkResponse | ErrResponse>) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, message: "Method not allowed", data: [] });
  }

  const puntoVenta = typeof req.query.puntoVenta === "string" ? req.query.puntoVenta.trim() : "";

  try {
    const rows = await obtenerFilasDesdeSheet();
    const data = insumosDesdeGrilla(rows, puntoVenta || null, "sheet");
    const fuente = process.env.GOOGLE_SHEETS_INSUMOS_CSV_URL?.trim()
      ? "csv_url"
      : process.env.GOOGLE_SHEETS_API_KEY?.trim()
        ? "sheets_api"
        : "export_csv";
    return res.status(200).json({ ok: true, data, fuente });
  } catch (e) {
    const message =
      e instanceof Error
        ? e.message
        : "No se pudo leer la hoja. Configura GOOGLE_SHEETS_API_KEY (hoja con enlace de solo lectura) o GOOGLE_SHEETS_INSUMOS_CSV_URL (publicar como CSV).";
    return res.status(200).json({ ok: false, message, data: [] });
  }
}

async function obtenerFilasDesdeSheet(): Promise<string[][]> {
  const csvUrl = process.env.GOOGLE_SHEETS_INSUMOS_CSV_URL?.trim();
  if (csvUrl) {
    const r = await fetch(csvUrl, { cache: "no-store" });
    const t = await r.text();
    if (!r.ok) throw new Error(`No se pudo descargar el CSV publicado (${r.status}).`);
    return parseCsvToRows(t);
  }

  const apiKey = process.env.GOOGLE_SHEETS_API_KEY?.trim();
  const spreadsheetId =
    process.env.GOOGLE_SHEETS_INSUMOS_SPREADSHEET_ID?.trim() || DEFAULT_GOOGLE_SHEETS_INSUMOS_ID;
  const gid = parseInt(process.env.GOOGLE_SHEETS_INSUMOS_GID || String(DEFAULT_GOOGLE_SHEETS_INSUMOS_GID), 10);

  if (apiKey) {
    const rangeOverride = process.env.GOOGLE_SHEETS_INSUMOS_RANGE?.trim();
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
        throw new Error(`No se encontró la pestaña con gid/sheetId ${gid}. Define GOOGLE_SHEETS_INSUMOS_RANGE (ej. 'Hoja 1'!A:Z).`);
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
    return values.map((row) => row.map((c) => (c == null ? "" : String(c))));
  }

  const exportUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;
  const ex = await fetch(exportUrl, { cache: "no-store" });
  const txt = await ex.text();
  if (!ex.ok || txt.includes("Sign in") || txt.includes("accounts.google.com")) {
    throw new Error(
      "La hoja requiere autenticación. Añade GOOGLE_SHEETS_API_KEY en el servidor (comparte la hoja como «Cualquiera con el enlace: lector») o usa GOOGLE_SHEETS_INSUMOS_CSV_URL tras publicar el CSV."
    );
  }
  return parseCsvToRows(txt);
}
