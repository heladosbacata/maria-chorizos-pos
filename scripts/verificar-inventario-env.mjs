/**
 * Comprueba que .env.local tenga las variables mínimas para inventario + Sheet.
 * No imprime valores secretos.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const envPath = path.join(root, ".env.local");

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

const firebasePublic = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
];

function ok(msg) {
  console.log(`  \u2713 ${msg}`);
}
function bad(msg) {
  console.log(`  \u2717 ${msg}`);
}

let failed = false;

if (!fs.existsSync(envPath)) {
  console.error("No existe .env.local en la raíz del proyecto. Copia desde .env.example y rellena valores.");
  process.exit(1);
}

const env = parseEnvLocal(fs.readFileSync(envPath, "utf8"));

console.log("Variables de entorno (inventario POS)\n");

for (const k of firebasePublic) {
  const v = env[k];
  if (v && v.length > 0) ok(`${k}`);
  else {
    bad(`${k} vacío o ausente`);
    failed = true;
  }
}

if (env.NEXT_PUBLIC_WMS_URL?.trim()) ok("NEXT_PUBLIC_WMS_URL");
else {
  bad("NEXT_PUBLIC_WMS_URL vacío o ausente");
  failed = true;
}

const sa = env.FIREBASE_SERVICE_ACCOUNT_JSON ?? "";
if (sa.includes("service_account") && sa.includes("private_key")) ok("FIREBASE_SERVICE_ACCOUNT_JSON (presente, sin mostrar)");
else {
  bad("FIREBASE_SERVICE_ACCOUNT_JSON ausente o no parece JSON de cuenta de servicio");
  failed = true;
}

const sheetFirebase = env.GOOGLE_SHEETS_USE_FIREBASE_SA === "1" || env.GOOGLE_SHEETS_USE_FIREBASE_SA?.toLowerCase() === "true";
const sheetOwn = (env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON ?? "").includes("service_account");

if (sheetFirebase) {
  ok("GOOGLE_SHEETS_USE_FIREBASE_SA=1 (reutiliza FIREBASE_SERVICE_ACCOUNT_JSON para Sheets)");
} else if (sheetOwn) {
  ok("GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON (propia para Sheets)");
} else {
  bad("Sheet: define GOOGLE_SHEETS_USE_FIREBASE_SA=1 o GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON con JSON de SA");
  failed = true;
}

console.log("\nOpcionales de Sheet (si no están, el API usa IDs/gid por defecto del código):");
const sheetOpt = [
  "GOOGLE_SHEETS_INSUMOS_SPREADSHEET_ID",
  "GOOGLE_SHEETS_INSUMOS_GID",
  "GOOGLE_SHEETS_INSUMOS_RANGE",
  "GOOGLE_SHEETS_INSUMOS_CSV_URL",
  "GOOGLE_SHEETS_API_KEY",
];
for (const k of sheetOpt) {
  if (env[k]?.trim()) ok(`${k} definido`);
  else console.log(`  · ${k} — no definido (OK si el default te sirve)`);
}

console.log("");
if (failed) {
  console.log("Faltan variables: corrige .env.local y vuelve a ejecutar.\n");
  process.exit(1);
}

console.log("Pendiente solo verificación manual (marca en docs/CHECKLIST_INVENTARIO.md):");
const pendiente = [
  "1) users/{uid}.puntoVenta correcto en Firestore",
  "2) Reglas en consola = inventario (plantilla: firestore.rules.example; no hay firestore.rules en este repo)",
  "3) DB_Franquicia_Insumos_Kit con ítems por PV",
  "4) Sheets API + hoja compartida con client_email de la SA",
  "5) Probar Inventarios / Cargue en el navegador",
  "6) Variables en Vercel si despliegas",
];
for (const line of pendiente) console.log(`  — ${line}`);
console.log("\nDetalle: docs/CHECKLIST_INVENTARIO.md (tabla «qué nos falta»).\n");
