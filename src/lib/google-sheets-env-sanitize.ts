/**
 * Normaliza variables de entorno cuando en Vercel se pega la URL completa o texto extra
 * (evita fallos de la API de Google Sheets).
 */

/** Extrae el ID del spreadsheet desde URL o cadena sucia. */
export function sanitizeGoogleSheetsSpreadsheetId(raw: string | undefined, fallback: string): string {
  let t = (raw ?? "").trim();
  if (!t) return fallback;
  const fromUrl = t.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (fromUrl?.[1]) return fromUrl[1];
  t = t.split(/[?#]/)[0]!.trim();
  t = t.replace(/\/edit\/?$/i, "").trim();
  const parts = t.split("/").filter(Boolean);
  const dIdx = parts.indexOf("d");
  if (dIdx >= 0 && parts[dIdx + 1]) {
    return parts[dIdx + 1]!.replace(/[^a-zA-Z0-9-_]/g, "") || fallback;
  }
  const cleaned = t.replace(/[^a-zA-Z0-9-_]/g, "");
  return cleaned.length >= 20 ? cleaned : fallback;
}

/** Obtiene el gid numérico aunque venga como `415609818#gid=...` o solo dígitos. */
export function sanitizeGoogleSheetsGid(raw: string | undefined, fallback: number): number {
  const t = (raw ?? "").trim();
  if (!t) return fallback;
  const gidEq = t.match(/gid=(\d+)/i);
  if (gidEq?.[1]) {
    const n = parseInt(gidEq[1], 10);
    return Number.isFinite(n) ? n : fallback;
  }
  const n = parseInt(t, 10);
  return Number.isFinite(n) ? n : fallback;
}
