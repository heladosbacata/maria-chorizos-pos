import type { NextApiRequest, NextApiResponse } from "next";
import { getWmsPublicBaseUrl, WMS_VERCEL_URL } from "@/lib/wms-public-base";

/**
 * Rutas bajo Club de Millas en el WMS (mismo dominio que el catálogo).
 * `WMS_CLUB_VALIDAR_DOCUMENTO_PATH` puede listar varias separadas por coma; la primera que responda 2xx gana.
 * Defecto: `/api/club-de-millas/pos/validar-documento`
 */
function listaPathsValidarDocumento(): string[] {
  const raw = process.env.WMS_CLUB_VALIDAR_DOCUMENTO_PATH?.trim();
  if (raw) {
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((p) => (p.startsWith("/") ? p : `/${p}`));
  }
  return ["/api/club-de-millas/pos/validar-documento"];
}

const QUERY_KEYS = ["documento", "numeroDocumento", "numeroIdentificacion"] as const;

type ConsultaOk = { ok: true; registrado: boolean; message?: string };
type ConsultaErr = { ok: false; message: string };

function wmsHostIsLocalhost(base: string): boolean {
  try {
    const u = new URL(base.includes("://") ? base : `http://${base}`);
    const h = u.hostname.toLowerCase();
    return h === "localhost" || h === "127.0.0.1" || h === "::1";
  } catch {
    return /localhost|127\.0\.0\.1/i.test(base);
  }
}

function normalizarDocumento(raw: string): string {
  return raw.replace(/\s/g, "").replace(/[.\-]/g, "").trim();
}

function normalizarBodyJson(body: unknown): unknown {
  if (typeof body === "string") {
    try {
      return JSON.parse(body) as unknown;
    } catch {
      return body;
    }
  }
  return body;
}

function pickRegistrado(o: Record<string, unknown>): boolean | undefined {
  if (!("registrado" in o)) return undefined;
  if (o.registrado === true) return true;
  if (o.registrado === false) return false;
  return false;
}

/** Solo `registrado === true` cuenta como afiliado (no basta con `ok`). */
function leerRegistradoEstricto(body: unknown): { registrado: boolean; message?: string } {
  const raw = normalizarBodyJson(body);
  const root = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;

  let msg: string | undefined;
  if (root && typeof root.message === "string" && root.message.trim()) msg = root.message.trim();

  const visit = (o: Record<string, unknown> | null): { registrado: boolean; message?: string } | null => {
    if (!o) return null;
    const pr = pickRegistrado(o);
    if (pr === true) return { registrado: true };
    if (pr === false) return { registrado: false, ...(msg ? { message: msg } : {}) };

    for (const key of ["data", "result", "payload"] as const) {
      const inner = o[key];
      if (inner && typeof inner === "object" && !Array.isArray(inner)) {
        const nested = inner as Record<string, unknown>;
        if (typeof nested.message === "string" && nested.message.trim()) msg = nested.message.trim();
        const nr = pickRegistrado(nested);
        if (nr === true) return { registrado: true };
        if (nr === false) return { registrado: false, ...(msg ? { message: msg } : {}) };
      }
    }
    return null;
  };

  const hit = visit(root);
  if (hit) return hit;

  return {
    registrado: false,
    message:
      msg ??
      "El WMS no devolvió registrado: true para este documento. Revisá que el endpoint use el mismo criterio que Mercadeo y el campo booleano «registrado».",
  };
}

