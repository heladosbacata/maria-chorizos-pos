import type { NextApiRequest, NextApiResponse } from "next";
import { getWmsPublicBaseUrl, WMS_VERCEL_URL } from "@/lib/wms-public-base";

/**
 * Misma ruta que Mercadeo / WMS Club de Millas (no inferir desde otras colecciones en el POS).
 * Override opcional si el WMS expone otra ruta equivalente (debe empezar con /).
 */
const VALIDAR_DOCUMENTO_PATH =
  process.env.WMS_CLUB_VALIDAR_DOCUMENTO_PATH?.trim() || "/api/club-de-millas/pos/validar-documento";

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

/** Solo `registrado === true` cuenta como afiliado (no basta con `ok`). */
function leerRegistradoEstricto(body: unknown): { registrado: boolean; message?: string } {
  const root = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  const pick = (o: Record<string, unknown>): boolean | undefined => {
    if (!("registrado" in o)) return undefined;
    if (o.registrado === true) return true;
    if (o.registrado === false) return false;
    return false;
  };

  let msg: string | undefined;
  if (root && typeof root.message === "string" && root.message.trim()) msg = root.message.trim();

  if (root) {
    const direct = pick(root);
    if (direct === true) return { registrado: true };
    if (direct === false) return { registrado: false, ...(msg ? { message: msg } : {}) };

    const data = root.data;
    if (data && typeof data === "object" && !Array.isArray(data)) {
      const nested = data as Record<string, unknown>;
      const n = pick(nested);
      if (typeof nested.message === "string" && nested.message.trim()) msg = nested.message.trim();
      if (n === true) return { registrado: true };
      if (n === false) return { registrado: false, ...(msg ? { message: msg } : {}) };
    }
  }

  return {
    registrado: false,
    message:
      msg ??
      "El WMS no devolvió registrado: true para este documento. Verificá que el despliegue use /api/club-de-millas/pos/validar-documento y el mismo dominio que el catálogo POS.",
  };
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

  const path = VALIDAR_DOCUMENTO_PATH.startsWith("/") ? VALIDAR_DOCUMENTO_PATH : `/${VALIDAR_DOCUMENTO_PATH}`;

  async function llamarValidarEnBase(base: string): Promise<{ status: number; data: unknown }> {
    const root = base.replace(/\/$/, "");
    const getUrl = `${root}${path}?documento=${encodeURIComponent(documento)}`;

    try {
      const resGet = await fetch(getUrl, { method: "GET", headers, cache: "no-store" });
      const dataGet = await resGet.json().catch(() => ({}));
      if (resGet.status >= 200 && resGet.status < 300) {
        return { status: resGet.status, data: dataGet };
      }
      if (resGet.status === 401 || resGet.status === 403) {
        return { status: resGet.status, data: dataGet };
      }
    } catch {
      /* seguir con POST */
    }

    try {
      const resPost = await fetch(`${root}${path}`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ documento }),
        cache: "no-store",
      });
      const dataPost = await resPost.json().catch(() => ({}));
      return { status: resPost.status, data: dataPost };
    } catch (e) {
      return {
        status: 0,
        data: { message: e instanceof Error ? e.message : "Error de red hacia el WMS." },
      };
    }
  }

  let { status, data } = await llamarValidarEnBase(primaryBase);
  if (
    (status === 0 || status === 404 || status >= 500) &&
    wmsHostIsLocalhost(primaryBase) &&
    fallbackBase.toLowerCase() !== primaryBase.toLowerCase()
  ) {
    const second = await llamarValidarEnBase(fallbackBase);
    if (second.status >= 200 && second.status < 500 && second.status !== 404) {
      status = second.status;
      data = second.data;
    } else if (status === 0 || status === 404) {
      status = second.status;
      data = second.data;
    }
  }

  if (status === 0) {
    return res.status(200).json({
      ok: false,
      message:
        "No hubo respuesta del WMS al validar el documento. Revisá red, NEXT_PUBLIC_WMS_URL (mismo dominio que el catálogo) y que exista GET o POST " +
        path +
        ".",
    });
  }

  if (status === 404) {
    return res.status(200).json({
      ok: false,
      message:
        `El WMS respondió 404 en ${path}. Desplegá el WMS con la ruta Club de Millas o revisá que la URL base sea la de producción (no localhost si el catálogo es prod).`,
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
