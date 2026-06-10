/**
 * Agrega la columna PRECIO_COMPRA_UNITARIO en DB_Franquicia_Insumos_Kit si no existe.
 * Usa la misma cuenta de servicio que el POS (FIREBASE SA o GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON).
 *
 * Uso: node scripts/agregar-columna-precio-compra-insumos.mjs
 *      node scripts/agregar-columna-precio-compra-insumos.mjs --dry-run
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { JWT } from "google-auth-library";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const DEFAULT_SPREADSHEET_ID = "1c1Ihhx0mtGduvNLPN_DIURK5AJYU2JJ9oIbChDVaABQ";
const DEFAULT_GID = 415609818;
const COLUMNA = "PRECIO_COMPRA_UNITARIO";
const ALIAS = [
  "preciocompraunitario",
  "preciocompracop",
  "preciocompra",
  "precio_compra_unitario",
  "precio_compra_cop",
  "precio_compra",
  "costocompraunitario",
  "costocompra",
  "costo_compra",
];

function parseEnvLocal(raw) {
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function loadEnv() {
  const envPath = path.join(root, ".env.local");
  if (!fs.existsSync(envPath)) throw new Error("No existe .env.local");
  return parseEnvLocal(fs.readFileSync(envPath, "utf8"));
}

function resolveSaJson(env) {
  const dedicated = env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON?.trim();
  if (dedicated) return dedicated;
  const reuse = env.GOOGLE_SHEETS_USE_FIREBASE_SA?.trim();
  if (reuse === "1" || reuse?.toLowerCase() === "true") {
    return env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim() || null;
  }
  return null;
}

function normHeader(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function colToA1(n) {
  let x = n + 1;
  let s = "";
  while (x > 0) {
    const r = (x - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

function sanitizeSpreadsheetId(raw, fallback) {
  const t = String(raw ?? "").trim();
  if (!t) return fallback;
  const m = t.match(/[-\w]{20,}/);
  return m ? m[0] : fallback;
}

function sanitizeGid(raw, fallback) {
  const t = String(raw ?? "").trim();
  if (!t) return fallback;
  const m = t.match(/\d+/);
  return m ? Number(m[0]) : fallback;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const env = loadEnv();
  const saRaw = resolveSaJson(env);
  if (!saRaw) {
    throw new Error("Configura GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON o GOOGLE_SHEETS_USE_FIREBASE_SA=1 + FIREBASE_SERVICE_ACCOUNT_JSON");
  }

  const creds = JSON.parse(saRaw);
  const jwt = new JWT({
    email: creds.client_email,
    key: String(creds.private_key).replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const spreadsheetId = sanitizeSpreadsheetId(env.GOOGLE_SHEETS_INSUMOS_SPREADSHEET_ID, DEFAULT_SPREADSHEET_ID);
  const gid = sanitizeGid(env.GOOGLE_SHEETS_INSUMOS_GID, DEFAULT_GID);

  const metaRes = await jwt.request({
    url: `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=sheets(properties(sheetId,title))`,
  });
  const sheet = metaRes.data.sheets?.find((s) => s.properties?.sheetId === gid);
  const title = sheet?.properties?.title?.trim();
  if (!title) throw new Error(`No se encontró pestaña gid=${gid}`);

  const safeTitle = title.replace(/'/g, "''");
  const headerRange = `'${safeTitle}'!1:1`;
  const headerRes = await jwt.request({
    url: `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(headerRange)}`,
  });
  const headers = (headerRes.data.values?.[0] ?? []).map((c) => String(c ?? "").trim());
  const headersNorm = headers.map(normHeader);

  console.log(`Hoja: ${title} (gid ${gid})`);
  console.log(`Encabezados actuales (${headers.length}): ${headers.filter(Boolean).join(" | ") || "(vacío)"}`);

  const idxExistente = headersNorm.findIndex((h) => ALIAS.some((k) => h === k || h.includes(k)));
  if (idxExistente >= 0) {
    console.log(`\n✓ Ya existe columna de precio: "${headers[idxExistente]}" (columna ${colToA1(idxExistente)})`);
    console.log("Podés digitar precios ahí. El POS la lee automáticamente.");
    return;
  }

  const nuevaCol = headers.length;
  const celda = `${colToA1(nuevaCol)}1`;
  const range = `'${safeTitle}'!${celda}`;
  console.log(`\n→ Se agregará "${COLUMNA}" en ${celda} (columna ${nuevaCol + 1})`);

  if (dryRun) {
    console.log("(dry-run: no se escribió nada)");
    return;
  }

  await jwt.request({
    url: `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
    method: "PUT",
    data: { values: [[COLUMNA]] },
  });

  console.log(`\n✓ Columna "${COLUMNA}" creada en ${celda}.`);
  console.log("Abrí la hoja, completá el precio por fila (COP según columna Unidad) y recargá el cargue en el POS.");
  console.log(`https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${gid}`);
}

main().catch((e) => {
  console.error("Error:", e instanceof Error ? e.message : e);
  process.exit(1);
});
