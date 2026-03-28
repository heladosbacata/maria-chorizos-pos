/**
 * Persistencia del turno de caja en localStorage por usuario y punto de venta.
 * Sobrevive recarga de página y cierre de sesión; solo se borra al «Cerrar turno».
 */

const STORAGE_PREFIX = "pos_mc_turno_abierto_v1";

export interface CajeroTurnoPersistido {
  id: string;
  nombreDisplay: string;
  documento: string;
}

export interface TurnoPersistidoV1 {
  version: 1;
  /** Id único de esta apertura de turno (persistido con el turno abierto). */
  turnoSesionId: string;
  turnoInicioIso: string;
  baseInicialCaja: number;
  cajeroTurnoActivo: CajeroTurnoPersistido;
  totalVentasEnTurno: number;
  totalIngresoEfectivo: number;
  totalRetiroEfectivo: number;
  ventasCredito: number;
  precuentasEliminadasCount: number;
  productosEliminadosCount: number;
  valorProductosEliminados: number;
}

function storageKey(uid: string, puntoVenta: string): string {
  return `${STORAGE_PREFIX}:${uid}:${puntoVenta.trim()}`;
}

export function leerTurnoPersistido(uid: string, puntoVenta: string): TurnoPersistidoV1 | null {
  if (typeof window === "undefined") return null;
  const key = storageKey(uid, puntoVenta);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== "object") return null;
    const o = data as Record<string, unknown>;
    if (o.version !== 1) return null;
    const turnoSesionId =
      typeof o.turnoSesionId === "string" && o.turnoSesionId.trim() ? o.turnoSesionId.trim() : "";
    if (typeof o.turnoInicioIso !== "string") return null;
    if (typeof o.baseInicialCaja !== "number" || !Number.isFinite(o.baseInicialCaja)) return null;
    const c = o.cajeroTurnoActivo;
    if (!c || typeof c !== "object") return null;
    const cr = c as Record<string, unknown>;
    if (typeof cr.id !== "string" || typeof cr.nombreDisplay !== "string" || typeof cr.documento !== "string") {
      return null;
    }
    const num = (k: string) => (typeof o[k] === "number" && Number.isFinite(o[k] as number) ? (o[k] as number) : 0);
    return {
      version: 1,
      turnoSesionId,
      turnoInicioIso: o.turnoInicioIso,
      baseInicialCaja: o.baseInicialCaja,
      cajeroTurnoActivo: {
        id: cr.id,
        nombreDisplay: cr.nombreDisplay,
        documento: cr.documento,
      },
      totalVentasEnTurno: num("totalVentasEnTurno"),
      totalIngresoEfectivo: num("totalIngresoEfectivo"),
      totalRetiroEfectivo: num("totalRetiroEfectivo"),
      ventasCredito: num("ventasCredito"),
      precuentasEliminadasCount: num("precuentasEliminadasCount"),
      productosEliminadosCount: num("productosEliminadosCount"),
      valorProductosEliminados: num("valorProductosEliminados"),
    };
  } catch {
    return null;
  }
}

export function guardarTurnoPersistido(
  uid: string,
  puntoVenta: string,
  snapshot: TurnoPersistidoV1
): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey(uid, puntoVenta), JSON.stringify(snapshot));
  } catch {
    /* quota / privado */
  }
}

export function limpiarTurnoPersistido(uid: string, puntoVenta: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(storageKey(uid, puntoVenta));
  } catch {
    /* ignore */
  }
}