async function intentarUnaBase(
  root: string,
  documento: string,
  headers: HeadersInit
): Promise<{ status: number; data: unknown }> {
  const paths = listaPathsValidarDocumento();
  let last: { status: number; data: unknown } = { status: 404, data: {} };

  for (const pathRel of paths) {
    const p = pathRel.startsWith("/") ? pathRel : `/${pathRel}`;

    for (const qk of QUERY_KEYS) {
      try {
        const getUrl = `${root.replace(/\/$/, "")}${p}?${qk}=${encodeURIComponent(documento)}`;
        const resGet = await fetch(getUrl, { method: "GET", headers, cache: "no-store" });
        const dataGet = await resGet.json().catch(() => ({}));
        last = { status: resGet.status, data: dataGet };
        if (resGet.status === 401 || resGet.status === 403) return last;
        if (resGet.status >= 200 && resGet.status < 300) return last;
      } catch {
        last = { status: 0, data: { message: "Error de red (GET)." } };
      }
    }

    try {
      const postUrl = `${root.replace(/\/$/, "")}${p}`;
      const resPost = await fetch(postUrl, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          documento,
          numeroDocumento: documento,
          numeroIdentificacion: documento,
        }),
        cache: "no-store",
      });
      const dataPost = await resPost.json().catch(() => ({}));
      last = { status: resPost.status, data: dataPost };
      if (resPost.status === 401 || resPost.status === 403) return last;
      if (resPost.status >= 200 && resPost.status < 300) return last;
    } catch (e) {
      last = {
        status: 0,
        data: { message: e instanceof Error ? e.message : "Error de red (POST)." },
      };
    }
  }

  return last;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<ConsultaOk | ConsultaErr>) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  const rawDoc =
    req.method === "GET"
      ? typeof req.query.documento === "string"
        ? req.query.documento
        : Array.isArray(req.query.documento)
          ? String(req.query.documento[0] ?? "")
          : ""
      : typeof (req.body as { documento?: unknown })?.documento === "string"
        ? (req.body as { documento: string }).documento
        : "";

  const documento = normalizarDocumento(String(rawDoc ?? ""));
  if (!documento || documento.length < 3) {
    return res.status(400).json({ ok: false, message: "Indica un número de documento válido (mínimo 3 dígitos o caracteres)." });
  }

  const primaryBase = getWmsPublicBaseUrl().replace(/\/$/, "");
  const fallbackBase = (process.env.WMS_CATALOGO_FALLBACK_URL?.trim() || WMS_VERCEL_URL).replace(/\/$/, "");
  const auth = req.headers.authorization;
  const headers: HeadersInit = { Accept: "application/json", ...(auth ? { Authorization: auth } : {}) };

  let { status, data } = await intentarUnaBase(primaryBase, documento, headers);
  if (
    (status === 0 || status === 404 || status >= 500) &&
    wmsHostIsLocalhost(primaryBase) &&
    fallbackBase.toLowerCase() !== primaryBase.toLowerCase()
  ) {
    const second = await intentarUnaBase(fallbackBase, documento, headers);
    if (second.status >= 200 && second.status < 300) {
      status = second.status;
      data = second.data;
    } else if (status === 0 || status === 404) {
      status = second.status;
      data = second.data;
    }
  }

  const pathsLabel = listaPathsValidarDocumento().join(", ");

  if (status === 0) {
    return res.status(200).json({
      ok: false,
      message:
        "No hubo respuesta del WMS al validar el documento. Revisá red y NEXT_PUBLIC_WMS_URL (debe ser el mismo host donde ya funciona el catálogo). Rutas probadas: " +
        pathsLabel +
        ".",
    });
  }

  if (status === 404) {
    return res.status(200).json({
      ok: false,
      message:
        `El WMS respondió 404 en las rutas: ${pathsLabel}. ` +
        "Desplegá en ese mismo dominio el endpoint Club de Millas que usa Mercadeo, o definí WMS_CLUB_VALIDAR_DOCUMENTO_PATH en el POS con la ruta exacta (puede ser una lista separada por comas).",
    });
  }

  if (status < 200 || status >= 300) {
    const d = data as { message?: string; error?: string };
    const msg = d?.message || d?.error || `El WMS respondió HTTP ${status}.`;
    return res.status(200).json({ ok: false, message: msg });
  }

  const { registrado, message } = leerRegistradoEstricto(data);
  return res.status(200).json({
    ok: true,
    registrado,
    ...(registrado ? {} : { message: message ?? "Cliente no registrado en el plan de millas." }),
  });
}
