import { readFileSync } from "fs";
import { cert, initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const envPath = new URL("../.env.local", import.meta.url);
const env = readFileSync(envPath, "utf8");
const line = env.split("\n").find((l) => l.startsWith("FIREBASE_SERVICE_ACCOUNT_JSON="));
if (!line) {
  console.error("Falta FIREBASE_SERVICE_ACCOUNT_JSON en .env.local");
  process.exit(1);
}
const raw = line.slice("FIREBASE_SERVICE_ACCOUNT_JSON=".length).trim();
const sa = JSON.parse(raw);
const app = getApps().length ? getApps()[0] : initializeApp({ credential: cert(sa) });
const db = getFirestore(app);

const pv = process.argv[2]?.trim() || "Punto Demo App";
console.log("Proyecto:", sa.project_id);
console.log("Punto:", pv);

try {
  const snap = await db.collection("posVentasCloud").where("puntoVenta", "==", pv).limit(5).get();
  console.log("Docs (sin orderBy):", snap.size);
  for (const d of snap.docs) {
    const x = d.data();
    console.log(" -", d.id.slice(0, 12), x.fechaYmd, x.total);
  }
} catch (e) {
  console.error("Error simple:", e.message);
}

try {
  const snap2 = await db
    .collection("posVentasCloud")
    .where("puntoVenta", "==", pv)
    .orderBy("serverCreatedAt", "desc")
    .limit(5)
    .get();
  console.log("Docs (con orderBy serverCreatedAt):", snap2.size);
} catch (e) {
  console.error("Error orderBy:", e.message);
}
