import type { NextApiRequest, NextApiResponse } from "next";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { idMuroCumpleanos, ventanaCumpleanosActivaColombia } from "@/lib/liga-cumpleanos-colombia";
import { ymdColombia } from "@/lib/fecha-colombia";
import { getCreadorFirestoreContext, getFirebaseAdminApp } from "@/lib/firebase-admin-server";

const COL_MUROS = "posCajerosCumpleMuro";
const SUB_MENSAJES = "mensajes";
const TEXTO_MAX = 240;

function tokenDesdeReq(req: NextApiRequest): string | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  const t = auth.slice(7).trim();
  return t || null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const token = tokenDesdeReq(req);
  if (!token) {
    return res.status(401).json({ ok: false, message: "Sesión requerida." });
  }

  const app = getFirebaseAdminApp();
  if (!app) {
    return res.status(503).json({ ok: false, message: "Firebase Admin no configurado en el POS." });
  }

  const ctx = await getCreadorFirestoreContext(app, token);
  if (!ctx.ok) {
    return res.status(401).json({ ok: false, message: ctx.message });
  }

  const ventanaActiva = ventanaCumpleanosActivaColombia();

  if (req.method === "GET") {
    const cajeroId = typeof req.query.cajeroId === "string" ? req.query.cajeroId.trim() : "";
    const fecha =
      typeof req.query.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.fecha)
        ? req.query.fecha
        : ymdColombia();
    if (!cajeroId) {
      return res.status(400).json({ ok: false, message: "cajeroId es obligatorio." });
    }

    try {
      const db = getFirestore(app);
      const muroId = idMuroCumpleanos(cajeroId, fecha);
      const snap = await db
        .collection(COL_MUROS)
        .doc(muroId)
        .collection(SUB_MENSAJES)
        .orderBy("createdAt", "asc")
        .limit(80)
        .get();

      const mensajes = snap.docs.map((doc) => {
        const d = doc.data();
        const createdAt = d.createdAt as { toDate?: () => Date } | undefined;
        const createdAtIso =
          createdAt && typeof createdAt.toDate === "function"
            ? createdAt.toDate().toISOString()
            : typeof d.createdAtIso === "string"
              ? d.createdAtIso
              : new Date(0).toISOString();
        return {
          id: doc.id,
          texto: String(d.texto ?? ""),
          autorUid: String(d.autorUid ?? doc.id),
          autorNombre: String(d.autorNombre ?? "Cajero"),
          autorPuntoVenta: String(d.autorPuntoVenta ?? ""),
          createdAtIso,
        };
      });

      return res.status(200).json({ ok: true, mensajes, ventanaActiva });
    } catch (e) {
      console.error("pos_cajeros_cumple_muro GET", e);
      return res.status(500).json({ ok: false, message: "No se pudo leer el muro de cumpleaños." });
    }
  }

  if (req.method === "POST") {
    if (!ventanaActiva) {
      return res.status(403).json({
        ok: false,
        message: "El muro de cumpleaños está disponible de 6:00 a 23:59 (hora Colombia).",
        ventanaActiva: false,
      });
    }

    const body = req.body as Record<string, unknown> | undefined;
    const cajeroId = typeof body?.cajeroId === "string" ? body.cajeroId.trim() : "";
    const cajeroNombre = typeof body?.cajeroNombre === "string" ? body.cajeroNombre.trim() : "";
    const autorNombre = typeof body?.autorNombre === "string" ? body.autorNombre.trim() : "";
    const autorPuntoVenta =
      typeof body?.autorPuntoVenta === "string" ? body.autorPuntoVenta.trim() : ctx.puntoVenta ?? "";
    const textoRaw = typeof body?.texto === "string" ? body.texto.trim() : "";

    if (!cajeroId) return res.status(400).json({ ok: false, message: "cajeroId es obligatorio." });
    if (!textoRaw || textoRaw.length > TEXTO_MAX) {
      return res.status(400).json({
        ok: false,
        message: `Escribí un mensaje (máx. ${TEXTO_MAX} caracteres).`,
      });
    }

    const fecha = ymdColombia();
    const muroId = idMuroCumpleanos(cajeroId, fecha);

    try {
      const db = getFirestore(app);
      const muroRef = db.collection(COL_MUROS).doc(muroId);
      const msgRef = muroRef.collection(SUB_MENSAJES).doc(ctx.uid);

      await db.runTransaction(async (tx) => {
        tx.set(
          muroRef,
          {
            cajeroId,
            cajeroNombre: cajeroNombre || "Cajero",
            fechaYmd: fecha,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        tx.set(msgRef, {
          texto: textoRaw,
          autorUid: ctx.uid,
          autorNombre: autorNombre || "Cajero GEB",
          autorPuntoVenta: autorPuntoVenta || "—",
          createdAt: FieldValue.serverTimestamp(),
          createdAtIso: new Date().toISOString(),
        });
      });

      return res.status(200).json({ ok: true, ventanaActiva: true });
    } catch (e) {
      console.error("pos_cajeros_cumple_muro POST", e);
      return res.status(500).json({ ok: false, message: "No se pudo publicar el mensaje." });
    }
  }

  return res.status(405).json({ ok: false, message: "Method not allowed" });
}
