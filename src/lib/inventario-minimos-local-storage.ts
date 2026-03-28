/**
 * Mínimos sugeridos editados en Inventarios: solo en este navegador, por usuario Firebase y punto de venta.
 */

import { normSkuInventario } from "@/lib/inventario-pos-firestore";

const PREFIX = "pos-inv-minimos-v1";

function storageKey(uid: string, puntoVenta: string): string {
  const u = uid.trim();
  const pv = puntoVenta.trim().replace(/\//g, "|");
  return `${PREFIX}:${u}:${pv}`;
}

function parseRecord(raw: string | null): Record<string, number> {
  if (!raw) return {};
  try {
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== "object") return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      const nk = normSkuInventario(k);
      if (!nk) continue;
      const n = typeof v === "number" ? v : Number(v);
      if (Number.isFinite(n) && n >= 0) out[nk] = Math.round(n * 1000) / 1000;
    }
    return out;
  } catch {
    return {};
  }
}

export function leerMinimosInventarioLocal(uid: string, puntoVenta: string): Map<string, number> {
  if (typeof window === "undefined") return new Map();
  const u = uid.trim();
  const pv = puntoVenta.trim();
  if (!u || !pv) return new Map();
  try {
    const rec = parseRecord(localStorage.getItem(storageKey(u, pv)));
    return new Map(Object.entries(rec));
  } catch {
    return new Map();
  }
}

/**
 * Guarda o borra el mínimo para un SKU (usa clave normalizada).
 * @returns false si localStorage no está disponible o falla.
 */
export function escribirMinimoInventarioLocal(
  uid: string,
  puntoVenta: string,
  insumoSku: string,
  minimo: number | null
): boolean {
  if (typeof window === "undefined") return false;
  const u = uid.trim();
  const pv = puntoVenta.trim();
  const k = normSkuInventario(insumoSku);
  if (!u || !pv || !k) return false;
  try {
    const key = storageKey(u, pv);
    const rec = parseRecord(localStorage.getItem(key));
    if (minimo == null) delete rec[k];
    else rec[k] = Math.round(minimo * 1000) / 1000;
    if (Object.keys(rec).length === 0) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(rec));
    return true;
  } catch {
    return false;
  }
}
