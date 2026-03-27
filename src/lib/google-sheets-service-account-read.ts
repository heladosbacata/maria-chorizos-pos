/**
 * Lectura de Google Sheets v4 con cuenta de servicio (hojas restringidas).
 * Solo para rutas API Node; no importar desde el cliente.
 */

import { JWT } from "google-auth-library";

const SHEETS_READONLY = "https://www.googleapis.com/auth/spreadsheets.readonly";

export type ServiceAccountCredentials = {
  client_email: string;
  private_key: string;
};

export function parseServiceAccountJson(raw: string): ServiceAccountCredentials {
  const creds = JSON.parse(raw) as Record<string, unknown>;
  const client_email = creds.client_email;
  const private_key = creds.private_key;
  if (typeof client_email !== "string" || typeof private_key !== "string") {
    throw new Error("JSON de cuenta de servicio inválido: faltan client_email o private_key.");
  }
  return { client_email, private_key: private_key.replace(/\\n/g, "\n") };
}

export function createSheetsReadonlyJwt(creds: ServiceAccountCredentials): JWT {
  return new JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: [SHEETS_READONLY],
  });
}

/**
 * `GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON` (bot-inventario u otra con acceso a la hoja), o
 * `GOOGLE_SHEETS_USE_FIREBASE_SA=1` + `FIREBASE_SERVICE_ACCOUNT_JSON` si esa SA también es editor.
 */
export function resolveSheetsServiceAccountJsonFromEnv(): string | null {
  const dedicated = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON?.trim();
  if (dedicated) return dedicated;
  const reuse = process.env.GOOGLE_SHEETS_USE_FIREBASE_SA?.trim();
  if (reuse === "1" || reuse?.toLowerCase() === "true") {
    return process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim() || null;
  }
  return null;
}

/** Metadatos públicos de la SA que lee Sheets (sin clave privada). Sirve para mensajes de ayuda en POS. */
export type ServiceAccountSheetsPublicMeta = {
  clientEmail: string;
  /** project_id del JSON (ej. maria-chorizos-wms) para enlaces a Cloud Console */
  projectId: string;
};

export function getSheetsServiceAccountPublicMetaFromEnv(): ServiceAccountSheetsPublicMeta | null {
  const raw = resolveSheetsServiceAccountJsonFromEnv();
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as { client_email?: unknown; project_id?: unknown };
    const clientEmail = typeof j.client_email === "string" ? j.client_email.trim() : "";
    const projectId = typeof j.project_id === "string" ? j.project_id.trim() : "";
    if (!clientEmail) return null;
    return { clientEmail, projectId };
  } catch {
    return null;
  }
}

/** Habilitar Google Sheets API en el proyecto de la cuenta de servicio (acción única por proyecto). */
export function googleSheetsApiEnableUrl(projectId: string): string {
  const p = projectId.trim() || "_";
  return `https://console.cloud.google.com/apis/library/sheets.googleapis.com?project=${encodeURIComponent(p)}`;
}

export async function fetchSpreadsheetRowsWithJwt(
  jwt: JWT,
  spreadsheetId: string,
  gid: number,
  rangeOverride: string | undefined
): Promise<string[][]> {
  let a1Range: string;
  if (rangeOverride?.trim()) {
    a1Range = rangeOverride.trim();
  } else {
    const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=sheets(properties(sheetId,title))`;
    const metaRes = await jwt.request<{
      sheets?: { properties?: { sheetId?: number; title?: string } }[];
    }>({ url: metaUrl });
    const sheets = metaRes.data.sheets;
    const sheet = sheets?.find((s) => s.properties?.sheetId === gid);
    const title = sheet?.properties?.title?.trim();
    if (!title) {
      throw new Error(
        `No se encontró la pestaña con gid/sheetId ${gid}. Define GOOGLE_SHEETS_INSUMOS_RANGE (ej. 'Hoja 1'!A:Z).`
      );
    }
    const safeTitle = title.replace(/'/g, "''");
    a1Range = `'${safeTitle}'!A:ZZ`;
  }

  const valPath = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(a1Range)}`;
  const valRes = await jwt.request<{ values?: string[][] }>({ url: valPath });
  const values = valRes.data.values;
  if (!values?.length) throw new Error("La hoja no tiene datos en el rango indicado.");
  return values.map((row) => row.map((c) => (c == null ? "" : String(c))));
}
