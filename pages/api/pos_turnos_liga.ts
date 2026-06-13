import type { NextApiRequest, NextApiResponse } from "next";
import { getWmsLigaPath, getWmsPublicBaseUrl } from "@/lib/wms-public-base";
import { enriquecerRankingLigaConFotos } from "@/lib/liga-turno-fotos-enriquecer";
import { getCreadorFirestoreContext, getFirebaseAdminApp } from "@/lib/firebase-admin-server";

function tokenDesdeReq(req: NextApiRequest): string | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  const t = auth.slice(7).trim();
  return t || null;
}

function extraerRanking(data: unknown): unknown[] {
  if (!data || typeof data !== "object") return [];
  const o = data as Record<string, unknown>;
  const keys = ["ranking", "rankings", "tabla", "posiciones"] as const;
  for (const k of keys) {
    const v = o[k];
    if (Array.isArray(v)) return v;
  }
  return [];
}

/**
 * Proxy GET → WMS `/api/pos/turnos/liga` + enriquecimiento de fotos desde Firestore
 * (`pos_turno_activo` → `posCajerosTurno.ficha.fotoUrl`).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  const token = tokenDesdeReq(req);
  if (!token) {
    return res.status(401).json({ ok: false, message: "Sesión requerida." });
  }

  const base = getWmsPublicBaseUrl().replace(/\/$/, "");
  const ligaPath = getWmsLigaPath();
  const pv = typeof req.query.puntoVenta === "string" ? req.query.puntoVenta.trim() : "";
  const qs = pv ? `?${new URLSearchParams({ puntoVenta: pv }).toString()}` : "";
  const upstream = `${base}${ligaPath}${qs}`;

  try {
    const upstreamRes = await fetch(upstream, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    });

    const data = (await upstreamRes.json().catch(() => ({}))) as Record<string, unknown>;

    if (!upstreamRes.ok) {
      return res.status(upstreamRes.status).json(data);
    }

    const ranking = extraerRanking(data);
    if (ranking.length === 0) {
      return res.status(200).json(data);
    }

    const app = getFirebaseAdminApp();
    if (!app) {
      return res.status(200).json(data);
    }

    const ctx = await getCreadorFirestoreContext(app, token);
    if (!ctx.ok) {
      return res.status(401).json({ ok: false, message: ctx.message });
    }

    try {
      const rankingEnriquecido = await enriquecerRankingLigaConFotos(app, ranking);
      return res.status(200).json({
        ...data,
        ranking: rankingEnriquecido,
      });
    } catch (e) {
      console.error("pos_turnos_liga enrich", e);
      return res.status(200).json(data);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error de red";
    return res.status(503).json({
      ok: false,
      message: `No se pudo consultar la liga en el WMS (${base}).`,
      error: message,
    });
  }
}
