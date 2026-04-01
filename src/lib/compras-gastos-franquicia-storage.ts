/**
 * Registro de compras y gastos del franquiciado (localStorage por punto de venta).
 * Los totales por mes se suman al PYG del punto de venta. No sustituye contabilidad formal.
 */

import { ymdColombiaMenosDias } from "@/lib/fecha-colombia";

export type CgTipoMovimiento = "compra" | "gasto";

export interface CgProveedor {
  id: string;
  nombre: string;
  notas?: string;
}

export interface CgMovimiento {
  id: string;
  fechaYmd: string;
  tipo: CgTipoMovimiento;
  proveedorId: string | null;
  descripcion: string;
  monto: number;
  creadoEn: string;
}

export interface CgBundle {
  proveedores: CgProveedor[];
  movimientos: CgMovimiento[];
}

const STORAGE_PREFIX = "pos_mc_cg_fq_v1:";
const EVENTO_CAMBIO = "pos-mc-compras-gastos-changed";

function storageKey(pv: string): string {
  return `${STORAGE_PREFIX}${pv.trim()}`;
}

function nuevoId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `cg_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function clampMonto(n: unknown): number {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x) || x <= 0) return 0;
  return Math.round(x * 100) / 100;
}

function normalizarBundle(raw: unknown): CgBundle {
  if (!raw || typeof raw !== "object") return { proveedores: [], movimientos: [] };
  const o = raw as Record<string, unknown>;
  const provRaw = Array.isArray(o.proveedores) ? o.proveedores : [];
  const movRaw = Array.isArray(o.movimientos) ? o.movimientos : [];
  const proveedores: CgProveedor[] = provRaw
    .filter((p): p is Record<string, unknown> => p != null && typeof p === "object")
    .map((p) => ({
      id: String(p.id ?? nuevoId()),
      nombre: String(p.nombre ?? "").trim() || "Sin nombre",
      notas: p.notas != null ? String(p.notas).trim() : undefined,
    }))
    .filter((p) => p.nombre.length > 0);
  const movimientos: CgMovimiento[] = movRaw
    .filter((m): m is Record<string, unknown> => m != null && typeof m === "object")
    .map((m) => ({
      id: String(m.id ?? nuevoId()),
      fechaYmd: String(m.fechaYmd ?? "").slice(0, 10),
      tipo: (m.tipo === "gasto" ? "gasto" : "compra") as CgTipoMovimiento,
      proveedorId: m.proveedorId == null || m.proveedorId === "" ? null : String(m.proveedorId),
      descripcion: String(m.descripcion ?? "").trim() || "—",
      monto: clampMonto(m.monto),
      creadoEn: String(m.creadoEn ?? new Date().toISOString()),
    }))
    .filter((m) => m.monto > 0 && /^\d{4}-\d{2}-\d{2}$/.test(m.fechaYmd));
  return { proveedores, movimientos };
}

function emitirCambio(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new Event(EVENTO_CAMBIO));
  } catch {
    /* noop */
  }
}

export function suscripcionCambiosComprasGastos(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENTO_CAMBIO, cb);
  return () => window.removeEventListener(EVENTO_CAMBIO, cb);
}

export function leerBundleComprasGastos(pv: string): CgBundle {
  if (typeof window === "undefined" || !pv.trim()) return { proveedores: [], movimientos: [] };
  try {
    const raw = localStorage.getItem(storageKey(pv));
    if (!raw) return { proveedores: [], movimientos: [] };
    return normalizarBundle(JSON.parse(raw) as unknown);
  } catch {
    return { proveedores: [], movimientos: [] };
  }
}

function guardarBundleInterno(pv: string, bundle: CgBundle): void {
  if (typeof window === "undefined" || !pv.trim()) return;
  try {
    localStorage.setItem(storageKey(pv), JSON.stringify(bundle));
    emitirCambio();
  } catch {
    /* quota */
  }
}

/** Primer y último día del mes YYYY-MM (strings YYYY-MM-DD, calendario Colombia) */
export function rangoMes(ym: string): { desde: string; hasta: string } {
  const t = ym.trim();
  const desde = `${t}-01`;
  const [y, m] = t.split("-").map(Number);
  if (!y || !m) return { desde, hasta: desde };
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const hasta = ymdColombiaMenosDias(next, 1);
  return { desde, hasta };
}

export function totalRegistradoComprasGastosEnMes(pv: string, ym: string): number {
  const { desde, hasta } = rangoMes(ym);
  return totalRegistradoComprasGastosEnRango(pv, desde, hasta);
}

export function totalRegistradoComprasGastosEnRango(pv: string, desdeYmd: string, hastaYmd: string): number {
  const { movimientos } = leerBundleComprasGastos(pv);
  let t = 0;
  for (const mov of movimientos) {
    if (mov.fechaYmd >= desdeYmd && mov.fechaYmd <= hastaYmd) t += mov.monto;
  }
  return Math.round(t * 100) / 100;
}

export function listarMovimientosEnRango(
  pv: string,
  desdeYmd: string,
  hastaYmd: string
): CgMovimiento[] {
  const { movimientos } = leerBundleComprasGastos(pv);
  return movimientos
    .filter((m) => m.fechaYmd >= desdeYmd && m.fechaYmd <= hastaYmd)
    .sort((a, b) => (a.fechaYmd === b.fechaYmd ? b.creadoEn.localeCompare(a.creadoEn) : b.fechaYmd.localeCompare(a.fechaYmd)));
}

export function agregarProveedorComprasGastos(pv: string, nombre: string, notas?: string): CgProveedor | null {
  const n = nombre.replace(/\u00a0/g, " ").trim();
  if (!n) return null;
  const bundle = leerBundleComprasGastos(pv);
  const p: CgProveedor = { id: nuevoId(), nombre: n, notas: notas?.trim() || undefined };
  bundle.proveedores.push(p);
  guardarBundleInterno(pv, bundle);
  return p;
}

export function eliminarProveedorComprasGastos(pv: string, proveedorId: string): boolean {
  const bundle = leerBundleComprasGastos(pv);
  const usa = bundle.movimientos.some((m) => m.proveedorId === proveedorId);
  if (usa) return false;
  bundle.proveedores = bundle.proveedores.filter((p) => p.id !== proveedorId);
  guardarBundleInterno(pv, bundle);
  return true;
}

export function agregarMovimientoComprasGastos(pv: string, input: Omit<CgMovimiento, "id" | "creadoEn">): CgMovimiento | null {
  const monto = clampMonto(input.monto);
  if (monto <= 0) return null;
  const fechaYmd = String(input.fechaYmd ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaYmd)) return null;
  if (input.tipo === "compra" && !input.proveedorId) return null;
  const bundle = leerBundleComprasGastos(pv);
  const mov: CgMovimiento = {
    id: nuevoId(),
    fechaYmd,
    tipo: input.tipo,
    proveedorId: input.proveedorId,
    descripcion: input.descripcion.replace(/\u00a0/g, " ").trim() || "—",
    monto,
    creadoEn: new Date().toISOString(),
  };
  bundle.movimientos.push(mov);
  guardarBundleInterno(pv, bundle);
  return mov;
}

export function eliminarMovimientoComprasGastos(pv: string, movimientoId: string): void {
  const bundle = leerBundleComprasGastos(pv);
  bundle.movimientos = bundle.movimientos.filter((m) => m.id !== movimientoId);
  guardarBundleInterno(pv, bundle);
}

export function nombreProveedorEnBundle(bundle: CgBundle, proveedorId: string | null): string {
  if (!proveedorId) return "—";
  const p = bundle.proveedores.find((x) => x.id === proveedorId);
  return p?.nombre ?? "Proveedor eliminado";
}
