/**
 * Contrato JSON del PyG simplificado del POS (Espacio franquiciados → PyG del punto).
 * Misma fórmula que `calcularPygSimplificado` / `PygTablaSencilla`.
 */

import {
  BASE_PERSONAL_MENSUAL,
  calcularPygSimplificado,
  FEE_PUBLICIDAD_MENSUAL,
  GASTO_ASEO_MENSUAL,
  GASTO_INTERNET_MENSUAL,
  PORCENTAJE_INSUMOS_VENTAS,
  type PygSimplificadoCalculo,
} from "@/lib/pyg-simplificado";
import { esVentaVigente, type VentaGuardadaLocal } from "@/lib/pos-ventas-local-storage";

export type PygPeriodoApi = {
  desde: string;
  hasta: string;
  diasOperando: number;
  diasDelMesRef: number;
};

export type PygAlertaApi = {
  codigo: "utilidad_positiva" | "utilidad_negativa" | "sin_ventas";
  nivel: "ok" | "alerta" | "info";
  mensaje: string;
};

export type PygDetalleLineaApi = {
  concepto: string;
  valor: number;
  nota?: string;
};

/** Respuesta alineada a lo que pide mcapp + campos nativos del PyG POS. */
export type PygApiResponse = {
  ok: true;
  puntoVenta: string;
  periodo: PygPeriodoApi;
  /** Alias de ingresos / ventas netas del modelo simplificado (tickets vigentes). */
  ventasBrutas: number;
  descuentos: number;
  ventasNetas: number;
  costoProducto: number;
  costoInsumos: number;
  gastosOperativos: number;
  /** Renta prorrateada del periodo. */
  rentaPeriodo: number;
  personalPeriodo: number;
  otrosGastosFijosPeriodo: number;
  domicilios: number;
  comisiones: number;
  impuestos: number;
  utilidadBruta: number;
  utilidadNeta: number;
  margenBruto: number;
  margenNeto: number;
  ticketPromedio: number;
  numeroTransacciones: number;
  /** Inputs mensuales usados (renta/personal; personal default 2M si no se envía). */
  parametros: {
    rentaMensual: number;
    personalMensual: number;
    porcentajeInsumos: number;
    gastoInternetMensual: number;
    gastoAseoMensual: number;
    feePublicidadMensual: number;
    fuenteIngresos: "posVentasCloud";
  };
  /** Campos nativos del cálculo POS (proyecciones, etc.). */
  calculo: PygSimplificadoCalculo;
  detalle: PygDetalleLineaApi[];
  comparativoPeriodoAnterior: null | {
    periodo: PygPeriodoApi;
    ventasNetas: number;
    utilidadNeta: number;
    deltaVentas: number;
    deltaUtilidad: number;
    deltaVentasPct: number | null;
    deltaUtilidadPct: number | null;
  };
  alertas: PygAlertaApi[];
  limitaciones: string[];
};

export function ingresosVentasEnPeriodo(
  ventas: VentaGuardadaLocal[],
  desde: string,
  hasta: string
): { ingresos: number; numeroTransacciones: number } {
  let bruto = 0;
  let n = 0;
  for (const v of ventas) {
    if (!esVentaVigente(v)) continue;
    const fy = (v.fechaYmd ?? "").trim();
    if (!fy || fy < desde || fy > hasta) continue;
    bruto += Number(v.total) || 0;
    n += 1;
  }
  return { ingresos: Math.round(bruto), numeroTransacciones: n };
}

