import type { NextApiRequest, NextApiResponse } from "next";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getFirebaseAdminApp } from "@/lib/firebase-admin-server";
import { ymdColombia } from "@/lib/fecha-colombia";
import {
  COL_PLAN_BONOS_ARTESANOS,
  docIdPlanBonosLogro,
  esEmojiFelicitarPlanBonos,
  metaPorId,
  type PlanBonosLogroPublicado,
  type PlanBonosMetaId,
  type PlanBonosReacciones,
} from "@/lib/plan-bonos-artesanos";

type OkPost = { ok: true; logro: PlanBonosLogroPublicado; creado?: boolean };
type OkGet = { ok: true; logros: PlanBonosLogroPublicado[]; ymd: string };
type Err = { ok: false; message: string };

async function authUid(
  req: NextApiRequest
): Promise<{ ok: true; uid: string; pvUsuario: string } | { ok: false; status: number; message: string }> {
  const app = getFirebaseAdminApp();
  if (!app) {
    return {
      ok: false,
      status: 503,
      message: "Firebase Admin no configurado (FIREBASE_SERVICE_ACCOUNT_JSON).",
    };
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) {
    return { ok: false, status: 401, message: "Falta Authorization Bearer." };
  }

  let uid: string;
  try {
    uid = (await getAuth(app).verifyIdToken(token)).uid;
  } catch {
    return { ok: false, status: 401, message: "Sesión inválida o token expirado." };
  }

  const db = getFirestore(app);
  const userSnap = await db.collection("users").doc(uid).get();
  const userData = userSnap.data() ?? {};
  const pvUsuario =
    typeof userData.puntoVenta === "string" && userData.puntoVenta.trim()
      ? userData.puntoVenta.trim()
      : "";
  if (!pvUsuario) {
    return { ok: false, status: 400, message: "Tu usuario no tiene punto de venta asignado." };
  }

  return { ok: true, uid, pvUsuario };
}

function normalizarReacciones(raw: unknown): PlanBonosReacciones {
  if (!raw || typeof raw !== "object") return {};
  const out: PlanBonosReacciones = {};
  for (const [emoji, uids] of Object.entries(raw as Record<string, unknown>)) {
    if (!esEmojiFelicitarPlanBonos(emoji) || !Array.isArray(uids)) continue;
    const clean = uids.filter((u): u is string => typeof u === "string" && Boolean(u.trim()));
    if (clean.length) out[emoji] = [...new Set(clean)];
  }
  return out;
}

function snapALogro(id: string, data: Record<string, unknown>): PlanBonosLogroPublicado | null {
  const metaId = typeof data.metaId === "string" ? data.metaId : "";
  const meta = metaPorId(metaId);
  if (!meta) return null;
  const puntoVenta = typeof data.puntoVenta === "string" ? data.puntoVenta.trim() : "";
  if (!puntoVenta) return null;
  return {
    id,
    metaId: meta.id,
    umbralCOP: meta.umbralCOP,
    bonoCOP: meta.bonoCOP,
    etiqueta: meta.etiqueta,
    tono: meta.tono,
    puntoVenta,
    ventaAlcanzada: typeof data.ventaAlcanzada === "number" ? data.ventaAlcanzada : 0,
    ymd: typeof data.ymd === "string" ? data.ymd : "",
    createdAtMs: typeof data.createdAtMs === "number" ? data.createdAtMs : 0,
    uid: typeof data.uid === "string" ? data.uid : undefined,
    artesanoNombre:
      typeof data.artesanoNombre === "string" && data.artesanoNombre.trim()
        ? data.artesanoNombre.trim()
        : undefined,
    reacciones: normalizarReacciones(data.reacciones),
  };
}

