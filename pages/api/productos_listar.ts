import type { NextApiRequest, NextApiResponse } from "next";
import { getWmsPublicBaseUrl, WMS_VERCEL_URL } from "@/lib/wms-public-base";
import { catalogoApiCacheKey, withCatalogoApiCache } from "@/lib/pos-catalogo-api-cache";

/** Reenvía al WMS con el Bearer del cliente. El WMS debe rechazar o acotar por rol (p. ej. pos_contador sin listados globales). */

/** Ruta canónica del catálogo POS en el WMS (evita respuestas parciales de rutas legacy). */
const CATALOGO_POS_PATH = "/api/pos/productos/listar";

const ENDPOINT_CANDIDATES_LEGACY = [
  "/api/productos_listar",
  "/api/pos/productos_listar",
  "/api/productos/listar",
] as const;

const FETCH_TIMEOUT_LOCAL_MS = 8_000;
const FETCH_TIMEOUT_REMOTE_MS = 12_000;

function mensajeErrorRedCatalogo(code: string, rawMessage: string): string {
  if (code === "ECONNREFUSED" || code === "ENOTFOUND") {
    return "No se pudo conectar con el WMS. Verificá internet o que el servidor WMS esté en marcha.";
  }
  const m = rawMessage.toLowerCase();
  if (
    m.includes("fetch failed") ||
    m.includes("failed to fetch") ||
    m.includes("network") ||
    m.includes("aborted") ||
    m.includes("timeout") ||
    code === "ETIMEDOUT" ||
    code === "UND_ERR_CONNECT_TIMEOUT"
  ) {
    return "No se pudo descargar el catálogo (problema de red o el servidor tardó demasiado). Reintentá en unos segundos.";
  }
  return rawMessage;
}

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
  endpointPath = "/api/pos/productos/listar",
  opts?: { timeoutMs?: number; retries?: number }
): Promise<FetchOutcome> {
  const root = base.replace(/\/$/, "");
  const qs = puntoVenta?.trim() ? `?puntoVenta=${encodeURIComponent(puntoVenta.trim())}` : "";
  const path = endpointPath.startsWith("/") ? endpointPath : `/${endpointPath}`;
  const url = `${root}${path}${qs}`;
  const timeoutMs =
    opts?.timeoutMs ?? (isLocalWmsHost(base) ? FETCH_TIMEOUT_LOCAL_MS : FETCH_TIMEOUT_REMOTE_MS);
  const retries = Math.max(0, opts?.retries ?? 0);

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        headers,
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });
      const data = await response.json().catch(() => ({}));
      return { kind: "ok", response, data };
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      const code = err && "code" in err ? String(err.code) : "";
      const message = e instanceof Error ? e.message : String(e);
      const isLast = attempt >= retries;
      if (!isLast) continue;
      return { kind: "network", code, message };
    }
  }

  return { kind: "network", code: "UNKNOWN", message: "No se pudo cargar el catálogo." };
}

function sendJson(res: NextApiResponse, status: number, body: unknown) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  return res.status(status).json(body);
}

/** Prueba rutas del WMS; en 5xx sigue con la siguiente ruta en lugar de abortar. */
async function fetchCatalogoEnBase(
  base: string,
  headers: HeadersInit,
  puntoVenta?: string,
  opts?: { retries?: number }
): Promise<FetchOutcome> {
  const principal = await fetchCatalogo(base, headers, puntoVenta, CATALOGO_POS_PATH, opts);
  if (principal.kind === "network") return principal;
  if (principal.response.ok) return principal;
  if (principal.response.status !== 404 && principal.response.status < 500) {
    return principal;
  }
  /** WMS local roto (5xx): no usar rutas legacy en el mismo host; pasar al respaldo (Vercel). */
  if (isLocalWmsHost(base) && principal.response.status >= 500) {
    return principal;
  }

  let last: FetchOutcome | null = principal;
  for (const endpointPath of ENDPOINT_CANDIDATES_LEGACY) {
    const r = await fetchCatalogo(base, headers, puntoVenta, endpointPath, opts);
    last = r;
    if (r.kind === "network") return r;
    if (r.response.ok) return r;
    if (r.response.status === 404) continue;
    if (r.response.status >= 500) continue;
    return r;
  }
  return (
    last ?? {
      kind: "network",
      code: "NO_ENDPOINT",
      message: "No se encontraron endpoints de catálogo en WMS.",
    }
  );
}

