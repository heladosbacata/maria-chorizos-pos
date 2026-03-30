import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { fechaHoraColombia } from "@/lib/fecha-colombia";
import type { TurnoCerradoV1 } from "@/lib/turno-historial-local";
import { nombreArchivoInformeTurno } from "@/lib/turno-informe-texto";

type JsPdfConAutoTable = jsPDF & { lastAutoTable?: { finalY: number } };

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

function nombreArchivoPdf(t: TurnoCerradoV1): string {
  return nombreArchivoInformeTurno(t).replace(/\.txt$/i, ".pdf");
}

/**
 * Genera el PDF del informe de cierre (mismo contenido que el TXT, maquetado en A4).
 * Solo usar en el cliente.
 */
export function crearPdfInformeTurno(t: TurnoCerradoV1): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  const anchoUtil = pageW - margin * 2;
  let y = margin;

  const asegurarEspacio = (altoMm: number) => {
    if (y + altoMm > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  };

  const docAt = doc as JsPdfConAutoTable;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(25, 25, 25);
  doc.text("Informe de cierre de turno — Maria Chorizos POS", margin, y);
  y += 7;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(50, 50, 50);
  const cab: string[] = [
    `Punto de venta: ${t.puntoVenta}`,
    `Turno ID: ${t.turnoSesionId}`,
    `Apertura: ${fmtFecha(t.inicioIso)}`,
    `Cierre: ${fmtFecha(t.cierreIso)}`,
    `Cajero: ${t.cajero.nombreDisplay}`,
  ];
  if (t.emailSesion?.trim()) cab.push(`Sesion (cuenta): ${t.emailSesion.trim()}`);
  cab.push(`Base inicial caja: $ ${fmtCop(t.baseInicialCaja)}`);
  for (const line of cab) {
    asegurarEspacio(5);
    doc.text(line, margin, y);
    y += 4.2;
  }
  y += 3;

  autoTable(doc, {
    startY: y,
    head: [["Resumen (tickets)", ""]],
    body: [
      ["Tickets", String(t.numTickets)],
      ["Total ventas", `$ ${fmtCop(t.totalVentasRegistradas)}`],
      ["Ventas a credito (referencia)", `$ ${fmtCop(t.ventasCredito)}`],
    ],
    theme: "striped",
    headStyles: { fillColor: [41, 98, 180], fontSize: 9 },
    styles: { fontSize: 8, cellPadding: 2 },
    columnStyles: { 0: { cellWidth: 75 }, 1: { halign: "right" } },
    margin: { left: margin, right: margin },
  });
  y = (docAt.lastAutoTable?.finalY ?? y) + 6;

  const m = t.totalesMediosVentas;
  autoTable(doc, {
    startY: y,
    head: [["Medios de pago (suma por ticket)", ""]],
    body: [
      ["Efectivo", `$ ${fmtCop(m.efectivo)}`],
      ["Tarjeta / datáfono", `$ ${fmtCop(m.tarjeta)}`],
      ["Pagos en linea", `$ ${fmtCop(m.pagosLinea)}`],
      ["Otros medios", `$ ${fmtCop(m.otros)}`],
    ],
    theme: "striped",
    headStyles: { fillColor: [41, 98, 180], fontSize: 9 },
    styles: { fontSize: 8, cellPadding: 2 },
    columnStyles: { 0: { cellWidth: 75 }, 1: { halign: "right" } },
    margin: { left: margin, right: margin },
  });
  y = (docAt.lastAutoTable?.finalY ?? y) + 6;

  const c = t.cierre;
  autoTable(doc, {
    startY: y,
    head: [["Cierre (tickets + base)", ""]],
    body: [
      ["Efectivo (base + ventas efectivo)", `$ ${fmtCop(c.efectivoReal)}`],
      ["Tarjeta / datáfono", `$ ${fmtCop(c.tarjeta)}`],
      ["Pagos en línea", `$ ${fmtCop(c.pagosLinea)}`],
      ["Otros medios", `$ ${fmtCop(c.otrosMedios)}`],
      ["Total ingresado (cierre)", `$ ${fmtCop(c.totalIngresado)}`],
      ["Total esperado", `$ ${fmtCop(c.totalEsperado)}`],
      ["Diferencia", `$ ${fmtCop(c.diferencia)}`],
    ],
    theme: "striped",
    headStyles: { fillColor: [41, 98, 180], fontSize: 9 },
    styles: { fontSize: 8, cellPadding: 2 },
    columnStyles: { 0: { cellWidth: 75 }, 1: { halign: "right" } },
    margin: { left: margin, right: margin },
  });
  y = (docAt.lastAutoTable?.finalY ?? y) + 6;

  autoTable(doc, {
    startY: y,
    head: [["Ingresos / retiros efectivo (turno)", ""]],
    body: [
      ["Ingreso efectivo", `$ ${fmtCop(t.totalIngresoEfectivo)}`],
      ["Retiro efectivo", `$ ${fmtCop(t.totalRetiroEfectivo)}`],
    ],
    theme: "striped",
    headStyles: { fillColor: [41, 98, 180], fontSize: 9 },
    styles: { fontSize: 8, cellPadding: 2 },
    columnStyles: { 0: { cellWidth: 75 }, 1: { halign: "right" } },
    margin: { left: margin, right: margin },
  });
  y = (docAt.lastAutoTable?.finalY ?? y) + 6;

  autoTable(doc, {
    startY: y,
    head: [["Pre-cuentas anuladas", ""]],
    body: [
      ["Pre-cuentas eliminadas", String(t.metricsPrecuentas.precuentasEliminadas)],
      ["Productos eliminados", String(t.metricsPrecuentas.productosEliminados)],
      ["Valor productos eliminados", `$ ${fmtCop(t.metricsPrecuentas.valorProductosEliminados)}`],
    ],
    theme: "striped",
    headStyles: { fillColor: [41, 98, 180], fontSize: 9 },
    styles: { fontSize: 8, cellPadding: 2 },
    columnStyles: { 0: { cellWidth: 75 }, 1: { halign: "right" } },
    margin: { left: margin, right: margin },
  });
  y = (docAt.lastAutoTable?.finalY ?? y) + 8;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  asegurarEspacio(8);
  doc.text("Detalle por producto (turno)", margin, y);
  y += 5;

  const filasProd = t.agregadoProductos.map((p) => [
    p.descripcion.length > 42 ? `${p.descripcion.slice(0, 40)}…` : p.descripcion,
    String(p.cantidad),
    `$ ${fmtCop(p.subtotal)}`,
    p.sku,
  ]);
  autoTable(doc, {
    startY: y,
    head: [["Descripcion", "Cant.", "Subtotal", "SKU"]],
    body: filasProd.length ? filasProd : [["—", "0", "$ 0,00", "—"]],
    theme: "striped",
    headStyles: { fillColor: [41, 98, 180], fontSize: 8 },
    styles: { fontSize: 7, cellPadding: 1.5, overflow: "linebreak" },
    columnStyles: {
      0: { cellWidth: 72 },
      1: { cellWidth: 16, halign: "center" },
      2: { cellWidth: 28, halign: "right" },
      3: { cellWidth: 24 },
    },
    margin: { left: margin, right: margin },
  });
  y = (docAt.lastAutoTable?.finalY ?? y) + 8;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  asegurarEspacio(8);
  doc.text("Tickets (lineas)", margin, y);
  y += 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(45, 45, 45);

  for (const v of t.ventas) {
    const lineasTicket: string[] = [
      `Ticket ${v.id} · ${fmtFecha(v.isoTimestamp)} · Total $ ${fmtCop(v.total)}`,
    ];
    if (v.pagoResumen?.trim()) {
      lineasTicket.push(v.pagoResumen.trim().replace(/\n/g, " "));
    }
    for (const li of v.lineas) {
      const det = li.detalleVariante ? ` (${li.detalleVariante})` : "";
      lineasTicket.push(
        `  · ${li.descripcion}${det} x ${li.cantidad} @ $ ${fmtCop(li.precioUnitario)} -> $ ${fmtCop(li.precioUnitario * li.cantidad)}`
      );
    }
    const bloque = lineasTicket.join("\n");
    const wrapped = doc.splitTextToSize(bloque, anchoUtil);
    const alto = wrapped.length * 3.2 + 3;
    asegurarEspacio(alto);
    doc.text(wrapped, margin, y);
    y += alto;
  }

  return doc;
}

export function descargarInformeTurnoPdf(t: TurnoCerradoV1): void {
  if (typeof window === "undefined") return;
  const doc = crearPdfInformeTurno(t);
  doc.save(nombreArchivoPdf(t));
}
