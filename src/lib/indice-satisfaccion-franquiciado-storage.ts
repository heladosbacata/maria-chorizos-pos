/**
 * Persistencia local del Índice de satisfacción al Franquiciado (por punto de venta + YYYY-MM).
 * La nube se sincroniza aparte; este módulo es el caché del equipo.
 */

import {
  normalizarRegistroMes,
  calcularIndice,
  listarAreasSeguimientoWms,
  type AreasCalificacionMap,
  type IndiceSatisfaccionMes,
  registroMesVacio,
} from "@/lib/indice-satisfaccion-franquiciado";

const STORAGE_PREFIX = "pos_mc_indice_satisfaccion_v1:";

function key(pv: string, ym: string): string {
  return `${STORAGE_PREFIX}${pv.trim()}\x1f${ym.trim()}`;
}

function indexKey(pv: string): string {
  return `${STORAGE_PREFIX}index\x1f${pv.trim()}`;
}

function leerIndex(pv: string): string[] {
  if (typeof window === "undefined" || !pv.trim()) return [];
  try {
    const raw = localStorage.getItem(indexKey(pv));
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr.filter((x): x is string => typeof x === "string" && /^\d{4}-\d{2}$/.test(x));
  } catch {
    return [];
  }
}

function escribirIndex(pv: string, yms: string[]): void {
  if (typeof window === "undefined" || !pv.trim()) return;
  try {
    const uniq = [...new Set(yms.filter((y) => /^\d{4}-\d{2}$/.test(y)))].sort();
    localStorage.setItem(indexKey(pv), JSON.stringify(uniq));
  } catch {
    /* quota */
  }
}

function registrarYmEnIndex(pv: string, ym: string): void {
  const y = ym.trim();
  if (!/^\d{4}-\d{2}$/.test(y)) return;
  const idx = leerIndex(pv);
  if (!idx.includes(y)) escribirIndex(pv, [...idx, y]);
}

/** Elige el registro con `guardadoAt` más reciente (ISO). */
export function preferirRegistroMasReciente(
  a: IndiceSatisfaccionMes | null | undefined,
  b: IndiceSatisfaccionMes | null | undefined
): IndiceSatisfaccionMes | null {
  const aOk = a?.guardadoAt ? a : null;
  const bOk = b?.guardadoAt ? b : null;
  if (!aOk) return bOk;
  if (!bOk) return aOk;
  return aOk.guardadoAt! >= bOk.guardadoAt! ? aOk : bOk;
}

export function leerIndiceSatisfaccionMes(pv: string, ym: string): IndiceSatisfaccionMes {
  if (typeof window === "undefined" || !pv.trim() || !ym.trim()) return registroMesVacio(ym);
  try {
    const raw = localStorage.getItem(key(pv, ym));
    if (!raw) return registroMesVacio(ym);
    return normalizarRegistroMes(ym, JSON.parse(raw) as unknown);
  } catch {
    return registroMesVacio(ym);
  }
}

/** Persiste un registro completo (p. ej. tras sync nube) y actualiza el índice local de meses. */
export function persistirIndiceSatisfaccionMesLocal(pv: string, registro: IndiceSatisfaccionMes): void {
  if (typeof window === "undefined" || !pv.trim() || !registro.ym.trim()) return;
  if (!registro.guardadoAt) return;
  try {
    const norm = normalizarRegistroMes(registro.ym, registro);
    localStorage.setItem(key(pv, norm.ym), JSON.stringify(norm));
    registrarYmEnIndex(pv, norm.ym);
  } catch {
    /* quota */
  }
}

/** Guarda el mes completo (todas las áreas) y actualiza el índice. */
export function guardarIndiceSatisfaccionMes(
  pv: string,
  ym: string,
  areas: AreasCalificacionMap
): IndiceSatisfaccionMes {
  const registro: IndiceSatisfaccionMes = {
    ym: ym.trim(),
    areas,
    guardadoAt: new Date().toISOString(),
    indice: calcularIndice(areas),
    seguimientoWmsAreaIds: listarAreasSeguimientoWms(areas),
  };
  persistirIndiceSatisfaccionMesLocal(pv, registro);
  return registro;
}

/** Lista YYYY-MM con registro guardado (índice local). */
export function listarMesesIndiceSatisfaccion(pv: string): string[] {
  return leerIndex(pv);
}

/** Fusiona yms locales con una lista externa (nube). */
export function fusionarMesesIndiceLocal(pv: string, ymsNube: string[]): string[] {
  const merged = [...new Set([...leerIndex(pv), ...ymsNube.filter((y) => /^\d{4}-\d{2}$/.test(y))])].sort();
  escribirIndex(pv, merged);
  return merged;
}

/** Años presentes en el índice + año actual sugerido. */
export function aniosDisponiblesIndice(pv: string, anioActual: number, ymsExtra: string[] = []): number[] {
  const set = new Set<number>([anioActual]);
  for (const ym of [...leerIndex(pv), ...ymsExtra]) {
    const y = Number(ym.slice(0, 4));
    if (Number.isFinite(y)) set.add(y);
  }
  return [...set].sort((a, b) => b - a);
}
