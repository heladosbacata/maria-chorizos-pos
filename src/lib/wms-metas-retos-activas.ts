import { getWmsPublicBaseUrl } from "@/lib/wms-public-base";

export type CadenciaReto = "diario" | "semanal" | "mensual";
export type AlcancePuntoVentaReto = "todos" | "seleccion";

export interface MetaRetoActiva {
  id: string;
  skuBarcode: string;
  descripcionProducto: string;
  urlImagen: string | null;
  metaUnidades: number;
  bonoCOP: number;
  cadencia: CadenciaReto;
  fechaInicio: string;
  fechaFin: string;
  alcancePuntoVenta: AlcancePuntoVentaReto;
  notas: string;
}

export interface MetasRetosActivasPayload {
  ok: true;
  fechaReferencia?: string;
  retos: MetaRetoActiva[];
}

function stripTrailingSlash(s: string): string {
  return s.replace(/\/$/, "");
}

/** URL GET activas; con PV filtra según lógica del WMS; sin PV solo retos de alcance «todos». */
export function buildMetasRetosActivasUrl(puntoVenta: string | null | undefined): string {
  const base = stripTrailingSlash(getWmsPublicBaseUrl());
  const path = "/api/pos/metas-retos/activas";
  const pv = (puntoVenta ?? "").replace(/\u00a0/g, " ").trim();
  if (!pv) return `${base}${path}`;
  return `${base}${path}?${new URLSearchParams({ puntoVenta: pv }).toString()}`;
}

function parseCadencia(v: unknown): CadenciaReto {
  const s = String(v ?? "").toLowerCase();
  if (s === "semanal" || s === "mensual") return s;
  return "diario";
}

function normalizeReto(raw: unknown): MetaRetoActiva | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = String(r.id ?? "").trim();
  if (!id) return null;
  const metaU = Number(r.metaUnidades);
  const bono = Number(r.bonoCOP);
  const urlRaw = r.urlImagen;
  return {
    id,
    skuBarcode: String(r.skuBarcode ?? "").trim(),
    descripcionProducto: String(r.descripcionProducto ?? "").trim(),
    urlImagen:
      urlRaw == null || urlRaw === ""
        ? null
        : typeof urlRaw === "string"
          ? urlRaw.trim() || null
          : null,
    metaUnidades: Number.isFinite(metaU) && metaU >= 0 ? metaU : 0,
    bonoCOP: Number.isFinite(bono) && bono >= 0 ? bono : 0,
    cadencia: parseCadencia(r.cadencia),
    fechaInicio: String(r.fechaInicio ?? "").trim(),
    fechaFin: String(r.fechaFin ?? "").trim(),
    alcancePuntoVenta: r.alcancePuntoVenta === "seleccion" ? "seleccion" : "todos",
    notas: String(r.notas ?? "").trim(),
  };
}

export type FetchMetasRetosActivasResult =
  | { ok: true; data: MetasRetosActivasPayload }
  | { ok: false; message: string };

/**
 * GET público del WMS (CORS). Sin Bearer. Sin caché del navegador.
 */
export async function fetchMetasRetosActivas(
  puntoVenta: string | null | undefined,
  signal?: AbortSignal
): Promise<FetchMetasRetosActivasResult> {
  const url = buildMetasRetosActivasUrl(puntoVenta);
  try {
    const res = await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal,
      headers: { Accept: "application/json" },
    });
    const text = await res.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      return { ok: false, message: "El WMS devolvió una respuesta que no se pudo leer como JSON." };
    }
    const obj = json as Record<string, unknown>;

    if (obj.ok === false) {
      const msg =
        (typeof obj.message === "string" && obj.message) ||
        (typeof obj.error === "string" && obj.error) ||
        `El WMS indicó un error${res.status ? ` (${res.status})` : ""}.`;
      return { ok: false, message: msg };
    }

    if (!res.ok) {
      return {
        ok: false,
        message: `Error ${res.status} al consultar metas activas en el WMS.`,
      };
    }

    const rawList = obj.retos;
    const retos: MetaRetoActiva[] = Array.isArray(rawList)
      ? (rawList.map(normalizeReto).filter(Boolean) as MetaRetoActiva[])
      : [];

    return {
      ok: true,
      data: {
        ok: true,
        fechaReferencia: typeof obj.fechaReferencia === "string" ? obj.fechaReferencia : undefined,
        retos,
      },
    };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    return {
      ok: false,
      message:
        "No se pudo conectar con el WMS (red, CORS o URL). Revisá NEXT_PUBLIC_WMS_URL y que el origen del POS esté permitido en el WMS.",
    };
  }
}
