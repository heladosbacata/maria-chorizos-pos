/**
 * Gastos mensuales declarados por el franquiciado para el PyG simplificado (localStorage).
 * Clave: punto de venta + YYYY-MM. No sustituye contabilidad formal.
 */

export interface PygGastosMensuales {
  arriendo: number;
  personal: number;
  servicios: number;
  otros: number;
}

const STORAGE_PREFIX = "pos_mc_pyg_gastos_v1:";

export const PYG_GASTOS_VACIOS: PygGastosMensuales = {
  arriendo: 0,
  personal: 0,
  servicios: 0,
  otros: 0,
};

function key(pv: string, ym: string): string {
  return `${STORAGE_PREFIX}${pv.trim()}\x1f${ym.trim()}`;
}

function clampNum(n: unknown): number {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x) || x < 0) return 0;
  return Math.round(x * 100) / 100;
}

export function normalizarGastos(raw: unknown): PygGastosMensuales {
  if (!raw || typeof raw !== "object") return { ...PYG_GASTOS_VACIOS };
  const o = raw as Record<string, unknown>;
  return {
    arriendo: clampNum(o.arriendo),
    personal: clampNum(o.personal),
    servicios: clampNum(o.servicios),
    otros: clampNum(o.otros),
  };
}

export function leerGastosPyg(pv: string, ym: string): PygGastosMensuales {
  if (typeof window === "undefined" || !pv.trim() || !ym.trim()) return { ...PYG_GASTOS_VACIOS };
  try {
    const raw = localStorage.getItem(key(pv, ym));
    if (!raw) return { ...PYG_GASTOS_VACIOS };
    return normalizarGastos(JSON.parse(raw) as unknown);
  } catch {
    return { ...PYG_GASTOS_VACIOS };
  }
}

export function guardarGastosPyg(pv: string, ym: string, gastos: PygGastosMensuales): void {
  if (typeof window === "undefined" || !pv.trim() || !ym.trim()) return;
  try {
    const norm = normalizarGastos(gastos);
    localStorage.setItem(key(pv, ym), JSON.stringify(norm));
  } catch {
    /* quota / privado */
  }
}

export function totalGastos(g: PygGastosMensuales): number {
  return g.arriendo + g.personal + g.servicios + g.otros;
}
