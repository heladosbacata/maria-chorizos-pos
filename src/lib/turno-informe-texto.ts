import { fechaHoraColombia, ymdColombia } from "@/lib/fecha-colombia";
import type { AgregadoProductoDia } from "@/lib/pos-ventas-local-storage";
import type { MediosPagoVentaGuardados } from "@/lib/medios-pago-venta";
import type { TurnoCerradoV1 } from "@/lib/turno-historial-local";

function fmtCop(n: number): string {
  return n.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtFecha(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return fechaHoraColombia(d, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function textoInformeTurno(t: TurnoCerradoV1): string {
  const lines: string[] = [];
  lines.push("INFORME DE CIERRE DE TURNO — Maria Chorizos POS");
  lines.push("");
  lines.push(`Punto de venta: ${t.puntoVenta}`);
  lines.push(`Turno ID: ${t.turnoSesionId}`);
  lines.push(`Apertura: ${fmtFecha(t.inicioIso)}`);
  lines.push(`Cierre: ${fmtFecha(t.cierreIso)}`);
  lines.push(`Cajero: ${t.cajero.nombreDisplay}`);
  if (t.emailSesion?.trim()) lines.push(`Sesión (cuenta): ${t.emailSesion.trim()}`);
  lines.push(`Base inicial caja: $ ${fmtCop(t.baseInicialCaja)}`);
  lines.push("");
  lines.push("--- Resumen ventas registradas (tickets) ---");
  lines.push(`Tickets: ${t.numTickets}`);
  lines.push(`Total ventas: $ ${fmtCop(t.totalVentasRegistradas)}`);
  lines.push(`Ventas a crédito (referencia): $ ${fmtCop(t.ventasCredito)}`);
  lines.push("");
  lines.push("--- Medios de pago (suma por ticket) ---");
  const m = t.totalesMediosVentas;
  lines.push(`Efectivo: $ ${fmtCop(m.efectivo)}`);
  lines.push(`Tarjeta / datáfono: $ ${fmtCop(m.tarjeta)}`);
  lines.push(`Pagos en línea (Nequi, Daviplata, transferencia): $ ${fmtCop(m.pagosLinea)}`);
  lines.push(`Otros medios: $ ${fmtCop(m.otros)}`);
  lines.push("");
  lines.push("--- Cierre (valores según tickets + base en esta caja) ---");
  const c = t.cierre;
  lines.push(`Efectivo en caja (base + ventas efectivo): $ ${fmtCop(c.efectivoReal)}`);
  lines.push(`Tarjeta / datáfono: $ ${fmtCop(c.tarjeta)}`);
  lines.push(`Pagos en línea: $ ${fmtCop(c.pagosLinea)}`);
  lines.push(`Otros medios: $ ${fmtCop(c.otrosMedios)}`);
  lines.push(`Total ingresado (cierre): $ ${fmtCop(c.totalIngresado)}`);
  lines.push(`Total esperado: $ ${fmtCop(c.totalEsperado)}`);
  lines.push(`Diferencia: $ ${fmtCop(c.diferencia)}`);
  lines.push("");
  lines.push("--- Ingresos / retiros efectivo (turno) ---");
  lines.push(`Ingreso efectivo: $ ${fmtCop(t.totalIngresoEfectivo)}`);
  lines.push(`Retiro efectivo: $ ${fmtCop(t.totalRetiroEfectivo)}`);
  lines.push("");
  lines.push("--- Pre-cuentas anuladas ---");
  lines.push(`Pre-cuentas eliminadas: ${t.metricsPrecuentas.precuentasEliminadas}`);
  lines.push(`Productos eliminados: ${t.metricsPrecuentas.productosEliminados}`);
  lines.push(`Valor productos eliminados: $ ${fmtCop(t.metricsPrecuentas.valorProductosEliminados)}`);
  lines.push("");
  lines.push("--- Detalle por producto (turno) ---");
  for (const p of t.agregadoProductos) {
    lines.push(
      `${p.descripcion} | cant. ${p.cantidad} | subtotal $ ${fmtCop(p.subtotal)} | SKU ${p.sku}`
    );
  }
  lines.push("");
  lines.push("--- Tickets (líneas) ---");
  for (const v of t.ventas) {
    lines.push(`Ticket ${v.id} · ${fmtFecha(v.isoTimestamp)} · Total $ ${fmtCop(v.total)}`);
    if (v.pagoResumen?.trim()) lines.push(`  ${v.pagoResumen.trim().replace(/\n/g, " ")}`);
    for (const li of v.lineas) {
      const det = li.detalleVariante ? ` (${li.detalleVariante})` : "";
      lines.push(
        `  · ${li.descripcion}${det} × ${li.cantidad} @ $ ${fmtCop(li.precioUnitario)} → $ ${fmtCop(li.precioUnitario * li.cantidad)}`
      );
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function csvAgregadoProductos(rows: AgregadoProductoDia[]): string {
  const header = "descripcion;sku;cantidad;subtotal";
  const body = rows.map(
    (r) =>
      `"${r.descripcion.replace(/"/g, '""')}";"${r.sku}";${r.cantidad};${r.subtotal.toFixed(2)}`
  );
  return [header, ...body].join("\n");
}

export function nombreArchivoInformeTurno(t: TurnoCerradoV1): string {
  const d = new Date(t.cierreIso);
  const ymd = Number.isNaN(d.getTime()) ? "turno" : ymdColombia(d);
  const safePv = t.puntoVenta.replace(/[^\w\-]+/g, "_").slice(0, 40);
  return `informe-turno_${safePv}_${ymd}_${t.id.slice(0, 8)}.txt`;
}

export function triggerDescargaTexto(nombre: string, contenido: string): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([contenido], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
