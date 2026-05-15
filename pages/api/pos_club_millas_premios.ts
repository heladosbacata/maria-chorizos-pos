import type { NextApiRequest, NextApiResponse } from "next";
import { getWmsPublicBaseUrl, WMS_VERCEL_URL, wmsHostIsLocalhost } from "@/lib/wms-public-base";

export type PremioClubMillasApi = {
  id: string;
  titulo: string;
  descripcion: string;
  imagenUrl?: string;
  puntosNecesarios: number;
};

type Ok = { ok: true; premios: PremioClubMillasApi[] };
type Err = { ok: false; message: string };

const PATH = "/api/club-de-millas/premios";

function normalizarPremios(data: unknown): PremioClubMillasApi[] {
  if (!data || typeof data !== "object") return [];
  const root = data as Record<string, unknown>;
  const raw = Array.isArray(root.premios) ? root.premios : [];
  const out: PremioClubMillasApi[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id.trim() : "";
    const titulo = typeof o.titulo === "string" ? o.titulo.trim() : "";
    const descripcion = typeof o.descripcion === "string" ? o.descripcion.trim() : "";
    const puntos =
      typeof o.puntosNecesarios === "number" && Number.isFinite(o.puntosNecesarios)
        ? Math.max(0, Math.trunc(o.puntosNecesarios))
        : NaN;
    if (!id || !titulo || !Number.isFinite(puntos)) continue;
    out.push({
      id,
      titulo,
      descripcion,
      puntosNecesarios: puntos,
      ...(typeof o.imagenUrl === "string" && o.imagenUrl.trim() ? { imagenUrl: o.imagenUrl.trim() } : {}),
    });
  }
  return out.sort((a, b) => a.puntosNecesarios - b.puntosNecesarios);
}

async function fetchPremios(base: string): Promise<{ status: number; data: unknown }> {
  const url = `${base.replace(/\/$/, "")}${PATH}`;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  } catch (e) {
    return { status: 0, data: { message: e instanceof Error ? e.message : "Error de red" } };
  }
}

/** Catálogo público de premios del Club de millas (proxy al WMS). */
export default async function handler(req: NextApiRequest, res: NextApiResponse<Ok | Err>) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  const primary = getWmsPublicBaseUrl();
  const fallback = (process.env.WMS_CATALOGO_FALLBACK_URL?.trim() || WMS_VERCEL_URL).replace(/\/$/, "");

  let { status, data } = await fetchPremios(primary);
  if (
    (status === 0 || status === 404 || status >= 500) &&
    wmsHostIsLocalhost(primary) &&
    fallback.toLowerCase() !== primary.toLowerCase()
  ) {
    const second = await fetchPremios(fallback);
    if (second.status >= 200 && second.status < 300) {
      status = second.status;
      data = second.data;
    }
  }

  if (status < 200 || status >= 300) {
    const d = data as { message?: string };
    return res.status(502).json({
      ok: false,
      message: d?.message?.trim() || `No se pudo cargar el catálogo de premios (HTTP ${status || "red"}).`,
    });
  }

  const premios = normalizarPremios(data);
  return res.status(200).json({ ok: true, premios });
}
