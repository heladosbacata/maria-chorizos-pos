/**
 * Historial de turnos cerrados (localStorage), por usuario y punto de venta.
 */

import type { MediosPagoVentaGuardados } from "@/lib/medios-pago-venta";
import type { AgregadoProductoDia, VentaGuardadaLocal } from "@/lib/pos-ventas-local-storage";

const STORAGE_PREFIX = "pos_mc_turnos_hist_v1";
const MAX_REGISTROS = 120;

export interface TurnoCerradoV1 {
  version: 1;
  id: string;
  turnoSesionId: string;
  uid: string;
  puntoVenta: string;
  inicioIso: string;
  cierreIso: string;
  emailSesion?: string;
  cajero: { id: string; nombreDisplay: string; documento: string };
  baseInicialCaja: number;
  totalVentasRegistradas: number;
  numTickets: number;
  ventasCredito: number;
  totalIngresoEfectivo: number;
  totalRetiroEfectivo: number;
  totalesMediosVentas: MediosPagoVentaGuardados;
  cierre: {
    efectivoReal: number;
    tarjeta: number;
    pagosLinea: number;
    otrosMedios: number;
    totalIngresado: number;
    totalEsperado: number;
    diferencia: number;
  };
  metricsPrecuentas: {
    precuentasEliminadas: number;
    productosEliminados: number;
    valorProductosEliminados: number;
  };
  ventas: VentaGuardadaLocal[];
  agregadoProductos: AgregadoProductoDia[];
}

function storageKey(uid: string, puntoVenta: string): string {
  return `${STORAGE_PREFIX}:${uid}:${puntoVenta.trim()}`;
}

function leerLista(uid: string, puntoVenta: string): TurnoCerradoV1[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey(uid, puntoVenta));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is TurnoCerradoV1 =>
        x &&
        typeof x === "object" &&
        (x as TurnoCerradoV1).version === 1 &&
        typeof (x as TurnoCerradoV1).id === "string"
    );
  } catch {
    return [];
  }
}

function escribir(uid: string, puntoVenta: string, lista: TurnoCerradoV1[]) {
  try {
    localStorage.setItem(storageKey(uid, puntoVenta), JSON.stringify(lista));
  } catch {
    try {
      const mitad = lista.slice(Math.floor(lista.length / 2));
      localStorage.setItem(storageKey(uid, puntoVenta), JSON.stringify(mitad));
    } catch {
      /* ignore */
    }
  }
}

export function appendTurnoCerrado(uid: string, puntoVenta: string, registro: TurnoCerradoV1): void {
  if (typeof window === "undefined") return;
  const prev = leerLista(uid, puntoVenta);
  const next = [registro, ...prev];
  const trimmed = next.length > MAX_REGISTROS ? next.slice(0, MAX_REGISTROS) : next;
  escribir(uid, puntoVenta, trimmed);
}

export function listarTurnosCerrados(uid: string, puntoVenta: string): TurnoCerradoV1[] {
  return leerLista(uid, puntoVenta);
}
