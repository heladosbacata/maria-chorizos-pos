/**
 * Ventas cobradas sin respuesta del WMS (red): se guardan para reintentar POST /api/ventas/bulk-guardar.
 */

import { enviarReporteVenta } from "@/lib/enviar-venta";
import type { BulkVentasPayload } from "@/types";

const STORAGE_KEY = "pos_mc_ventas_pendientes_wms_v1";
const MAX = 150;

type Item = { id: string; payload: BulkVentasPayload };

function leer(): Item[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const p = JSON.parse(raw) as unknown;
    if (!Array.isArray(p)) return [];
    return p.filter(
      (x): x is Item =>
        x &&
        typeof x === "object" &&
        typeof (x as Item).id === "string" &&
        (x as Item).payload != null &&
        typeof (x as Item).payload === "object"
    );
  } catch {
    return [];
  }
}

function escribir(lista: Item[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lista));
  } catch {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lista.slice(-Math.floor(MAX / 2))));
    } catch {
      /* ignore */
    }
  }
}

/** Encola el mismo payload que falló por red tras confirmar «solo en este equipo». */
export function encolarVentaPendienteWms(payload: BulkVentasPayload): void {
  if (typeof window === "undefined") return;
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const prev = leer();
  const next = [...prev, { id, payload: JSON.parse(JSON.stringify(payload)) as BulkVentasPayload }];
  escribir(next.length > MAX ? next.slice(next.length - MAX) : next);
}

export function contarVentasPendientesWms(): number {
  return leer().length;
}

let inflight = false;

/** Reintenta enviar al WMS en orden; para ante el primer fallo (sigue en cola). */
export async function procesarColaVentasPendientesWms(): Promise<void> {
  if (typeof window === "undefined" || inflight) return;
  inflight = true;
  try {
    let lista = leer();
    while (lista.length > 0) {
      const [first, ...rest] = lista;
      const r = await enviarReporteVenta(first.payload);
      if (r.estado !== "exito") break;
      lista = rest;
      escribir(lista);
    }
  } finally {
    inflight = false;
  }
}
