/**
 * Historial de ventas con detalle de líneas en este navegador (localStorage).
 * Los datos se guardan por usuario (Firebase uid) para no mezclar ventas entre cuentas en el mismo equipo.
 */

import type { MediosPagoVentaGuardados } from "@/lib/medios-pago-venta";
import {
  LOCALE_COL,
  ZONA_HORARIA_COLOMBIA,
  mediodiaColombiaDesdeYmd,
  ymdColombia,
  ymdColombiaMenosDias,
} from "@/lib/fecha-colombia";

/** Lista global antigua (una sola por navegador); se migra una vez al primer uid que lea. */
const LEGACY_STORAGE_KEY = "pos_mc_ventas_cajero_v1";

function storageKeyUid(uid: string): string {
  return `pos_mc_ventas_cajero_v2:${uid.trim()}`;
}

const MAX_VENTAS = 500;

export interface LineaVentaGuardada {
  lineId: string;
  /** SKU compuesto de la línea (ej. bebida con variante) para ubicar el mismo ítem en inventario. */
  inventarioLookupKey?: string;
  sku: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  detalleVariante?: string;
}

export interface VentaGuardadaLocal {
  id: string;
  fechaYmd: string;
  isoTimestamp: string;
  puntoVenta: string;
  /** Usuario Firebase que registró la venta en este equipo. */
  uidSesion?: string;
  /** Id estable del turno (apertura→cierre); enlaza ventas al cierre. */
  turnoSesionId?: string;
  cajeroTurnoId?: string;
  cajeroNombre?: string;
  total: number;
  lineas: LineaVentaGuardada[];
  /** Resumen de medios de pago u observaciones (solo local). */
  pagoResumen?: string;
  /** Desglose estructurado por ticket (si el cobro usó el panel de pagos). */
  mediosPago?: MediosPagoVentaGuardados;
  /** Venta anulada en caja; no cuenta en totales de reporte ni en cierre. */
  anulada?: boolean;
  anuladaMotivo?: string;
  anuladaEnIso?: string;
  anuladaPorUid?: string;
  /** Factura electrónica emitida con este cobro (reimpresión en Últimos recibos). */
  facturaElectronicaNumero?: string;
  facturaElectronicaCufe?: string;
  facturaElectronicaEnviadoAt?: string;
}

/** Ventas que siguen contando como ingreso y stock vendido. */
export function esVentaVigente(v: VentaGuardadaLocal): boolean {
  return v.anulada !== true;
}

export function filtrarVentasVigentes(ventas: VentaGuardadaLocal[]): VentaGuardadaLocal[] {
  return ventas.filter(esVentaVigente);
}

function migrarLegacyAUid(uid: string): void {
  if (typeof window === "undefined" || !uid.trim()) return;
  const k2 = storageKeyUid(uid);
  try {
    if (localStorage.getItem(k2)) return;
    const oldRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!oldRaw) return;
    const parsed = JSON.parse(oldRaw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return;
    localStorage.setItem(k2, JSON.stringify(parsed));
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function leerRaw(uid: string): VentaGuardadaLocal[] {
  if (typeof window === "undefined" || !uid.trim()) return [];
  try {
    migrarLegacyAUid(uid);
    const raw = localStorage.getItem(storageKeyUid(uid));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v): v is VentaGuardadaLocal => v && typeof v === "object" && typeof (v as VentaGuardadaLocal).id === "string"
    );
  } catch {
    return [];
  }
}

function escribir(uid: string, lista: VentaGuardadaLocal[]) {
  if (!uid.trim()) return;
  try {
    localStorage.setItem(storageKeyUid(uid), JSON.stringify(lista));
  } catch {
    try {
      const mitad = lista.slice(Math.floor(lista.length / 2));
      localStorage.setItem(storageKeyUid(uid), JSON.stringify(mitad));
    } catch {
      /* ignore */
    }
  }
}

/** YYYY-MM-DD en calendario Colombia (nombre histórico "local"; ya no usa el huso del navegador). */
export function ymdDesdeFechaLocal(d: Date): string {
  return ymdColombia(d);
}

export function appendVentaLocal(
  uid: string,
  venta: Omit<VentaGuardadaLocal, "id" | "isoTimestamp" | "uidSesion"> & { isoTimestamp?: string }
): string | null {
  if (typeof window === "undefined" || !uid.trim()) return null;
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const isoTimestamp = venta.isoTimestamp ?? new Date().toISOString();
  const row: VentaGuardadaLocal = { ...venta, id, isoTimestamp, uidSesion: uid.trim() };
  const prev = leerRaw(uid);
  const next = [...prev, row];
  const trimmed = next.length > MAX_VENTAS ? next.slice(next.length - MAX_VENTAS) : next;
  escribir(uid, trimmed);
  return id;
}