function restarDiasYmd(ymd: string, dias: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return ymd;
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

/** Periodo anterior de la misma duración, terminando el día antes de `desde`. */
export function periodoAnteriorMismoLargo(desde: string, hasta: string): { desde: string; hasta: string } {
  const dias = Math.max(
    1,
    Math.round(
      (Date.parse(`${hasta.slice(0, 10)}T12:00:00Z`) - Date.parse(`${desde.slice(0, 10)}T12:00:00Z`)) /
        86_400_000
    ) + 1
  );
  const hastaAnt = restarDiasYmd(desde.slice(0, 10), 1);
  const desdeAnt = restarDiasYmd(hastaAnt, dias - 1);
  return { desde: desdeAnt, hasta: hastaAnt };
}

function pctDelta(actual: number, anterior: number): number | null {
  if (anterior === 0) return actual === 0 ? 0 : null;
  return Math.round(((actual - anterior) / Math.abs(anterior)) * 1000) / 10;
}

export function construirPygApiResponse(params: {
  puntoVenta: string;
  desde: string;
  hasta: string;
  ventas: VentaGuardadaLocal[];
  rentaMensual?: number;
  personalMensual?: number;
  incluirComparativo?: boolean;
}): PygApiResponse {
  const desde = params.desde.slice(0, 10);
  const hasta = params.hasta.slice(0, 10);
  const rentaMensual = Math.max(0, Math.round(params.rentaMensual ?? 0));
  const personalMensual = Math.max(
    0,
    Math.round(
      params.personalMensual != null && Number.isFinite(params.personalMensual)
        ? params.personalMensual
        : BASE_PERSONAL_MENSUAL
    )
  );

  const { ingresos, numeroTransacciones } = ingresosVentasEnPeriodo(params.ventas, desde, hasta);
  const calc = calcularPygSimplificado(ingresos, rentaMensual, desde, hasta, personalMensual);

  const gastosOperativos =
    calc.rentaPeriodo + calc.personalPeriodo + calc.otrosGastosFijosPeriodo;
  const ticketPromedio =
    numeroTransacciones > 0 ? Math.round(calc.ingresos / numeroTransacciones) : 0;
  const margenNetoPct =
    calc.ingresos > 0 ? Math.round((calc.utilidadPeriodo / calc.ingresos) * 1000) / 10 : 0;
  const margenBrutoPct =
    calc.ingresos > 0 ? Math.round((calc.margenBruto / calc.ingresos) * 1000) / 10 : 0;

  const alertas: PygAlertaApi[] = [];
  if (calc.ingresos <= 0) {
    alertas.push({
      codigo: "sin_ventas",
      nivel: "info",
      mensaje: "No hay tickets vigentes en el periodo (posVentasCloud).",
    });
  } else if (calc.utilidadPeriodo >= 0) {
    alertas.push({
      codigo: "utilidad_positiva",
      nivel: "ok",
      mensaje: "Utilidad del periodo en positivo (mismo semáforo del PyG POS).",
    });
  } else {
    alertas.push({
      codigo: "utilidad_negativa",
      nivel: "alerta",
      mensaje: "Utilidad del periodo en negativo (mismo semáforo del PyG POS).",
    });
  }

  const detalle: PygDetalleLineaApi[] = [
    {
      concepto: "1. Ventas en este periodo",
      valor: calc.ingresos,
      nota: `Tickets del POS (${desde} → ${hasta})`,
    },
    {
      concepto: "2. Días operando",
      valor: calc.diasOperando,
      nota: `De ${calc.diasDelMes} días del mes`,
    },
    {
      concepto: `3. Costo insumos (${Math.round(PORCENTAJE_INSUMOS_VENTAS * 100)}%)`,
      valor: calc.costoInsumos,
      nota: "Estándar franquicia; no es inventario real del periodo",
    },
    { concepto: "4. Margen bruto", valor: calc.margenBruto },
    {
      concepto: "5. Renta (prorrateada)",
      valor: calc.rentaPeriodo,
      nota: `Mensual ${rentaMensual}`,
    },
    {
      concepto: "6. Personal (prorrateado)",
      valor: calc.personalPeriodo,
      nota: `Mensual ${personalMensual}`,
    },
    {
      concepto: "7. Otros fijos (internet+aseo+publicidad)",
      valor: calc.otrosGastosFijosPeriodo,
      nota: `Mensual ${calc.otrosGastosFijosMensual}`,
    },
    { concepto: "8. Utilidad del periodo", valor: calc.utilidadPeriodo },
    { concepto: "Promedio venta diario", valor: calc.promedioVentaDiario },
    { concepto: "Utilidad diaria", valor: calc.utilidadDiaria },
    { concepto: "Ventas proyectadas mes", valor: calc.ventasProyectadasMes },
    { concepto: "Utilidad proyectada mes", valor: calc.utilidadProyectadaMes },
    {
      concepto: "Ventas proyectadas mes +10%",
      valor: calc.ventasProyectadasMesPlus10,
    },
    {
      concepto: "Utilidad proyectada mes +10%",
      valor: calc.utilidadProyectadaMesPlus10,
    },
  ];

  let comparativoPeriodoAnterior: PygApiResponse["comparativoPeriodoAnterior"] = null;
  if (params.incluirComparativo !== false) {
    const ant = periodoAnteriorMismoLargo(desde, hasta);
    const prev = ingresosVentasEnPeriodo(params.ventas, ant.desde, ant.hasta);
    const calcAnt = calcularPygSimplificado(
      prev.ingresos,
      rentaMensual,
      ant.desde,
      ant.hasta,
      personalMensual
    );
    comparativoPeriodoAnterior = {
      periodo: {
        desde: ant.desde,
        hasta: ant.hasta,
        diasOperando: calcAnt.diasOperando,
        diasDelMesRef: calcAnt.diasDelMes,
      },
      ventasNetas: calcAnt.ingresos,
      utilidadNeta: calcAnt.utilidadPeriodo,
      deltaVentas: calc.ingresos - calcAnt.ingresos,
      deltaUtilidad: calc.utilidadPeriodo - calcAnt.utilidadPeriodo,
      deltaVentasPct: pctDelta(calc.ingresos, calcAnt.ingresos),
      deltaUtilidadPct: pctDelta(calc.utilidadPeriodo, calcAnt.utilidadPeriodo),
    };
  }

  return {
    ok: true,
    puntoVenta: params.puntoVenta,
    periodo: {
      desde,
      hasta,
      diasOperando: calc.diasOperando,
      diasDelMesRef: calc.diasDelMes,
    },
    ventasBrutas: calc.ingresos,
    descuentos: 0,
    ventasNetas: calc.ingresos,
    costoProducto: calc.costoInsumos,
    costoInsumos: calc.costoInsumos,
    gastosOperativos,
    rentaPeriodo: calc.rentaPeriodo,
    personalPeriodo: calc.personalPeriodo,
    otrosGastosFijosPeriodo: calc.otrosGastosFijosPeriodo,
    domicilios: 0,
    comisiones: 0,
    impuestos: 0,
    utilidadBruta: calc.margenBruto,
    utilidadNeta: calc.utilidadPeriodo,
    margenBruto: margenBrutoPct,
    margenNeto: margenNetoPct,
    ticketPromedio,
    numeroTransacciones,
    parametros: {
      rentaMensual,
      personalMensual,
      porcentajeInsumos: PORCENTAJE_INSUMOS_VENTAS,
      gastoInternetMensual: GASTO_INTERNET_MENSUAL,
      gastoAseoMensual: GASTO_ASEO_MENSUAL,
      feePublicidadMensual: FEE_PUBLICIDAD_MENSUAL,
      fuenteIngresos: "posVentasCloud",
    },
    calculo: calc,
    detalle,
    comparativoPeriodoAnterior,
    alertas,
    limitaciones: [
      "Modelo PyG simplificado del POS: insumos = 44% de ventas (no BOM/inventario real).",
      "descuentos, domicilios, comisiones e impuestos no se desglosan en el PyG actual (van en 0).",
      "rentaMensual y personalMensual viven en localStorage del navegador del POS; la API los recibe por query o usa personal=2.000.000 y renta=0.",
      "Ingresos solo desde posVentasCloud (tickets vigentes); no incluye ventas solo-local del equipo sin sync a nube.",
    ],
  };
}