/**
 * Plan bonos artesanos:
 * GET  — lista logros del día (Colombia) para avisar a otros POS.
 * POST action publicar — publica un logro (idempotente por día + meta).
 * POST action felicitar — agrega/quita emoji de felicitación de otro POS.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse<OkPost | OkGet | Err>) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, message: "Método no permitido." });
  }

  const auth = await authUid(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, message: auth.message });
  }

  const app = getFirebaseAdminApp();
  if (!app) {
    return res.status(503).json({ ok: false, message: "Firebase Admin no configurado." });
  }
  const db = getFirestore(app);
  const ymd = ymdColombia();

  if (req.method === "GET") {
    try {
      const snap = await db
        .collection(COL_PLAN_BONOS_ARTESANOS)
        .where("ymd", "==", ymd)
        .orderBy("createdAtMs", "desc")
        .limit(40)
        .get();
      const logros: PlanBonosLogroPublicado[] = [];
      snap.docs.forEach((doc) => {
        const logro = snapALogro(doc.id, doc.data() as Record<string, unknown>);
        if (logro) logros.push(logro);
      });
      return res.status(200).json({ ok: true, logros, ymd });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al listar logros.";
      if (/index|FAILED_PRECONDITION/i.test(msg)) {
        try {
          const snap = await db.collection(COL_PLAN_BONOS_ARTESANOS).where("ymd", "==", ymd).limit(60).get();
          const logros = snap.docs
            .map((doc) => snapALogro(doc.id, doc.data() as Record<string, unknown>))
            .filter(Boolean) as PlanBonosLogroPublicado[];
          logros.sort((a, b) => b.createdAtMs - a.createdAtMs);
          return res.status(200).json({ ok: true, logros: logros.slice(0, 40), ymd });
        } catch (e2) {
          return res.status(500).json({
            ok: false,
            message: e2 instanceof Error ? e2.message : "Error al listar logros.",
          });
        }
      }
      return res.status(500).json({ ok: false, message: msg });
    }
  }

  const body = (req.body ?? {}) as {
    action?: string;
    metaId?: string;
    ventaAlcanzada?: number;
    puntoVenta?: string;
    artesanoNombre?: string;
    logroId?: string;
    emoji?: string;
  };
  const action = String(body.action ?? "publicar").trim().toLowerCase();

  if (action === "felicitar") {
    const logroId = String(body.logroId ?? "").trim();
    const emoji = String(body.emoji ?? "").trim();
    if (!logroId) {
      return res.status(400).json({ ok: false, message: "Falta logroId." });
    }
    if (!esEmojiFelicitarPlanBonos(emoji)) {
      return res.status(400).json({ ok: false, message: "Emoji no permitido." });
    }
    const ref = db.collection(COL_PLAN_BONOS_ARTESANOS).doc(logroId);
    const snap = await ref.get();
    if (!snap.exists) {
      return res.status(404).json({ ok: false, message: "Logro no encontrado." });
    }
    const data = snap.data() as Record<string, unknown>;
    const reacciones = normalizarReacciones(data.reacciones);
    // Un emoji por usuario: quitar de todos y poner en el elegido (toggle si ya tenía el mismo).
    const yaTeníaEste = (reacciones[emoji] ?? []).includes(auth.uid);
    for (const key of Object.keys(reacciones)) {
      reacciones[key] = (reacciones[key] ?? []).filter((u) => u !== auth.uid);
      if (reacciones[key].length === 0) delete reacciones[key];
    }
    if (!yaTeníaEste) {
      reacciones[emoji] = [...(reacciones[emoji] ?? []), auth.uid];
    }
    await ref.set(
      {
        reacciones,
        ultimaFelicitarAtMs: Date.now(),
        actualizadoAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    const logro = snapALogro(logroId, { ...data, reacciones });
    if (!logro) {
      return res.status(500).json({ ok: false, message: "No se pudo leer el logro." });
    }
    return res.status(200).json({ ok: true, logro });
  }

  const meta = metaPorId(String(body.metaId ?? ""));
  if (!meta) {
    return res.status(400).json({ ok: false, message: "metaId inválido." });
  }
  const ventaAlcanzada =
    typeof body.ventaAlcanzada === "number" && Number.isFinite(body.ventaAlcanzada)
      ? Math.max(0, Math.round(body.ventaAlcanzada))
      : 0;
  if (ventaAlcanzada < meta.umbralCOP) {
    return res.status(400).json({
      ok: false,
      message: `La venta (${ventaAlcanzada}) aún no alcanza el umbral ${meta.umbralCOP}.`,
    });
  }

  const puntoVenta =
    typeof body.puntoVenta === "string" && body.puntoVenta.trim()
      ? body.puntoVenta.trim()
      : auth.pvUsuario;
  const artesanoNombre =
    typeof body.artesanoNombre === "string" && body.artesanoNombre.trim()
      ? body.artesanoNombre.trim().slice(0, 80)
      : undefined;
  const id = docIdPlanBonosLogro(puntoVenta, ymd, meta.id as PlanBonosMetaId);
  const ref = db.collection(COL_PLAN_BONOS_ARTESANOS).doc(id);
  const existente = await ref.get();
  if (existente.exists) {
    const prev = existente.data() as Record<string, unknown>;
    if (artesanoNombre && !prev.artesanoNombre) {
      await ref.set({ artesanoNombre }, { merge: true });
    }
    const logro = snapALogro(id, { ...prev, artesanoNombre: artesanoNombre || prev.artesanoNombre });
    if (logro) {
      return res.status(200).json({ ok: true, logro, creado: false });
    }
  }

  const createdAtMs = Date.now();
  const payload = {
    metaId: meta.id,
    umbralCOP: meta.umbralCOP,
    bonoCOP: meta.bonoCOP,
    etiqueta: meta.etiqueta,
    tono: meta.tono,
    puntoVenta,
    ventaAlcanzada,
    ymd,
    createdAtMs,
    uid: auth.uid,
    reacciones: {},
    ...(artesanoNombre ? { artesanoNombre } : {}),
    creadoAt: FieldValue.serverTimestamp(),
  };
  await ref.set(payload, { merge: true });

  return res.status(200).json({
    ok: true,
    creado: true,
    logro: {
      id,
      metaId: meta.id,
      umbralCOP: meta.umbralCOP,
      bonoCOP: meta.bonoCOP,
      etiqueta: meta.etiqueta,
      tono: meta.tono,
      puntoVenta,
      ventaAlcanzada,
      ymd,
      createdAtMs,
      uid: auth.uid,
      artesanoNombre,
      reacciones: {},
    },
  });
}
