import { fechaHoraColombia } from "@/lib/fecha-colombia";
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

function resumenDiferencia(diferencia: number): string {
  if (diferencia > 0) return `Diferencia positiva frente al sistema: $ ${fmtCop(diferencia)}`;
  if (diferencia < 0) return `Diferencia negativa frente al sistema: $ ${fmtCop(Math.abs(diferencia))}`;
  return "Sin diferencias frente a la referencia del sistema.";
}

export function textoResumenCorreoCierreTurno(t: TurnoCerradoV1): string {
  const c = t.cierre;
  return [
    "Hola,",
    "",
    "Adjuntamos el PDF con el detalle completo del cierre de turno.",
    "",
    `Punto de venta: ${t.puntoVenta}`,
    `Cajero: ${t.cajero.nombreDisplay}`,
    `Turno: ${t.turnoSesionId}`,
    `Apertura: ${fmtFecha(t.inicioIso)}`,
    `Cierre: ${fmtFecha(t.cierreIso)}`,
    `Tickets: ${t.numTickets}`,
    `Total ventas registradas: $ ${fmtCop(t.totalVentasRegistradas)}`,
    `Total cierre calculado: $ ${fmtCop(c.totalIngresado)}`,
    `Total referencia sistema / WMS: $ ${fmtCop(c.totalEsperado)}`,
    `Diferencia frente al sistema: $ ${fmtCop(c.diferencia)}`,
    resumenDiferencia(c.diferencia),
    "",
    "En el adjunto encontrarás el detalle completo por productos y tickets del turno.",
    "",
    "Maria Chorizos POS",
  ].join("\n");
}
