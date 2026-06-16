import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { LOGO_ORG_URL } from "@/lib/brand";
import { fechaColombia, fechaHoraColombia, mediodiaColombiaDesdeYmd } from "@/lib/fecha-colombia";
import { formatoMonedaCop } from "@/lib/pdf-documento-ventas";
import {
  etiquetaNivelDetalle,
  nombreArchivoReporteVentasPdf,
  periodoLegibleReporteVentas,
  type DatosReporteVentasPos,
} from "@/lib/ventas-reporte-pos-data";

type JsPdfConAutoTable = jsPDF & { lastAutoTable?: { finalY: number } };

const BRAND_GOLD: [number, number, number] = [255, 200, 28];
const BRAND_GREEN: [number, number, number] = [15, 90, 60];
const BRAND_DARK: [number, number, number] = [18, 16, 12];

async function logoDataUrlAbsoluta(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const url = `${window.location.origin}${LOGO_ORG_URL}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(new Error("read"));
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function medidasLogoEnMm(
  dataUrl: string,
  maxAnchoMm: number,
  maxAltoMm: number
): Promise<{ ancho: number; alto: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const nw = img.naturalWidth;
      const nh = img.naturalHeight;
      if (!nw || !nh) {
        resolve({ ancho: maxAnchoMm, alto: maxAltoMm });
        return;
      }
      const proporcion = nw / nh;
      let ancho = maxAnchoMm;
      let alto = ancho / proporcion;
      if (alto > maxAltoMm) {
        alto = maxAltoMm;
        ancho = alto * proporcion;
      }
      resolve({ ancho, alto });
    };
    img.onerror = () => resolve({ ancho: maxAnchoMm, alto: maxAltoMm });
    img.src = dataUrl;
  });
}

function pintarCabeceraPremium(doc: jsPDF, d: DatosReporteVentasPos, margin: number): Promise<number> {
  const pageW = doc.internal.pageSize.getWidth();
  const bandH = 38;
  doc.setFillColor(...BRAND_DARK);
  doc.rect(0, 0, pageW, bandH, "F");
  doc.setFillColor(...BRAND_GOLD);
  doc.rect(0, bandH - 1.2, pageW, 1.2, "F");

  return logoDataUrlAbsoluta().then((logo) => {
    if (logo) {
      return medidasLogoEnMm(logo, 40, 16).then(({ ancho, alto }) => {
        try {
          const formato =
            logo.startsWith("data:image/jpeg") || logo.startsWith("data:image/jpg") ? "JPEG" : "PNG";
          doc.addImage(logo, formato, margin, 8, ancho, alto);
        } catch {
          /* ignore */
        }
        return bandH + 6;
      });
    }
    return bandH + 6;
  });
}

function escribirMetaBajoBanda(doc: jsPDF, d: DatosReporteVentasPos, margin: number, yStart: number): number {
  const pageW = doc.internal.pageSize.getWidth();
  let y = yStart;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(...BRAND_GREEN);
  doc.text("Reporte de ventas — POS Premium", margin, y);
  y += 7;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(50, 50, 50);
  const meta = [
    `Punto de venta: ${d.puntoVenta}`,
    `Período: ${periodoLegibleReporteVentas(d)}`,
    `Filtro: ${d.filtroTabLabel}`,
    `Detalle: ${etiquetaNivelDetalle(d.nivel)}`,
    `Generado: ${fechaHoraColombia(new Date(d.generadoIso))}`,
  ];
  for (const line of meta) {
    doc.text(line, margin, y);
    y += 4.2;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(30, 30, 30);
  doc.text("Indicadores del período", margin, y + 2);
  y += 8;

  const kpiBody = [
    ["Documentos", String(d.cantidadDocumentos)],
    ["Total ventas vigentes", formatoMonedaCop(d.totalVigente)],
    ["Ticket promedio", formatoMonedaCop(d.cantidadDocumentos - d.cantidadAnuladas > 0 ? d.totalVigente / (d.cantidadDocumentos - d.cantidadAnuladas) : 0)],
  ];
  if (d.cantidadAnuladas > 0) {
    kpiBody.push(["Anuladas (referencia)", `${d.cantidadAnuladas} · ${formatoMonedaCop(d.totalAnulado)}`]);
  }

  autoTable(doc, {
    startY: y,
    body: kpiBody,
    theme: "plain",
    styles: { fontSize: 9, cellPadding: 2.5 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 62 }, 1: { halign: "right" } },
    margin: { left: margin, right: margin },
  });

  const docAt = doc as JsPdfConAutoTable;
  return (docAt.lastAutoTable?.finalY ?? y) + 8;
}

export type OpcionesPdfReporteVentas = {
  /** Omite detalle por documento y acota tablas (envío por correo). */
  paraCorreo?: boolean;
  notaAdaptacionCorreo?: string;
};

/**
 * Genera el PDF premium del reporte de ventas (solo cliente).
 */
export async function crearPdfReporteVentasPos(
  d: DatosReporteVentasPos,
  opts?: OpcionesPdfReporteVentas
): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const margin = 14;
  const pageH = doc.internal.pageSize.getHeight();
  const docAt = doc as JsPdfConAutoTable;

  let y = await pintarCabeceraPremium(doc, d, margin);
  y = escribirMetaBajoBanda(doc, d, margin, y);

  if (d.porTipo.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [["Tipo de documento", "Cantidad", "Total vigente"]],
      body: d.porTipo.map((t) => [t.tipo, String(t.cantidad), formatoMonedaCop(t.total)]),
      headStyles: { fillColor: BRAND_GREEN, fontSize: 8 },
      styles: { fontSize: 8, cellPadding: 2 },
      columnStyles: { 2: { halign: "right" } },
      margin: { left: margin, right: margin },
    });
    y = (docAt.lastAutoTable?.finalY ?? y) + 6;
  }

  if (d.porDia.length > 0 && d.nivel !== "resumen") {
    autoTable(doc, {
      startY: y,
      head: [["Día", "Documentos", "Total"]],
      body: d.porDia.map((dia) => [dia.fechaLabel, String(dia.cantidad), formatoMonedaCop(dia.total)]),
      headStyles: { fillColor: [40, 40, 40], fontSize: 8 },
      styles: { fontSize: 8, cellPadding: 2 },
      columnStyles: { 2: { halign: "right" } },
      margin: { left: margin, right: margin },
    });
    y = (docAt.lastAutoTable?.finalY ?? y) + 6;
  }

  const maxFilasTx =
    opts?.paraCorreo && d.transacciones.length > 100 ? 100 : d.transacciones.length;
  const transaccionesPdf = d.transacciones.slice(0, maxFilasTx);

  if (transaccionesPdf.length > 0) {
    if (y > pageH - 50) {
      doc.addPage();
      y = margin;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...BRAND_GREEN);
    doc.text("Listado de documentos", margin, y);
    y += 5;
    if (maxFilasTx < d.transacciones.length) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(7);
      doc.setTextColor(100, 100, 100);
      doc.text(
        `Mostrando ${maxFilasTx} de ${d.transacciones.length} documentos (versión para correo).`,
        margin,
        y
      );
      y += 4;
    }

    autoTable(doc, {
      startY: y,
      head: [["Fecha", "Comprobante", "Tipo", "Cliente", "Medio de pago", "Total"]],
      body: transaccionesPdf.map((t) => [
        t.fechaLabel,
        t.comprobante.length > 22 ? `${t.comprobante.slice(0, 19)}…` : t.comprobante,
        t.tipoLabel.length > 28 ? `${t.tipoLabel.slice(0, 25)}…` : t.tipoLabel,
        t.cliente.length > 28 ? `${t.cliente.slice(0, 25)}…` : t.cliente,
        (t.medioPagoDetalle || t.medioPago).length > 36
          ? `${(t.medioPagoDetalle || t.medioPago).slice(0, 33)}…`
          : t.medioPagoDetalle || t.medioPago,
        t.anulada ? `${formatoMonedaCop(t.total)} (anul.)` : formatoMonedaCop(t.total),
      ]),
      headStyles: { fillColor: BRAND_GREEN, fontSize: 7 },
      styles: { fontSize: 7, cellPadding: 1.8, overflow: "linebreak" },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 24 },
        4: { cellWidth: 32 },
        5: { halign: "right", cellWidth: 24 },
      },
      margin: { left: margin, right: margin },
      didParseCell: (data) => {
        if (data.section === "body" && transaccionesPdf[data.row.index]?.anulada) {
          data.cell.styles.textColor = [180, 40, 40];
        }
      },
    });
    y = (docAt.lastAutoTable?.finalY ?? y) + 6;
  }

  const productosPdf =
    opts?.paraCorreo && d.productosAgregados.length > 80
      ? d.productosAgregados.slice(0, 80)
      : d.productosAgregados;

  if (productosPdf.length > 0) {
    if (y > pageH - 50) {
      doc.addPage();
      y = margin;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...BRAND_GREEN);
    doc.text("Productos vendidos (consolidado)", margin, y);
    y += 5;
    if (productosPdf.length < d.productosAgregados.length) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(7);
      doc.setTextColor(100, 100, 100);
      doc.text(`Top ${productosPdf.length} productos por ventas (versión para correo).`, margin, y);
      y += 4;
    }

    autoTable(doc, {
      startY: y,
      head: [["SKU", "Producto", "Cant.", "Total"]],
      body: productosPdf.map((p) => [
        p.sku || "—",
        p.descripcion.length > 48 ? `${p.descripcion.slice(0, 45)}…` : p.descripcion,
        String(p.cantidad),
        formatoMonedaCop(p.total),
      ]),
      headStyles: { fillColor: BRAND_DARK, fontSize: 8 },
      styles: { fontSize: 8, cellPadding: 2 },
      columnStyles: { 2: { halign: "center", cellWidth: 14 }, 3: { halign: "right", cellWidth: 28 } },
      margin: { left: margin, right: margin },
    });
    y = (docAt.lastAutoTable?.finalY ?? y) + 6;
  }

  if (!opts?.paraCorreo && d.detallePorVenta.length > 0) {
    doc.addPage();
    y = margin;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...BRAND_GREEN);
    doc.text("Detalle por documento", margin, y);
    y += 6;

    for (const venta of d.detallePorVenta) {
      if (y > pageH - 35) {
        doc.addPage();
        y = margin;
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(40, 40, 40);
      doc.text(
        `${venta.comprobante} · ${venta.fechaLabel} · ${formatoMonedaCop(venta.total)}`,
        margin,
        y
      );
      y += 3.5;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(90, 90, 90);
      const cli = venta.cliente.length > 70 ? `${venta.cliente.slice(0, 67)}…` : venta.cliente;
      doc.text(cli, margin, y);
      y += 3.5;
      if (venta.medioPagoDetalle && venta.medioPagoDetalle !== "—") {
        const mp =
          venta.medioPagoDetalle.length > 95
            ? `${venta.medioPagoDetalle.slice(0, 92)}…`
            : venta.medioPagoDetalle;
        doc.text(`Medio de pago: ${mp}`, margin, y);
        y += 4;
      } else {
        y += 0.5;
      }

      autoTable(doc, {
        startY: y,
        head: [["Producto", "Cant.", "Subtotal"]],
        body: venta.lineas.map((l) => [
          l.descripcion.length > 55 ? `${l.descripcion.slice(0, 52)}…` : l.descripcion,
          String(l.cantidad),
          formatoMonedaCop(l.subtotal),
        ]),
        theme: "striped",
        headStyles: { fillColor: [230, 230, 230], textColor: [40, 40, 40], fontSize: 7 },
        styles: { fontSize: 7, cellPadding: 1.5 },
        columnStyles: { 1: { halign: "center", cellWidth: 16 }, 2: { halign: "right", cellWidth: 28 } },
        margin: { left: margin, right: margin },
      });
      y = (docAt.lastAutoTable?.finalY ?? y) + 5;
    }
  }

  if (opts?.notaAdaptacionCorreo?.trim()) {
    const pageW = doc.internal.pageSize.getWidth();
    let ny = pageH - 18;
    if (ny < margin + 10) {
      doc.addPage();
      ny = pageH - 18;
    }
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.setTextColor(90, 90, 90);
    const split = doc.splitTextToSize(opts.notaAdaptacionCorreo.trim(), pageW - margin * 2);
    doc.text(split, margin, ny);
  }

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    const pageW = doc.internal.pageSize.getWidth();
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.setTextColor(130, 130, 130);
    doc.text(
      `Maria Chorizos POS · Reporte premium · Pág. ${i} de ${totalPages}`,
      pageW / 2,
      pageH - 8,
      { align: "center" }
    );
  }

  return doc;
}

export async function descargarPdfReporteVentasPos(d: DatosReporteVentasPos): Promise<void> {
  const doc = await crearPdfReporteVentasPos(d);
  doc.save(nombreArchivoReporteVentasPdf(d));
}

export async function pdfReporteVentasBase64(
  d: DatosReporteVentasPos,
  opts?: OpcionesPdfReporteVentas
): Promise<string> {
  const doc = await crearPdfReporteVentasPos(d, opts);
  return doc.output("datauristring").split(",", 2)[1] || "";
}