/** Tras emitir FE con éxito (o reintento en cola), guarda CUFE/número en la venta local para reimpresión. */
export function actualizarVentaLocalFacturaElectronica(
  uid: string,
  ventaId: string,
  fe: { numero?: string; cufe?: string; enviadoAt?: string }
): void {
  if (typeof window === "undefined" || !uid.trim() || !ventaId.trim()) return;
  const prev = leerRaw(uid);
  const idx = prev.findIndex((v) => v.id === ventaId);
  if (idx < 0) return;
  const row: VentaGuardadaLocal = { ...prev[idx] };
  const n = fe.numero?.trim();
  const c = fe.cufe?.trim();
  const e = fe.enviadoAt?.trim();
  if (n) row.facturaElectronicaNumero = n;
  if (c) row.facturaElectronicaCufe = c;
  if (e) row.facturaElectronicaEnviadoAt = e;
  const next = [...prev];
  next[idx] = row;
  escribir(uid, next);
}

/** Resumen de informes: combina local + nube; si en local está anulada, se conserva el estado de anulación. */
export function mergeVentasReporteNubeLocal(
  local: VentaGuardadaLocal[],
  nube: VentaGuardadaLocal[]
): VentaGuardadaLocal[] {
  const map = new Map<string, VentaGuardadaLocal>();
  for (const v of nube) map.set(v.id, v);
  for (const L of local) {
    const N = map.get(L.id);
    if (L.anulada) {
      map.set(L.id, N ? { ...N, ...L, anulada: true } : L);
    } else {
      map.set(L.id, N ?? L);
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.isoTimestamp).getTime() - new Date(a.isoTimestamp).getTime()
  );
}

export function listarVentasPuntoVenta(uid: string, puntoVenta: string): VentaGuardadaLocal[] {
  const u = uid.trim();
  const pv = puntoVenta.trim();
  if (!u || !pv) return [];
  return leerRaw(u).filter((v) => v.puntoVenta?.trim() === pv);
}

function esVentaGuardadaValida(v: unknown): v is VentaGuardadaLocal {
  return Boolean(v && typeof v === "object" && typeof (v as VentaGuardadaLocal).id === "string");
}

/** Si hay dos copias del mismo ticket, prioriza anulación y luego el registro más reciente. */
function elegirMejorCopiaVenta(a: VentaGuardadaLocal, b: VentaGuardadaLocal): VentaGuardadaLocal {
  const aA = a.anulada === true;
  const bA = b.anulada === true;
  if (aA && !bA) return a;
  if (bA && !aA) return b;
  const ta = new Date(a.isoTimestamp).getTime();
  const tb = new Date(b.isoTimestamp).getTime();
  if (!Number.isNaN(ta) && !Number.isNaN(tb) && ta !== tb) {
    return ta >= tb ? a : b;
  }
  return a;
}

/**
 * Todas las ventas del punto de venta guardadas en este navegador, **sin importar qué cajero** cerró sesión
 * (recorre `pos_mc_ventas_cajero_v2:*` y la clave legacy). Para el reporte consolidado del PV en el equipo.
 */
export function listarVentasPuntoVentaEnEsteEquipo(puntoVenta: string): VentaGuardadaLocal[] {
  const pv = puntoVenta.trim();
  if (!pv || typeof window === "undefined") return [];
  const porId = new Map<string, VentaGuardadaLocal>();

  const incorporarLista = (lista: unknown) => {
    if (!Array.isArray(lista)) return;
    for (const item of lista) {
      if (!esVentaGuardadaValida(item)) continue;
      if (item.puntoVenta?.trim() !== pv) continue;
      const id = item.id.trim();
      if (!id) continue;
      const prev = porId.get(id);
      if (!prev) {
        porId.set(id, item);
      } else {
        porId.set(id, elegirMejorCopiaVenta(prev, item));
      }
    }
  };

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith("pos_mc_ventas_cajero_v2:")) continue;
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        incorporarLista(JSON.parse(raw) as unknown);
      } catch {
        /* ignore key */
      }
    }
    try {
      const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacyRaw) incorporarLista(JSON.parse(legacyRaw) as unknown);
    } catch {
      /* ignore */
    }
  } catch {
    return [];
  }

  return Array.from(porId.values()).sort(
    (a, b) => new Date(b.isoTimestamp).getTime() - new Date(a.isoTimestamp).getTime()
  );
}

