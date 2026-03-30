import type { NextApiRequest, NextApiResponse } from "next";
import { getFirestore, type Firestore, type Query } from "firebase-admin/firestore";
import { getFirebaseAdminApp, getCreadorFirestoreContext } from "@/lib/firebase-admin-server";
import { POS_CONTADOR_ROLE } from "@/lib/auth-roles";
import { normPuntoVentaCatalogo } from "@/lib/punto-venta-catalogo-norm";

const CLAVE_DEFAULT = "MC2026";

const COL_SALDOS = "posInventarioSaldos";
const COL_MOVS = "posInventarioMovimientos";
const COL_ENS_SALDOS = "pos_inventario_ensamble_saldo";
const COL_ENS_MOVS = "pos_inventario_ensamble_movimientos";
const COL_VENTAS_CLOUD = "posVentasCloud";
const COL_MINIMOS = "posInventarioMinimos";

function claveEsperada(): string {
  const e = process.env.POS_REINICIO_FABRICA_CLAVE?.trim();
  return e && e.length >= 4 ? e : CLAVE_DEFAULT;
}

async function borrarPorConsulta(db: Firestore, q: Query): Promise<number> {
  let total = 0;
  while (true) {
    const snap = await q.limit(400).get();
    if (snap.empty) break;
    const batch = db.batch();
    for (const d of snap.docs) {
      batch.delete(d.ref);
    }
    await batch.commit();
    total += snap.size;
    if (snap.size < 400) break;
  }
  return total;
}

/**
 * POST: borra ventas en nube, inventario POS y ensamble asociados al punto de venta del usuario.
 * Requiere clave maestra en el cuerpo y Firebase Admin configurado.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  const app = getFirebaseAdminApp();
  if (!app) {
    return res.status(503).json({
      ok: false,
      message:
        "FIREBASE_SERVICE_ACCOUNT_JSON no está configurada: no se puede borrar el histórico en la nube desde el servidor.",
    });
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
  if (ctx.role === POS_CONTADOR_ROLE) {
    return res.status(403).json({ ok: false, message: "Las cuentas de contador no pueden ejecutar el reinicio." });
  }
  if (!ctx.puntoVenta) {
    return res.status(400).json({ ok: false, message: "Tu perfil no tiene punto de venta." });
  }

  const b = req.body as Record<string, unknown>;
  const clave = typeof b.clave === "string" ? b.clave.trim() : "";
  if (clave !== claveEsperada()) {
    return res.status(403).json({ ok: false, message: "Clave incorrecta." });
  }

  const pv = ctx.puntoVenta;
  const pvClave = normPuntoVentaCatalogo(pv);
  const db = getFirestore(app);

  const resumen: Record<string, number> = {};

  try {
    resumen.saldosPos = await borrarPorConsulta(db, db.collection(COL_SALDOS).where("puntoVenta", "==", pv));
    resumen.movimientosPos = await borrarPorConsulta(db, db.collection(COL_MOVS).where("puntoVenta", "==", pv));
    resumen.ventasCloud = await borrarPorConsulta(db, db.collection(COL_VENTAS_CLOUD).where("puntoVenta", "==", pv));
    resumen.minimosFirestore = await borrarPorConsulta(db, db.collection(COL_MINIMOS).where("puntoVenta", "==", pv));

    resumen.saldosEnsamble = await borrarPorConsulta(db, db.collection(COL_ENS_SALDOS).where("puntoVenta", "==", pv));
    if (pvClave) {
      resumen.saldosEnsamble += await borrarPorConsulta(
        db,
        db.collection(COL_ENS_SALDOS).where("puntoVentaClave", "==", pvClave)
      );
    }
    resumen.movsEnsamble = await borrarPorConsulta(db, db.collection(COL_ENS_MOVS).where("puntoVenta", "==", pv));
  } catch (e) {
    console.error("pos_reinicio_fabrica", e);
    return res.status(500).json({
      ok: false,
      message: e instanceof Error ? e.message : "Error al borrar datos en Firestore.",
    });
  }

  return res.status(200).json({ ok: true, resumen });
}
