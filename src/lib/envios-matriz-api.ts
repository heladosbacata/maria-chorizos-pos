import {
  mockDetalle,
  mockListadoHistorial,
  mockListadoPendiente,
  mockRecepcion,
} from "@/lib/envios-matriz-mock";
import type {
  EnvioMatrizDetalleData,
  EnvioMatrizDetalleResponse,
  EnvioMatrizListItem,
  EnvioMatrizListadoResponse,
  LineaEnvioMatriz,
  RecepcionMatrizPayload,
} from "@/types/envios-matriz";

const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK_ENVIOS === "true";

export function mismoPuntoVenta(a: string | undefined | null, b: string | undefined | null): boolean {
  return (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
}

function esPendienteRecepcion(estado: string | undefined): boolean {
  if (!estado) return true;
  const u = estado.trim().toUpperCase();
  return u === "PENDIENTE_RECEPCION" || u === "PENDIENTE";
}

export function filtrarEnviosPorPuntoVenta(
  items: EnvioMatrizListItem[] | undefined,
  puntoVentaPos: string
): EnvioMatrizListItem[] {
  if (!items?.length) return [];
  if (USE_MOCK) return items;
  return items.filter((i) => mismoPuntoVenta(i.puntoVentaDestino, puntoVentaPos));
}

/** Cuenta pendientes para el PV del cajero: filtra por destino y estado pendiente de recepción. */
export function contarPendientesParaPos(
  res: EnvioMatrizListadoResponse,
  puntoVentaPos: string
): number {
  return filtrarEnviosPorPuntoVenta(res.data, puntoVentaPos).filter((i) => esPendienteRecepcion(i.estado)).length;
}

/** Mensaje en español según HTTP o cuerpo del WMS. */
export function mensajeErrorEnviosMatriz(status: number, body: unknown): string {
  if (status === 401) {
    return "Sesión expirada o no válida. Cierra sesión y vuelve a ingresar.";
  }
  if (status === 403) {
    return "No tienes permiso para ver o confirmar envíos en este punto de venta. Verifica que tu cuenta POS tenga el punto de venta correcto.";
  }
  if (status === 409) {
    const msg =
      body && typeof body === "object" && "message" in body && typeof (body as { message: unknown }).message === "string"
        ? (body as { message: string }).message
        : "";
    return msg.trim()
      ? msg
      : "El envío ya fue recibido o no se puede confirmar en este estado. Actualiza la lista e inténtalo de nuevo.";
  }
  if (status === 503 || status === 502) {
    return "No se pudo conectar con el servidor de inventario (WMS). Revisa la red o inténtalo más tarde.";
  }
  const msg =
    body && typeof body === "object" && "message" in body && typeof (body as { message: unknown }).message === "string"
      ? (body as { message: string }).message
      : "";
  if (msg.trim()) return msg;
  return `Error al comunicarse con el WMS (${status}).`;
}

function parseLineas(raw: unknown): LineaEnvioMatriz[] {
  if (!Array.isArray(raw)) return [];
  const out: LineaEnvioMatriz[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const sku = typeof o.sku === "string" ? o.sku : String(o.sku ?? "");
    const descripcion =
      typeof o.descripcion === "string"
        ? o.descripcion
        : typeof o.descripcionProducto === "string"
          ? o.descripcionProducto
          : "";
    let cant = 0;
    if (typeof o.cantidadDespachada === "number" && Number.isFinite(o.cantidadDespachada)) {
      cant = o.cantidadDespachada;
    } else if (typeof o.cantidad === "number" && Number.isFinite(o.cantidad)) {
      cant = o.cantidad;
    }
    if (!sku.trim()) continue;
    out.push({ sku: sku.trim(), descripcion: descripcion || sku, cantidadDespachada: cant });
  }
  return out;
}

function listItemFromUnknown(o: Record<string, unknown>): EnvioMatrizListItem {
  const id = typeof o.id === "string" ? o.id : String(o.id ?? "");
  return {
    id,
    estado: typeof o.estado === "string" ? o.estado : undefined,
    idDespacho:
      typeof o.idDespacho === "string"
        ? o.idDespacho
        : typeof o.id_despacho === "string"
          ? o.id_despacho
          : undefined,
    puntoVentaDestino:
      typeof o.puntoVentaDestino === "string"
        ? o.puntoVentaDestino
        : typeof o.puntoVenta === "string"
          ? o.puntoVenta
          : typeof o.destino === "string"
            ? o.destino
            : undefined,
    fechaDespacho: typeof o.fechaDespacho === "string" ? o.fechaDespacho : undefined,
    fechaCreacion: typeof o.fechaCreacion === "string" ? o.fechaCreacion : undefined,
    comentario: typeof o.comentario === "string" ? o.comentario : undefined,
    lineas: parseLineas(o.lineas),
    raw: o,
  };
}

function normalizarListado(json: unknown): EnvioMatrizListadoResponse {
  if (!json || typeof json !== "object") return { ok: false, message: "Respuesta inválida.", data: [] };
  const j = json as Record<string, unknown>;
  const ok = j.ok === true;
  const dataRaw = j.data;
  const data: EnvioMatrizListItem[] = Array.isArray(dataRaw)
    ? dataRaw
        .filter((x): x is Record<string, unknown> => x != null && typeof x === "object")
        .map((x) => listItemFromUnknown(x))
    : [];
  const pendientes = typeof j.pendientes === "number" ? j.pendientes : undefined;
  const puntoVenta = typeof j.puntoVenta === "string" ? j.puntoVenta : undefined;
  const message = typeof j.message === "string" ? j.message : undefined;
  return { ok, data, pendientes, puntoVenta, message };
}

function detalleFromUnknown(o: Record<string, unknown>, fallbackId: string): EnvioMatrizDetalleData {
  const id = typeof o.id === "string" ? o.id : fallbackId;
  return {
    id,
    estado: typeof o.estado === "string" ? o.estado : undefined,
    idDespacho:
      typeof o.idDespacho === "string"
        ? o.idDespacho
        : typeof o.id_despacho === "string"
          ? o.id_despacho
          : undefined,
    puntoVentaDestino:
      typeof o.puntoVentaDestino === "string"
        ? o.puntoVentaDestino
        : typeof o.puntoVenta === "string"
          ? o.puntoVenta
          : undefined,
    fechaDespacho: typeof o.fechaDespacho === "string" ? o.fechaDespacho : undefined,
    lineas: parseLineas(o.lineas),
    raw: o,
  };
}

function normalizarDetalle(json: unknown, id: string): EnvioMatrizDetalleResponse {
  if (!json || typeof json !== "object") return { ok: false, message: "Respuesta inválida." };
  const j = json as Record<string, unknown>;
  const ok = j.ok === true;
  const message = typeof j.message === "string" ? j.message : undefined;
  const d = j.data;
  if (!d || typeof d !== "object") return { ok, message, data: undefined };
  return { ok, message, data: detalleFromUnknown(d as Record<string, unknown>, id) };
}

async function fetchJson(
  url: string,
  init: RequestInit,
  token: string | null
): Promise<{ status: number; json: unknown }> {
  const headers: HeadersInit = {
    ...((init.headers as Record<string, string>) ?? {}),
  };
  if (token) (headers as Record<string, string>).Authorization = `Bearer ${token}`;
  const res = await fetch(url, { ...init, headers });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

export async function enviosMatrizListar(
  token: string | null,
  params: { estado: string; limite?: number }
): Promise<{ ok: boolean; status: number; data: EnvioMatrizListadoResponse }> {
  if (USE_MOCK) {
    const estado = params.estado;
    const raw =
      estado === "pendiente" ? mockListadoPendiente() : mockListadoHistorial(estado === "todos" ? "todos" : estado);
    return { ok: raw.ok, status: 200, data: raw };
  }
  const limite = params.limite ?? 50;
  const q = new URLSearchParams({ estado: params.estado, limite: String(limite) });
  const { status, json } = await fetchJson(`/api/pos_envios_matriz?${q}`, { method: "GET" }, token);
  const data = normalizarListado(json);
  if (status >= 400) data.ok = false;
  return { ok: data.ok && status < 400, status, data };
}

export async function enviosMatrizDetalle(
  token: string | null,
  id: string
): Promise<{ ok: boolean; status: number; data: EnvioMatrizDetalleResponse }> {
  if (USE_MOCK) {
    const raw = mockDetalle(id);
    return { ok: raw.ok, status: raw.ok ? 200 : 404, data: raw };
  }
  const { status, json } = await fetchJson(
    `/api/pos_envios_matriz_detalle/${encodeURIComponent(id)}`,
    { method: "GET" },
    token
  );
  const data = normalizarDetalle(json, id);
  if (status >= 400) data.ok = false;
  return { ok: data.ok && status < 400, status, data };
}

export async function enviosMatrizRecepcion(
  token: string | null,
  id: string,
  payload: RecepcionMatrizPayload
): Promise<{ ok: boolean; status: number; message?: string; json: unknown }> {
  if (USE_MOCK) {
    const r = await mockRecepcion();
    return { ok: r.ok, status: r.ok ? 200 : 400, message: r.message, json: r };
  }
  const { status, json } = await fetchJson(
    `/api/pos_envios_matriz_recepcion/${encodeURIComponent(id)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    token
  );
  const message =
    json && typeof json === "object" && "message" in json && typeof (json as { message: unknown }).message === "string"
      ? (json as { message: string }).message
      : undefined;
  const ok =
    status < 400 &&
    (json && typeof json === "object" && "ok" in json ? (json as { ok: boolean }).ok !== false : true);
  return { ok, status, message, json };
}

export async function contarEnviosPendientesPos(puntoVentaPos: string, token: string | null): Promise<number> {
  const r = await enviosMatrizListar(token, { estado: "pendiente", limite: 50 });
  if (!r.ok) return 0;
  return contarPendientesParaPos(r.data, puntoVentaPos);
}
