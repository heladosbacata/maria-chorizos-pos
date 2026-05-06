import type { NextApiRequest, NextApiResponse } from "next";
import { getWmsPublicBaseUrl, WMS_VERCEL_URL } from "@/lib/wms-public-base";

/** Reenvía al WMS con el Bearer del cliente. El WMS debe rechazar o acotar por rol (p. ej. pos_contador sin listados globales). */

function isLocalWmsHost(base: string): boolean {
  try {
    const u = new URL(base.includes("://") ? base : `http://${base}`);
    const h = u.hostname.toLowerCase();
    return h === "localhost" || h === "127.0.0.1" || h === "::1";
  } catch {
    return /localhost|127\.0\.0\.1/i.test(base);
  }
}

type FetchOutcome =
  | { kind: "ok"; response: Response; data: unknown }
  | { kind: "network"; code: string; message: string };

async function fetchCatalogo(
  base: string,
  headers: HeadersInit,
  puntoVenta?: string,
  endpointPath = "/api/pos/productos/listar"
): Promise<FetchOutcome> {
  const root = base.replace(/\/$/, "");
  const qs = puntoVenta?.trim() ? `?puntoVenta=${encodeURIComponent(puntoVenta.trim())}` : "";
  const path = endpointPath.startsWith("/") ? endpointPath : `/${endpointPath}`;
  const url = `${root}${path}${qs}`;
  try {
    const response = await fetch(url, { headers });
    const data = await response.json().catch(() => ({}));
    return { kind: "ok", response, data };
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    const code = err && "code" in err ? String(err.code) : "";
    const message = e instanceof Error ? e.message : String(e);
    return { kind: "network", code, message };
  }
}

function sendJson(res: NextApiResponse, status: number, body: unknown) {
  return res.status(status).json(body);
}

async function fetchCatalogoConFallbackPaths(
  base: string,
  headers: HeadersInit,
  puntoVenta?: string
): Promise<FetchOutcome> {
  const endpointCandidates = [
    "/api/pos/productos/listar",
    "/api/productos_listar",
    "/api/pos/productos_listar",
    "/api/productos/listar",
  ];
  let last: FetchOutcome | null = null;
  for (const endpointPath of endpointCandidates) {
    const r = await fetchCatalogo(base, headers, puntoVenta, endpointPath);
    last = r;
    if (r.kind === "network") return r;
    if (r.response.ok) return r;
    if (r.response.status !== 404) return r;
  }
  return last ?? { kind: "network", code: "NO_ENDPOINT", message: "No se encontraron endpoints de catálogo en WMS." };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  const primaryBase = getWmsPublicBaseUrl();
  const headers: HeadersInit = {};
  const auth = req.headers.authorization;
  const puntoVenta =
    typeof req.query.puntoVenta === "string"
      ? req.query.puntoVenta.trim()
      : Array.isArray(req.query.puntoVenta)
        ? String(req.query.puntoVenta[0] ?? "").trim()
        : "";
  if (auth) headers.Authorization = auth;

  const fallbackBase = (
    process.env.WMS_CATALOGO_FALLBACK_URL?.trim() || WMS_VERCEL_URL
  ).replace(/\/$/, "");

  let outcome = await fetchCatalogoConFallbackPaths(primaryBase, headers, puntoVenta);

  if (outcome.kind === "network") {
    const canFallback =
      (outcome.code === "ECONNREFUSED" || outcome.code === "ENOTFOUND") &&
      isLocalWmsHost(primaryBase) &&
      fallbackBase.toLowerCase() !== primaryBase.toLowerCase();
    if (canFallback) {
      outcome = await fetchCatalogoConFallbackPaths(fallbackBase, headers, puntoVenta);
    }
  }

  if (outcome.kind === "network") {
    const msg =
      outcome.code === "ECONNREFUSED" || outcome.code === "ENOTFOUND"
        ? "No se pudo conectar con el WMS principal. Se intentó el respaldo en Vercel; si sigue fallando, revisa red y variables de entorno del WMS."
        : outcome.message;
    return sendJson(res, 200, { ok: false, message: msg, productos: [] });
  }

  let { response, data } = outcome;

  /** WMS local caído o 5xx: intentar catálogo en producción (mismo criterio que red). */
  if (
    !response.ok &&
    response.status >= 500 &&
    isLocalWmsHost(primaryBase) &&
    fallbackBase.toLowerCase() !== primaryBase.toLowerCase()
  ) {
    const fb = await fetchCatalogoConFallbackPaths(fallbackBase, headers, puntoVenta);
    if (fb.kind === "ok" && fb.response.ok) {
      return sendJson(res, 200, fb.data);
    }
  }

  if (!response.ok) {
    const d = data as { message?: string; error?: string };
    const msg =
      d?.message ||
      d?.error ||
      `El servidor de catálogo respondió con error ${response.status}.`;
    /** 200 + ok:false para que el cliente no muestre "Error 500" genérico y siempre reciba JSON. */
    return sendJson(res, 200, {
      ok: false,
      message: msg,
      productos: [],
    });
  }

  return sendJson(res, 200, data);
}