/**
 * Marca la venta como anulada en el almacenamiento de este navegador.
 * @returns la venta actualizada o null si no existe el id.
 */
export function marcarVentaAnuladaLocal(
  uid: string,
  ventaId: string,
  opts: { motivo: string; anuladaPorUid: string }
): VentaGuardadaLocal | null {
  const u = uid.trim();
  const id = ventaId.trim();
  if (typeof window === "undefined" || !u || !id) return null;
  const motivo = opts.motivo.trim().slice(0, 500);
  if (!motivo) return null;
  const prev = leerRaw(u);
  const idx = prev.findIndex((v) => v.id === id);
  if (idx < 0) return null;
  const row = prev[idx];
  if (row.anulada) return row;
  const anuladaEnIso = new Date().toISOString();
  const next: VentaGuardadaLocal = {
    ...row,
    anulada: true,
    anuladaMotivo: motivo,
    anuladaEnIso,
    anuladaPorUid: opts.anuladaPorUid.trim() || undefined,
  };
  const lista = [...prev];
  lista[idx] = next;
  escribir(u, lista);
  return next;
}

export function ventaPorIdLocal(uid: string, ventaId: string): VentaGuardadaLocal | null {
  const u = uid.trim();
  const id = ventaId.trim();
  if (!u || !id) return null;
  return leerRaw(u).find((v) => v.id === id) ?? null;
}

export function ventasDelTurnoSesion(ventas: VentaGuardadaLocal[], turnoSesionId: string): VentaGuardadaLocal[] {
  const id = turnoSesionId.trim();
  if (!id) return [];
  return ventas.filter((v) => v.turnoSesionId === id);
}

/**
 * Ventas del turno: por `turnoSesionId` si hay coincidencias; si no (turnos antiguos), por rango de hora.
 */
export function ventasDelTurnoParaCierre(
  ventas: VentaGuardadaLocal[],
  turnoSesionId: string,
  inicioTurno: Date,
  finTurno: Date
): VentaGuardadaLocal[] {
  const id = turnoSesionId.trim();
  const porId = id ? ventas.filter((v) => v.turnoSesionId === id) : [];
  if (porId.length > 0) return porId;
  const t0 = inicioTurno.getTime();
  const t1 = finTurno.getTime();
  return ventas.filter((v) => {
    const t = new Date(v.isoTimestamp).getTime();
    return !Number.isNaN(t) && t >= t0 && t <= t1;
  });
}

/** Turno aún abierto: mismas reglas que el cierre pero sin tope de hora fin (solo ≥ inicio). */
export function ventasDelTurnoActivos(
  ventas: VentaGuardadaLocal[],
  turnoSesionId: string,
  inicioTurno: Date
): VentaGuardadaLocal[] {
  const id = turnoSesionId.trim();
  const porId = id ? ventas.filter((v) => v.turnoSesionId === id) : [];
  if (porId.length > 0) return porId;
  const t0 = inicioTurno.getTime();
  return ventas.filter((v) => {
    const t = new Date(v.isoTimestamp).getTime();
    return !Number.isNaN(t) && t >= t0;
  });
}

export interface AgregadoProductoDia {
  clave: string;
  descripcion: string;
  sku: string;
  cantidad: number;
  subtotal: number;
  detalleVariante?: string;
}

export interface ResumenDiaCajero {
  fechaYmd: string;
  totalPesos: number;
  numTickets: number;
  unidadesVendidas: number;
  productos: AgregadoProductoDia[];
}

function etiquetaLinea(l: LineaVentaGuardada): string {
  const v = l.detalleVariante?.trim();
  return v ? `${l.descripcion} (${v})` : l.descripcion;
}

