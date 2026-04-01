/**
 * Escritura en Google Sheets v4 con cuenta de servicio (append de filas).
 * Solo rutas API Node.
 */

import { JWT } from "google-auth-library";
import {
  parseServiceAccountJson,
  type ServiceAccountCredentials,
} from "@/lib/google-sheets-service-account-read";

const SHEETS_RW = "https://www.googleapis.com/auth/spreadsheets";

export function createSheetsReadWriteJwt(creds: ServiceAccountCredentials): JWT {
  return new JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: [SHEETS_RW],
  });
}

/**
 * Agrega filas al final del rango (pestaña). `rangeA1` ej. `'DB_Pos_Clientes'!A:O`.
 * @see https://developers.google.com/sheets/api/reference/rest/v4/spreadsheets.values/append
 */
export async function appendSpreadsheetValues(
  jwt: JWT,
  spreadsheetId: string,
  rangeA1: string,
  rows: string[][]
): Promise<void> {
  if (rows.length === 0) return;
  const id = encodeURIComponent(spreadsheetId);
  const rangeEnc = encodeURIComponent(rangeA1);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${rangeEnc}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  await jwt.request({
    url,
    method: "POST",
    data: { values: rows },
  });
}

/** Lee la primera fila del rango (misma pestaña) para decidir si escribir encabezados. */
export async function leerPrimeraFilaRango(
  jwt: JWT,
  spreadsheetId: string,
  rangePrimeraFila: string
): Promise<string[]> {
  const id = encodeURIComponent(spreadsheetId);
  const rangeEnc = encodeURIComponent(rangePrimeraFila);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${rangeEnc}`;
  const res = await jwt.request<{ values?: string[][] }>({ url });
  const row = res.data.values?.[0];
  if (!row?.length) return [];
  return row.map((c) => (c == null ? "" : String(c)));
}

export { parseServiceAccountJson };
