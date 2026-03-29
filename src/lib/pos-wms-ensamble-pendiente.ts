/**
 * Cobros donde falló POST inventario ensamble (red / 5xx): reintento con el mismo idVenta (idempotencia en WMS).
 */

import { aplicarVentaEnsambleWms, type WmsAplicarVentaEnsambleBody } from "@/lib/wms-aplicar-venta-ensamble";

const STORAGE_KEY = "pos_mc_wms_ensamble_pendiente_v1";
const MAX = 80;

type Item = { id: string; body: WmsAplicarVentaEnsambleBody };

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
        (x as Item).body != null &&
        typeof (x as Item).body === "object" &&
        Array.isArray((x as Item).body.lineas)
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

export function encolarAplicarEnsamblePendiente(body: WmsAplicarVentaEnsambleBody): void {
  if (typeof window === "undefined" || !body.lineas.length) return;
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const prev = leer();
  const copy: WmsAplicarVentaEnsambleBody = JSON.parse(JSON.stringify(body));
  const next = [...prev, { id, body: copy }];
  escribir(next.length > MAX ? next.slice(next.length - MAX) : next);
}

export function contarEnsamblePendiente(): number {
  return leer().length;
}

let inflight = false;

/** Procesa la cola en orden; detiene ante fallo no recuperable o sin token. */
export async function procesarColaAplicarEnsamblePendiente(
  getIdToken: () => Promise<string | null>
): Promise<void> {
  if (typeof window === "undefined" || inflight) return;
  inflight = true;
  try {
    let lista = leer();
    while (lista.length > 0) {
      const token = await getIdToken();
      if (!token) break;
      const [first, ...rest] = lista;
      const r = await aplicarVentaEnsambleWms(token, first.body);
      if (r.ok) {
        lista = rest;
        escribir(lista);
        continue;
      }
      if (r.status === 401 || r.status === 403 || r.status === 404) {
        break;
      }
      if (r.status >= 500 || r.status === 0) {
        break;
      }
      lista = rest;
      escribir(lista);
    }
  } finally {
    inflight = false;
  }
}