export function resumenPorDia(ventas: VentaGuardadaLocal[], fechaYmd: string): ResumenDiaCajero {
  const delDia = ventas.filter((v) => v.fechaYmd === fechaYmd && esVentaVigente(v));
  const map = new Map<
    string,
    { descripcion: string; sku: string; cantidad: number; subtotal: number; detalleVariante?: string }
  >();

  let unidades = 0;
  for (const v of delDia) {
    for (const linea of v.lineas) {
      const clave = linea.lineId;
      const prev = map.get(clave);
      const addCant = linea.cantidad;
      const addSub = linea.precioUnitario * linea.cantidad;
      unidades += addCant;
      if (prev) {
        map.set(clave, {
          ...prev,
          cantidad: prev.cantidad + addCant,
          subtotal: prev.subtotal + addSub,
        });
      } else {
        map.set(clave, {
          descripcion: etiquetaLinea(linea),
          sku: linea.sku,
          cantidad: addCant,
          subtotal: addSub,
          detalleVariante: linea.detalleVariante,
        });
      }
    }
  }

  const productos: AgregadoProductoDia[] = Array.from(map.entries())
    .map(([clave, x]) => ({
      clave,
      descripcion: x.descripcion,
      sku: x.sku,
      cantidad: x.cantidad,
      subtotal: x.subtotal,
      detalleVariante: x.detalleVariante,
    }))
    .sort((a, b) => b.cantidad - a.cantidad);

  const totalPesos = delDia.reduce((s, v) => s + v.total, 0);

  return {
    fechaYmd,
    totalPesos,
    numTickets: delDia.length,
    unidadesVendidas: unidades,
    productos,
  };
}

export interface MiniDiaSemana {
  fechaYmd: string;
  labelCorto: string;
  totalPesos: number;
  numTickets: number;
}

/** Agrega líneas de varios tickets por producto (SKU + descripción + variante). */
export function agregarProductosEnVentas(ventas: VentaGuardadaLocal[]): AgregadoProductoDia[] {
  const map = new Map<
    string,
    { descripcion: string; sku: string; cantidad: number; subtotal: number; detalleVariante?: string }
  >();

  for (const v of ventas) {
    if (!esVentaVigente(v)) continue;
    for (const linea of v.lineas) {
      const clave = `${linea.sku}\x1f${linea.descripcion}\x1f${linea.detalleVariante ?? ""}`;
      const addCant = linea.cantidad;
      const addSub = linea.precioUnitario * linea.cantidad;
      const prev = map.get(clave);
      if (prev) {
        map.set(clave, {
          ...prev,
          cantidad: prev.cantidad + addCant,
          subtotal: prev.subtotal + addSub,
        });
      } else {
        map.set(clave, {
          descripcion: etiquetaLinea(linea),
          sku: linea.sku,
          cantidad: addCant,
          subtotal: addSub,
          detalleVariante: linea.detalleVariante,
        });
      }
    }
  }

  return Array.from(map.entries())
    .map(([clave, x]) => ({
      clave,
      descripcion: x.descripcion,
      sku: x.sku,
      cantidad: x.cantidad,
      subtotal: x.subtotal,
      detalleVariante: x.detalleVariante,
    }))
    .sort((a, b) => b.subtotal - a.subtotal);
}

/** Últimos 7 días calendario Colombia terminando en `hasta` (inclusive), orden cronológico. */
/** Anulaciones con fecha de anulación (calendario Colombia) dentro del rango inclusive. */
export function listarAnulacionesFiltradasPorFecha(
  ventas: VentaGuardadaLocal[],
  desdeYmd: string,
  hastaYmd: string
): VentaGuardadaLocal[] {
  return ventas
    .filter((v) => {
      if (!v.anulada || !v.anuladaEnIso?.trim()) return false;
      const ymd = ymdColombia(new Date(v.anuladaEnIso));
      return ymd >= desdeYmd && ymd <= hastaYmd;
    })
    .sort(
      (a, b) =>
        new Date(b.anuladaEnIso ?? "").getTime() - new Date(a.anuladaEnIso ?? "").getTime()
    );
}

export function resumenUltimos7Dias(ventas: VentaGuardadaLocal[], hasta: Date): MiniDiaSemana[] {
  const endYmd = ymdColombia(hasta);
  const out: MiniDiaSemana[] = [];
  for (let i = 6; i >= 0; i--) {
    const ymd = ymdColombiaMenosDias(endYmd, 6 - i);
    const d = mediodiaColombiaDesdeYmd(ymd);
    const r = resumenPorDia(ventas, ymd);
    const labelCorto = d.toLocaleDateString(LOCALE_COL, {
      timeZone: ZONA_HORARIA_COLOMBIA,
      weekday: "short",
      day: "numeric",
    });
    out.push({
      fechaYmd: ymd,
      labelCorto: labelCorto.charAt(0).toUpperCase() + labelCorto.slice(1),
      totalPesos: r.totalPesos,
      numTickets: r.numTickets,
    });
  }
  return out;
}
