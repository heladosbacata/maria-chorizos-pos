import type { NextApiRequest, NextApiResponse } from "next";
import { getWmsPublicBaseUrl, WMS_VERCEL_URL } from "@/lib/wms-public-base";

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

/** Interpreta JSON del WMS: contrato flexible para «plan de millas» / fidelización. */
function interpretarConsultaFidelizacion(
  status: number,
  body: unknown
): { kind: "registrado" } | { kind: "no_registrado" } | { kind: "indeterminado"; message: string } {
  const d =
    body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const nested =
    d.result && typeof d.result === "object" && !Array.isArray(d.result)
      ? (d.result as Record<string, unknown>)
      : null;

  const registradoTrue = (o: Record<string, unknown>) =>
    o.registrado === true || o.existe === true || o.encontrado === true || o.encontradoEnPlan === true;
  const registradoFalse = (o: Record<string, unknown>) =>
    o.registrado === false || o.existe === false || o.encontrado === false;

  const merge = { ...d, ...(nested ?? {}) };

  if (status === 200) {
    if (registradoTrue(merge)) return { kind: "registrado" };
    if (registradoFalse(merge)) return { kind: "no_registrado" };
    const data = merge.data;
    if (data != null && typeof data === "object" && !Array.isArray(data) && Object.keys(data as object).length > 0) {
      return { kind: "registrado" };
    }
    const cliente = merge.cliente;
    if (cliente && typeof cliente === "object" && !Array.isArray(cliente) && Object.keys(cliente as object).length > 0) {
      return { kind: "registrado" };
    }
    if (merge.ok === true && merge.cliente === null) return { kind: "no_registrado" };
    if (Array.isArray(merge.resultados) && merge.resultados.length > 0) return { kind: "registrado" };
    if (merge.ok === false && typeof merge.message === "string" && /no\s*(se\s*)?encontr|not\s*found|inexistente/i.test(merge.message)) {
      return { kind: "no_registrado" };
    }
  }
  if (status === 404) return { kind: "no_registrado" };
  const msg =
    typeof d.message === "string" && d.message.trim()
      ? d.message.trim()
      : typeof d.error === "string" && d.error.trim()
        ? d.error.trim()
        : `Respuesta del WMS no reconocida (HTTP ${status}).`;
  return { kind: "indeterminado", message: msg };
}

async function fetchWmsJson(
  url: string,
  headers: HeadersInit,
  init?: RequestInit
): Promise<{ status: number; data: unknown }> {
  const res = await fetch(url, { ...init, headers });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
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
  const auth = req.headers.authorization;
  const headers: HeadersInit = { Accept: "application/json" };
  if (auth) headers.Authorization = auth;

  const customPath = process.env.WMS_FIDELIZACION_CONSULTA_PATH?.trim();
  const pathCandidates = customPath
    ? [customPath.startsWith("/") ? customPath : `/${customPath}`]
    : [
        "/api/pos/fidelizacion/cliente",
        "/api/pos/plan-mill/cliente",
        "/api/pos/fidelizacion/consulta-documento",
      ];

  const paramNames = ["documento", "numeroDocumento", "numeroIdentificacion"] as const;
  const fallbackBase = (process.env.WMS_CATALOGO_FALLBACK_URL?.trim() || WMS_VERCEL_URL).replace(/\/$/, "");

  async function intentarEnBase(base: string): Promise<{ kind: "ok"; registrado: boolean } | { kind: "fail" }> {
    const root = base.replace(/\/$/, "");
    for (const path of pathCandidates) {
      const p = path.startsWith("/") ? path : `/${path}`;
      for (const param of paramNames) {
        const qs = `${param}=${encodeURIComponent(documento)}`;
        const getUrl = `${root}${p}?${qs}`;
        try {
          const { status, data } = await fetchWmsJson(getUrl, headers);
          const inter = interpretarConsultaFidelizacion(status, data);
          if (inter.kind === "registrado") return { kind: "ok", registrado: true };
          if (inter.kind === "no_registrado") return { kind: "ok", registrado: false };
          if (status === 404 || status >= 500) continue;
        } catch {
          /* intentar POST */
        }
        try {
          const postUrl = `${root}${p}`;
          const { status, data } = await fetchWmsJson(postUrl, { ...headers, "Content-Type": "application/json" }, {
            method: "POST",
            body: JSON.stringify({ documento, numeroDocumento: documento, numeroIdentificacion: documento }),
          });
          const inter = interpretarConsultaFidelizacion(status, data);
          if (inter.kind === "registrado") return { kind: "ok", registrado: true };
          if (inter.kind === "no_registrado") return { kind: "ok", registrado: false };
        } catch {
          /* siguiente combinación */
        }
      }
    }
    return { kind: "fail" };
  }

  let outcome = await intentarEnBase(primaryBase);
  if (outcome.kind === "fail" && wmsHostIsLocalhost(primaryBase) && fallbackBase.toLowerCase() !== primaryBase.toLowerCase()) {
    outcome = await intentarEnBase(fallbackBase);
  }

  if (outcome.kind === "ok") {
    return res.status(200).json({
      ok: true,
      registrado: outcome.registrado,
      ...(outcome.registrado ? {} : { message: "Cliente no registrado en el plan de millas." }),
    });
  }

  return res.status(200).json({
    ok: false,
    message:
      "No se pudo validar el documento contra el WMS (no hay respuesta clara o el endpoint no está configurado). " +
      "Definí en el servidor la variable WMS_FIDELIZACION_CONSULTA_PATH con la ruta exacta del WMS " +
      "(por ejemplo /api/pos/fidelizacion/cliente) que consulte el plan de millas por documento.",
  });
}
