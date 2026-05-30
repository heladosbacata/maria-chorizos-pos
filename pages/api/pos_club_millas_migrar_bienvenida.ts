import type { NextApiRequest, NextApiResponse } from "next";
import { getFirestore } from "firebase-admin/firestore";
import { getFirebaseAdminApp, getCreadorFirestoreContext } from "@/lib/firebase-admin-server";
import { POS_CONTADOR_ROLE } from "@/lib/auth-roles";
import {
  aplicarBienvenidaClubMillasACliente,
  CAMPO_PIN_CLUB_MILLAS_POS,
  emailValidoClientePos,
  type ClientePosFirestoreLike,
} from "@/lib/pos-cliente-club-millas-bienvenida";
import { headersClubMillasPosSecretHaciaWms } from "@/lib/club-millas-wms-secret-header";
import { getWmsPublicBaseUrl } from "@/lib/wms-public-base";

type Item = { clienteId: string; ok: boolean; error?: string; correoEnviado?: boolean; wmsSincronizado?: boolean };
type Ok = {
  ok: true;
  procesados: number;
  exitos: number;
  fallos: number;
  wmsMigracionGlobal?: { exitos: number; fallos: number; procesados: number };
  items: Item[];
};
type Err = { ok: false; message: string };

const WMS_MIGRAR_PATH_DEFAULT = "/api/club-de-millas/pos/migrar-pins-bienvenida";

async function migrarSociosWmsSinPin(limite: number): Promise<{ exitos: number; fallos: number; procesados: number } | null> {
  const secret = process.env.CLUB_MILLAS_POS_SECRET?.trim();
  if (!secret) return null;
  const raw = process.env.WMS_CLUB_MILLAS_MIGRAR_PATH?.trim() || WMS_MIGRAR_PATH_DEFAULT;
  const base = getWmsPublicBaseUrl().replace(/\/$/, "");
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  try {
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: headersClubMillasPosSecretHaciaWms(secret),
      body: JSON.stringify({ limite, soloSinPin: true, enviarCorreo: true }),
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      exitos?: number;
      fallos?: number;
      procesados?: number;
    };
    if (!res.ok || data.ok !== true) return null;
    return {
      exitos: Number(data.exitos ?? 0) || 0,
      fallos: Number(data.fallos ?? 0) || 0,
      procesados: Number(data.procesados ?? 0) || 0,
    };
  } catch {
    return null;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<Ok | Err>) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  const app = getFirebaseAdminApp();
  if (!app) {
    return res.status(503).json({ ok: false, message: "FIREBASE_SERVICE_ACCOUNT_JSON no configurada." });
  }

  const token = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7).trim()
    : "";
  if (!token) {
    return res.status(401).json({ ok: false, message: "Falta Authorization Bearer." });
  }

  const ctx = await getCreadorFirestoreContext(app, token);
  if (!ctx.ok) {
    return res.status(401).json({ ok: false, message: ctx.message });
  }
  if (ctx.role === POS_CONTADOR_ROLE) {
    return res.status(403).json({ ok: false, message: "Las cuentas de contador no pueden ejecutar migración." });
  }

  const body = (typeof req.body === "object" && req.body !== null ? req.body : {}) as Record<string, unknown>;
  const limiteRaw = typeof body.limite === "number" ? body.limite : Number(body.limite);
  const limite = Math.min(100, Math.max(1, Number.isFinite(limiteRaw) ? Math.trunc(limiteRaw) : 30));
  const soloSinPin = body.soloSinPin !== false;
  const incluirMigracionWms = body.incluirMigracionWms !== false;

  try {
    const db = getFirestore(app);
    let q = db.collection("posClientes").orderBy("createdAt", "desc").limit(limite * 4);
    if (ctx.puntoVenta) {
      q = db
        .collection("posClientes")
        .where("puntoVenta", "==", ctx.puntoVenta)
        .limit(limite * 4);
    }
    const snap = await q.get();
    const items: Item[] = [];
    let count = 0;

    for (const doc of snap.docs) {
      if (count >= limite) break;
      const data = doc.data() as ClientePosFirestoreLike;
      const email = String(data.email ?? "").trim().toLowerCase();
      if (!emailValidoClientePos(email)) continue;
      if (soloSinPin && String(data[CAMPO_PIN_CLUB_MILLAS_POS] ?? "").trim().length === 4) continue;

      count += 1;
      const r = await aplicarBienvenidaClubMillasACliente(doc.ref, data);
      if (!r.ok) {
        items.push({ clienteId: doc.id, ok: false, error: r.error });
        continue;
      }
      items.push({
        clienteId: doc.id,
        ok: true,
        correoEnviado: r.correoEnviado,
        wmsSincronizado: r.wmsSincronizado,
      });
    }

    const exitos = items.filter((i) => i.ok).length;
    const wmsMigracionGlobal = incluirMigracionWms ? await migrarSociosWmsSinPin(Math.min(200, limite * 2)) : null;

    return res.status(200).json({
      ok: true,
      procesados: items.length,
      exitos,
      fallos: items.length - exitos,
      ...(wmsMigracionGlobal ? { wmsMigracionGlobal } : {}),
      items,
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      message: e instanceof Error ? e.message : "Error en migración de bienvenida.",
    });
  }
}
