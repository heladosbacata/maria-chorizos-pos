import type { MediosPagoVentaGuardados } from "@/lib/medios-pago-venta";

type MediosResumen = Pick<MediosPagoVentaGuardados, "efectivo" | "tarjeta" | "pagosLinea" | "otros">;

export type ResumenCierreTurno = {
  efectivoEsperadoCaja: number;
  tarjeta: number;
  pagosLinea: number;
  otros: number;
  netoMovimientosEfectivo: number;
  totalVentasLocales: number;
  totalVentasSistema: number;
  totalCierreLocal: number;
  totalCierreSistema: number;
  desfaseVentasSistema: number;
  hayDesfaseSistema: boolean;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function calcularResumenCierreTurno(input: {
  baseInicialCaja: number;
  totalVentasLocales: number;
  totalVentasSistema: number;
  mediosVentas: MediosResumen;
  totalIngresoEfectivo: number;
  totalRetiroEfectivo: number;
}): ResumenCierreTurno {
  const efectivo = round2(input.mediosVentas.efectivo);
  const tarjeta = round2(input.mediosVentas.tarjeta);
  const pagosLinea = round2(input.mediosVentas.pagosLinea);
  const otros = round2(input.mediosVentas.otros);
  const totalVentasLocales = round2(input.totalVentasLocales);
  const totalVentasSistema = round2(input.totalVentasSistema);
  const netoMovimientosEfectivo = round2(input.totalIngresoEfectivo - input.totalRetiroEfectivo);
  const efectivoEsperadoCaja = round2(input.baseInicialCaja + efectivo + netoMovimientosEfectivo);
  const totalCierreLocal = round2(efectivoEsperadoCaja + tarjeta + pagosLinea + otros);
  const totalCierreSistema = round2(input.baseInicialCaja + totalVentasSistema + netoMovimientosEfectivo);
  const desfaseVentasSistema = round2(totalVentasLocales - totalVentasSistema);
  const hayDesfaseSistema = Math.abs(desfaseVentasSistema) >= 0.01;

  return {
    efectivoEsperadoCaja,
    tarjeta,
    pagosLinea,
    otros,
    netoMovimientosEfectivo,
    totalVentasLocales,
    totalVentasSistema,
    totalCierreLocal,
    totalCierreSistema,
    desfaseVentasSistema,
    hayDesfaseSistema,
  };
}
