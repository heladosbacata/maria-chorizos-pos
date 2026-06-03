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

/**
 * Ajusta medios para que no superen el total de la venta cuando hubo cambio.
 * Regla: el excedente se descuenta primero de efectivo (cambio entregado).
 */
const fmtCopMedio = (n: number) =>
  n.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

/** Etiquetas cortas y detalle con montos para reportes / tabla de ventas. */
export function etiquetasMediosPagoVenta(
  medios?: MediosPagoVentaGuardados | null,
  pagoResumen?: string | null
): { corto: string; detalle: string } {
  if (medios) {
    const tipos = new Set<string>();
    const partes: string[] = [];
    if (medios.efectivo > 0.009) {
      tipos.add("Efectivo");
      partes.push(`Efectivo ${fmtCopMedio(medios.efectivo)}`);
    }
    if (medios.tarjeta > 0.009) {
      tipos.add("Datáfono");
      partes.push(`Datáfono ${fmtCopMedio(medios.tarjeta)}`);
    }
    for (const d of medios.detalleLineas ?? []) {
      if (d.monto <= 0.009) continue;
      const t = d.tipo.trim() || "Otro";
      tipos.add(t);
      partes.push(`${t} ${fmtCopMedio(d.monto)}`);
    }
    if (medios.otros > 0.009) {
      tipos.add("Otro");
      partes.push(`Otro ${fmtCopMedio(medios.otros)}`);
    }
    if (tipos.size > 0) {
      return {
        corto: Array.from(tipos).join(", "),
        detalle: partes.join(" · "),
      };
    }
  }
  const resumen = pagoResumen?.trim();
  if (resumen) {
    const unaLinea = resumen.replace(/\s+/g, " ").slice(0, 120);
    return { corto: unaLinea.length > 56 ? `${unaLinea.slice(0, 53)}…` : unaLinea, detalle: resumen };
  }
  return { corto: "—", detalle: "Sin registro de medio de pago" };
}

export function normalizarMediosPagoVenta(
  medios: MediosPagoVentaGuardados,
  totalVenta: number
): MediosPagoVentaGuardados {
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const efectivo = round2(medios.efectivo);
  const tarjeta = round2(medios.tarjeta);
  const pagosLinea = round2(medios.pagosLinea);
  const otros = round2(medios.otros);
  const total = round2(efectivo + tarjeta + pagosLinea + otros);
  const totalObjetivo = round2(totalVenta);
  const excedente = round2(total - totalObjetivo);
  if (excedente <= 0.009) {
    return {
      ...medios,
      efectivo,
      tarjeta,
      pagosLinea,
      otros,
    };
  }
  const efectivoNeto = round2(Math.max(0, efectivo - excedente));
  return {
    ...medios,
    efectivo: efectivoNeto,
    tarjeta,
    pagosLinea,
    otros,
  };
}
