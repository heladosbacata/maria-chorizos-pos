import {
  etiquetaRangoFechaHoraColombia,
  horaInputColombia,
  msDesdeYmdHoraColombia,
  msHastaYmdHoraColombia,
  ymdColombia,
} from "@/lib/fecha-colombia";
import type { VentaGuardadaLocal } from "@/lib/pos-ventas-local-storage";
import { esVentaVigente } from "@/lib/pos-ventas-local-storage";
import { construirFilasDocumentosPos } from "@/lib/ventas-documentos-pos";
import {
  construirDatosReporteVentasPos,
  type DatosReporteVentasPos,
  type NivelDetalleReporteVentas,
} from "@/lib/ventas-reporte-pos-data";

export type RangoFechaHoraCajeroInput = {
  desdeYmd: string;
  desdeHora: string;
  hastaYmd: string;
  hastaHora: string;
};

export type RangoFechaHoraCajeroResuelto = {
  desdeMs: number;
  hastaMs: number;
  periodoLabel: string;
};

export function msTimestampVentaCajero(v: VentaGuardadaLocal): number {
  const t = Date.parse(v.isoTimestamp);
  return Number.isNaN(t) ? 0 : t;
}

export function resolverRangoFechaHoraCajero(input: RangoFechaHoraCajeroInput): RangoFechaHoraCajeroResuelto | null {
  const desdeMs = msDesdeYmdHoraColombia(input.desdeYmd, input.desdeHora);
  const hastaMs = msHastaYmdHoraColombia(input.hastaYmd, input.hastaHora);
  if (!Number.isFinite(desdeMs) || !Number.isFinite(hastaMs) || desdeMs > hastaMs) return null;
  return {
    desdeMs,
    hastaMs,
    periodoLabel: etiquetaRangoFechaHoraColombia(desdeMs, hastaMs),
  };
}

export function filtrarVentasCajeroPorRangoMs(
  ventas: VentaGuardadaLocal[],
  desdeMs: number,
  hastaMs: number
): VentaGuardadaLocal[] {
  return ventas.filter((v) => {
    const ms = msTimestampVentaCajero(v);
    if (ms <= 0) return false;
    return ms >= desdeMs && ms <= hastaMs;
  });
}

export function rangoFechaHoraCajeroPorDefecto(): RangoFechaHoraCajeroInput {
  const hoy = ymdColombia();
  return {
    desdeYmd: hoy,
    desdeHora: "00:00",
    hastaYmd: hoy,
    hastaHora: horaInputColombia(),
  };
}

/** Desde apertura del turno hasta ahora (Colombia). */
export function rangoFechaHoraCajeroDesdeTurno(turnoInicioIso: string): RangoFechaHoraCajeroInput | null {
  const t = Date.parse(turnoInicioIso);
  if (Number.isNaN(t)) return null;
  const inicio = new Date(t);
  return {
    desdeYmd: ymdColombia(inicio),
    desdeHora: horaInputColombia(inicio),
    hastaYmd: ymdColombia(),
    hastaHora: horaInputColombia(),
  };
}

/** Últimos 60 minutos hasta ahora. */
export function rangoFechaHoraCajeroUltimaHora(): RangoFechaHoraCajeroInput {
  const hasta = new Date();
  const desde = new Date(hasta.getTime() - 60 * 60 * 1000);
  return {
    desdeYmd: ymdColombia(desde),
    desdeHora: horaInputColombia(desde),
    hastaYmd: ymdColombia(hasta),
    hastaHora: horaInputColombia(hasta),
  };
}

/** Día calendario completo en Colombia (00:00 → 23:59). */
export function rangoFechaHoraCajeroDiaCompleto(ymd: string = ymdColombia()): RangoFechaHoraCajeroInput {
  return {
    desdeYmd: ymd,
    desdeHora: "00:00",
    hastaYmd: ymd,
    hastaHora: "23:59",
  };
}

export function construirDatosReporteVentasRangoCajero(params: {
  puntoVenta: string;
  ventas: VentaGuardadaLocal[];
  rango: RangoFechaHoraCajeroResuelto;
  nivel: NivelDetalleReporteVentas;
  soloVigentes?: boolean;
}): DatosReporteVentasPos {
  const { ventas, rango, puntoVenta, nivel, soloVigentes = true } = params;
  let filtradas = filtrarVentasCajeroPorRangoMs(ventas, rango.desdeMs, rango.hastaMs);
  if (soloVigentes) filtradas = filtradas.filter(esVentaVigente);
  const filas = construirFilasDocumentosPos({
    ventas: filtradas,
    cotizaciones: [],
    remisiones: [],
  });
  const base = construirDatosReporteVentasPos({
    puntoVenta,
    desdeYmd: ymdColombia(new Date(rango.desdeMs)),
    hastaYmd: ymdColombia(new Date(rango.hastaMs)),
    nivel,
    filas,
    filtroTabLabel: "Ventas con carrito · rango fecha y hora (Colombia)",
    fechaConHora: true,
  });
  return { ...base, periodoLabel: rango.periodoLabel };
}
