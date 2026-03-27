/**
 * Historial de ventas con detalle de líneas en este navegador (localStorage).
 * Sirve para el dashboard del cajero; no reemplaza el WMS.
 */

const STORAGE_KEY = "pos_mc_ventas_cajero_v1";
const MAX_VENTAS = 500;

export interface LineaVentaGuardada {
  lineId: string;
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
  cajeroTurnoId?: string;
  cajeroNombre?: string;
  total: number;
  lineas: LineaVentaGuardada[];
  /** Resumen de medios de pago u observaciones (solo local). */
  pagoResumen?: string;
}

function leerRaw(): VentaGuardadaLocal[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is VentaGuardadaLocal => v && typeof v === "object" && typeof (v as VentaGuardadaLocal).id === "string");
  } catch {
    return [];
  }
}

function escribir(lista: VentaGuardadaLocal[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lista));
  } catch {
    // quota: recortar a la mitad y reintentar una vez
    try {
      const mitad = lista.slice(Math.floor(lista.length / 2));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(mitad));
    } catch {
      /* ignore */
    }
  }
}

export function ymdDesdeFechaLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function appendVentaLocal(venta: Omit<VentaGuardadaLocal, "id" | "isoTimestamp"> & { isoTimestamp?: string }): void {
  if (typeof window === "undefined") return;
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const isoTimestamp = venta.isoTimestamp ?? new Date().toISOString();
  const row: VentaGuardadaLocal = { ...venta, id, isoTimestamp };
  const prev = leerRaw();
  const next = [...prev, row];
  const trimmed =
    next.length > MAX_VENTAS ? next.slice(next.length - MAX_VENTAS) : next;
  escribir(trimmed);
}

export function listarVentasPuntoVenta(puntoVenta: string): VentaGuardadaLocal[] {
  const pv = puntoVenta.trim();
  if (!pv) return [];
  return leerRaw().filter((v) => v.puntoVenta?.trim() === pv);
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
  const delDia = ventas.filter((v) => v.fechaYmd === fechaYmd);
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

/** Últimos 7 días calendario terminando en `hasta` (inclusive), orden cronológico. */
export function resumenUltimos7Dias(ventas: VentaGuardadaLocal[], hasta: Date): MiniDiaSemana[] {
  const out: MiniDiaSemana[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(hasta.getFullYear(), hasta.getMonth(), hasta.getDate() - i);
    const ymd = ymdDesdeFechaLocal(d);
    const r = resumenPorDia(ventas, ymd);
    const labelCorto = d.toLocaleDateString("es-CO", { weekday: "short", day: "numeric" });
    out.push({
      fechaYmd: ymd,
      labelCorto: labelCorto.charAt(0).toUpperCase() + labelCorto.slice(1),
      totalPesos: r.totalPesos,
      numTickets: r.numTickets,
    });
  }
  return out;
}
