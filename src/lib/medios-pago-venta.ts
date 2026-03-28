/** Misma forma que `DetallePagoConfirmado` del panel de cobro (evita importar componente cliente). */
export interface DetallePagoParaMedios {
  efectivo: number;
  pagosLinea: { tipo: string; monto: number }[];
  observaciones: string;
}

const TIPO_DATAFONO = "Datafono";
const TIPOS_LINEA = new Set(["Nequi", "Daviplata", "Transferencia"]);

export interface MediosPagoVentaGuardados {
  efectivo: number;
  tarjeta: number;
  pagosLinea: number;
  otros: number;
  detalleLineas: { tipo: string; monto: number }[];
}

export function mediosPagoDesdeDetalle(d: DetallePagoParaMedios): MediosPagoVentaGuardados {
  let tarjeta = 0;
  let pagosLinea = 0;
  let otros = 0;
  for (const p of d.pagosLinea) {
    const t = p.tipo.trim();
    const m = Math.round(p.monto * 100) / 100;
    if (t === TIPO_DATAFONO) tarjeta += m;
    else if (TIPOS_LINEA.has(t)) pagosLinea += m;
    else otros += m;
  }
  return {
    efectivo: Math.round(d.efectivo * 100) / 100,
    tarjeta: Math.round(tarjeta * 100) / 100,
    pagosLinea: Math.round(pagosLinea * 100) / 100,
    otros: Math.round(otros * 100) / 100,
    detalleLineas: d.pagosLinea.map((p) => ({
      tipo: p.tipo.trim() || "—",
      monto: Math.round(p.monto * 100) / 100,
    })),
  };
}

export function sumarMediosPagoVentas(rows: MediosPagoVentaGuardados[]): MediosPagoVentaGuardados {
  const acc: MediosPagoVentaGuardados = {
    efectivo: 0,
    tarjeta: 0,
    pagosLinea: 0,
    otros: 0,
    detalleLineas: [],
  };
  for (const r of rows) {
    acc.efectivo += r.efectivo;
    acc.tarjeta += r.tarjeta;
    acc.pagosLinea += r.pagosLinea;
    acc.otros += r.otros;
    acc.detalleLineas.push(...r.detalleLineas);
  }
  acc.efectivo = Math.round(acc.efectivo * 100) / 100;
  acc.tarjeta = Math.round(acc.tarjeta * 100) / 100;
  acc.pagosLinea = Math.round(acc.pagosLinea * 100) / 100;
  acc.otros = Math.round(acc.otros * 100) / 100;
  return acc;
}
