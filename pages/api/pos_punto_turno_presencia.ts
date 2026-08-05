import type { NextApiRequest, NextApiResponse } from "next";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getFirebaseAdminApp } from "@/lib/firebase-admin-server";
import { esContadorInvitado } from "@/lib/auth-roles";
import { puntoVentaCoincide } from "@/lib/punto-venta-clave";
import {
  COL_PUNTO_TURNO_PRESENCIA,
  docIdPresenciaTurno,
} from "@/lib/pos-punto-turno-presencia";

type Ok = { ok: true };
type Err = { ok: false; message: string };

/**
 * POST — la caja publica heartbeat de turno abierto (o limpia al cerrar).
 * Body: { puntoVenta, abierto, turnoSesionId? }
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse<Ok | Err>) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  const app = getFirebaseAdminApp();
  if (!app) {
    return res.status(503).json({
      ok: false,
      message: "Firebase Admin no configurado (FIREBASE_SERVICE_ACCOUNT_JSON).",
    });
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) {
    return res.status(401).json({ ok: false, message: "Falta Authorization Bearer." });
  }

  let uid: string;
  try {
    uid = (await getAuth(app).verifyIdToken(token)).uid;
  } catch {
    return res.status(401).json({ ok: false, message: "Sesión inválida o token expirado." });
  }

  const db = getFirestore(app);
  const userSnap = await db.collection("users").doc(uid).get();
  const userData = userSnap.data() ?? {};
  const role = typeof userData.role === "string" ? userData.role : null;
  if (esContadorInvitado(role)) {
    return res.status(403).json({ ok: false, message: "Las cuentas de contador no publican turno de caja." });
  }
  const pvUsuario =
    typeof userData.puntoVenta === "string" && userData.puntoVenta.trim()
      ? userData.puntoVenta.trim()
      : "";
  if (!pvUsuario) {
    return res.status(400).json({ ok: false, message: "Tu usuario no tiene punto de venta asignado." });
  }

  const body = (typeof req.body === "object" && req.body !== null ? req.body : {}) as Record<string, unknown>;
  const puntoVenta = typeof body.puntoVenta === "string" ? body.puntoVenta.trim() : "";
  if (!puntoVenta || !puntoVentaCoincide(puntoVenta, pvUsuario)) {
    return res.status(403).json({ ok: false, message: "El punto de venta no coincide con tu sesión." });
  }

  const abierto = body.abierto === true;
  const turnoSesionId =
    typeof body.turnoSesionId === "string" && body.turnoSesionId.trim()
      ? body.turnoSesionId.trim()
      : "";
  const docId = docIdPresenciaTurno(pvUsuario);
  const ref = db.collection(COL_PUNTO_TURNO_PRESENCIA).doc(docId);

  try {
    if (!abierto) {
      await ref.set(
        {
          puntoVenta: pvUsuario,
          abierto: false,
          uid,
          updatedAt: FieldValue.serverTimestamp(),
          updatedAtMs: Date.now(),
          cerradoAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      return res.status(200).json({ ok: true });
    }

    await ref.set(
      {
        puntoVenta: pvUsuario,
        abierto: true,
        uid,
        ...(turnoSesionId ? { turnoSesionId } : {}),
        updatedAt: FieldValue.serverTimestamp(),
        updatedAtMs: Date.now(),
      },
      { merge: true }
    );
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("pos_punto_turno_presencia", e);
    return res.status(500).json({
      ok: false,
      message: e instanceof Error ? e.message : "No se pudo guardar la presencia del turno.",
    });
  }
}