async function resolverCatalogoDesdeBases(
  bases: string[],
  headers: HeadersInit,
  puntoVenta?: string
): Promise<{ outcome: FetchOutcome; usedFallback: boolean }> {
  // Deduplicar sin usar `[...new Set(...)]` para evitar error de compilación en targets antiguos.
  // Mantenemos el primer valor encontrado (normalizando quitando `/` final).
  const uniqueBases: string[] = [];
  const seenLower: Record<string, true> = {};
  for (const b of bases) {
    const normalized = b.replace(/\/$/, "");
    const lower = normalized.toLowerCase();
    if (seenLower[lower]) continue;
    seenLower[lower] = true;
    uniqueBases.push(normalized);
  }

  for (let i = 0; i < uniqueBases.length; i++) {
    const base = uniqueBases[i]!;
    const usedFallback = i > 0;
    const isRemote = !isLocalWmsHost(base);

    const outcome = await fetchCatalogoEnBase(base, headers, puntoVenta, {
      retries: isRemote ? 1 : 0,
    });
    if (outcome.kind === "ok" && outcome.response.ok) {
      return { outcome, usedFallback };
    }

    const seguir =
      outcome.kind === "network" ||
      (outcome.kind === "ok" &&
        (outcome.response.status >= 500 || outcome.response.status === 404));

    if (seguir && i < uniqueBases.length - 1) continue;
    return { outcome, usedFallback };
  }

  return {
    outcome: {
      kind: "network",
      code: "NO_CATALOG",
      message: "No se pudo cargar el catálogo desde ningún servidor WMS.",
    },
    usedFallback: false,
  };
}

async function fetchCatalogoBody(
  primaryBase: string,
  headers: HeadersInit,
  puntoVenta: string
): Promise<unknown> {
  const fallbackBase = (process.env.WMS_CATALOGO_FALLBACK_URL?.trim() || WMS_VERCEL_URL).replace(
    /\/$/,
    ""
  );

  const bases: string[] = [primaryBase];
  const primaryNorm = primaryBase.replace(/\/$/, "").toLowerCase();
  const skipFallback =
    process.env.POS_CATALOGO_SOLO_ORIGEN === "1" || isLocalWmsHost(primaryBase);
  if (!skipFallback && fallbackBase.toLowerCase() !== primaryNorm) {
    bases.push(fallbackBase);
  }

  const { outcome, usedFallback } = await resolverCatalogoDesdeBases(bases, headers, puntoVenta);

  if (outcome.kind === "network") {
    const msg = mensajeErrorRedCatalogo(outcome.code, outcome.message);
    return { ok: false, message: msg, productos: [] };
  }

  const { response, data } = outcome;

  if (!response.ok) {
    const d = data as { message?: string; error?: string };
    const detalle = d?.message || d?.error || `El servidor de catálogo respondió con error ${response.status}.`;
    const msg = isLocalWmsHost(primaryBase)
      ? `${detalle} Si tenés el WMS local abierto, revisá la consola del WMS.`
      : detalle;
    return {
      ok: false,
      message: msg,
      productos: [],
    };
  }

  return data && typeof data === "object"
    ? {
        ...(data as Record<string, unknown>),
        ...(usedFallback ? { catalogoOrigen: "wms_respaldo" as const } : {}),
      }
    : data;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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

  const cacheKey = catalogoApiCacheKey(puntoVenta, typeof auth === "string" ? auth : undefined);
  const body = await withCatalogoApiCache(cacheKey, () =>
    fetchCatalogoBody(primaryBase, headers, puntoVenta)
  );

  return sendJson(res, 200, body);
}
