/**
 * Notificaciones al franquiciado cuando administración (WMS) responde una calificación ≤3.
 */

import {
  listarRespuestasWmsPublicadas,
  type IndiceSatisfaccionMes,
  type RespuestaWmsPublicada,
} from "@/lib/indice-satisfaccion-franquiciado";
import { cargarIndiceSatisfaccionAnioConSync } from "@/lib/pos-indice-satisfaccion-cloud";
import { emitirIndiceSatisfaccionRespuestasCambio } from "@/lib/pos-indice-satisfaccion-event";

const VISTO_PREFIX = "pos_mc_indice_satisf_resp_visto_v1:";

type VistoRespuestasMap = Record<string, string>;

function vistoKey(pv: string): string {
  return `${VISTO_PREFIX}${pv.trim()}`;
}

function claveAreaYm(ym: string, areaId: string): string {
  return `${ym.trim()}__${areaId.trim()}`;
}

export function leerRespuestasWmsVistas(pv: string): VistoRespuestasMap {
  if (typeof window === "undefined" || !pv.trim()) return {};
  try {
    const raw = localStorage.getItem(vistoKey(pv));
    if (!raw) return {};
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== "object") return {};
    const out: VistoRespuestasMap = {};
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (typeof k === "string" && typeof v === "string" && v.trim()) out[k] = v.trim();
    }
    return out;
  } catch {
    return {};
  }
}

function escribirRespuestasWmsVistas(pv: string, map: VistoRespuestasMap): void {
  if (typeof window === "undefined" || !pv.trim()) return;
  try {
    localStorage.setItem(vistoKey(pv), JSON.stringify(map));
  } catch {
    /* quota */
  }
}

export function esRespuestaWmsNoVista(pv: string, item: RespuestaWmsPublicada): boolean {
  if (!item.respondidoAt) return true;
  const visto = leerRespuestasWmsVistas(pv);
  const key = claveAreaYm(item.ym, item.areaId);
  const seenAt = visto[key];
  if (!seenAt) return true;
  return item.respondidoAt > seenAt;
}

export function listarRespuestasWmsNoVistas(
  pv: string,
  registros: IndiceSatisfaccionMes[]
): RespuestaWmsPublicada[] {
  const out: RespuestaWmsPublicada[] = [];
  for (const reg of registros) {
    for (const item of listarRespuestasWmsPublicadas(reg)) {
      if (esRespuestaWmsNoVista(pv, item)) out.push(item);
    }
  }
  out.sort((a, b) => (b.respondidoAt ?? "").localeCompare(a.respondidoAt ?? ""));
  return out;
}

export function contarRespuestasWmsNoVistas(pv: string, registros: IndiceSatisfaccionMes[]): number {
  return listarRespuestasWmsNoVistas(pv, registros).length;
}

export function marcarRespuestaWmsVista(pv: string, item: RespuestaWmsPublicada): void {
  if (!pv.trim() || !item.respondidoAt) return;
  const map = leerRespuestasWmsVistas(pv);
  map[claveAreaYm(item.ym, item.areaId)] = item.respondidoAt;
  escribirRespuestasWmsVistas(pv, map);
}

export function marcarRespuestasWmsVistas(pv: string, items: RespuestaWmsPublicada[]): void {
  if (!pv.trim() || !items.length) return;
  const map = leerRespuestasWmsVistas(pv);
  for (const item of items) {
    if (item.respondidoAt) {
      map[claveAreaYm(item.ym, item.areaId)] = item.respondidoAt;
    }
  }
  escribirRespuestasWmsVistas(pv, map);
}

/** Sincroniza año(s) con nube, fusiona respuestas WMS y cuenta las no vistas. */
export async function sincronizarYContarRespuestasWmsNuevas(opts: {
  token: string | null;
  puntoVenta: string;
  anios?: number[];
  emitirEvento?: boolean;
}): Promise<{ count: number; items: RespuestaWmsPublicada[] }> {
  const pv = opts.puntoVenta.trim();
  if (!pv) return { count: 0, items: [] };

  const anioActual = new Date().getFullYear();
  const anios = opts.anios ?? [anioActual, anioActual - 1];
  const registros: IndiceSatisfaccionMes[] = [];

  for (const anio of anios) {
    const r = await cargarIndiceSatisfaccionAnioConSync({
      token: opts.token,
      puntoVenta: pv,
      anio,
    });
    for (const reg of Object.values(r.porYm)) {
      if (reg.guardadoAt) registros.push(reg);
    }
  }

  const items = listarRespuestasWmsNoVistas(pv, registros);
  if (opts.emitirEvento !== false && typeof window !== "undefined") {
    emitirIndiceSatisfaccionRespuestasCambio({ puntoVenta: pv, count: items.length });
  }
  return { count: items.length, items };
}
