import type { NextApiRequest, NextApiResponse } from "next";
import { getFirestore } from "firebase-admin/firestore";
import { getFirebaseAdminApp } from "@/lib/firebase-admin-server";
import { puntoVentaCoincide, normalizarPuntoVentaClave } from "@/lib/punto-venta-clave";
import {
  COL_PUNTO_TURNO_PRESENCIA,
  docIdPresenciaTurno,
  presenciaTurnoVigente,
} from "@/lib/pos-punto-turno-presencia";

type Ok = { ok: true; puntoVenta: string; abierto: boolean; fuente?: string };
type Err = { ok: false; message: string };

const COL_TURNO_ACTIVO = "pos_turno_activo";

/**
 * GET público — ¿hay turno de caja abierto para este punto?
 * 1) Presencia heartbeat del POS (`pos_punto_turno_presencia`)
 * 2) Fallback: documentos `pos_turno_activo` con ese puntoVenta
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse<Ok | Err>) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  const pvRaw =
    typeof req.query.puntoVenta === "string"
      ? req.query.puntoVenta
      : Array.isArray(req.query.puntoVenta)
        ? String(req.query.puntoVenta[0] ?? "")
        : "";
  const puntoVenta = pvRaw.trim();
  if (!puntoVenta) {
    return res.status(400).json({ ok: false, message: "puntoVenta es obligatorio." });
  }

  res.setHeader("Cache-Control", "no-store");

  const app = getFirebaseAdminApp();
  if (!app) {
    return res.status(200).json({ ok: true, puntoVenta, abierto: false, fuente: "sin_admin" });
  }

  const db = getFirestore(app);
  const now = Date.now();

  try {
    const presSnap = await db.collection(COL_PUNTO_TURNO_PRESENCIA).doc(docIdPresenciaTurno(puntoVenta)).get();
    if (presSnap.exists) {
      const d = presSnap.data() as {
        abierto?: boolean;
        updatedAtMs?: number;
        puntoVenta?: string;
      };
      const pvDoc = typeof d.puntoVenta === "string" ? d.puntoVenta : puntoVenta;
      if (puntoVentaCoincide(pvDoc, puntoVenta) && d.abierto === true) {
        const ms = typeof d.updatedAtMs === "number" ? d.updatedAtMs : 0;
        if (presenciaTurnoVigente(ms, now)) {
          return res.status(200).json({ ok: true, puntoVenta, abierto: true, fuente: "presencia" });
        }
      }
    }
  } catch (e) {
    console.warn("pos_punto_turno_abierto presencia", e);
  }

  try {
    const qExact = await db.collection(COL_TURNO_ACTIVO).where("puntoVenta", "==", puntoVenta).limit(5).get();
    if (!qExact.empty) {
      return res.status(200).json({ ok: true, puntoVenta, abierto: true, fuente: "pos_turno_activo" });
    }

    const pvNorm = normalizarPuntoVentaClave(puntoVenta);
    if (pvNorm && pvNorm !== puntoVenta) {
      const qNorm = await db
        .collection(COL_TURNO_ACTIVO)
        .where("puntoVentaNorm", "==", pvNorm)
        .limit(5)
        .get();
      if (!qNorm.empty) {
        return res.status(200).json({ ok: true, puntoVenta, abierto: true, fuente: "pos_turno_activo_norm" });
      }
    }

    // Último recurso: escanear pocos docs activos si el campo se llama distinto (abierto + pv).
    const qAbierto = await db.collection(COL_TURNO_ACTIVO).where("abierto", "==", true).limit(40).get();
    for (const doc of qAbierto.docs) {
      const d = doc.data() as { puntoVenta?: string; punto_venta?: string };
      const pvDoc = String(d.puntoVenta ?? d.punto_venta ?? "").trim();
      if (pvDoc && puntoVentaCoincide(pvDoc, puntoVenta)) {
        return res.status(200).json({ ok: true, puntoVenta, abierto: true, fuente: "pos_turno_activo_scan" });
      }
    }
  } catch (e) {
    console.warn("pos_punto_turno_abierto turno_activo", e);
  }

  return res.status(200).json({ ok: true, puntoVenta, abierto: false, fuente: "ninguna" });
}
