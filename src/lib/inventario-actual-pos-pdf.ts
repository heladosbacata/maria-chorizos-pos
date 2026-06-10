import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { LOGO_ORG_URL } from "@/lib/brand";
import { fechaHoraColombia } from "@/lib/fecha-colombia";
import {
  nombreArchivoInformeInventarioActualPdf,
  type DatosInformeInventarioActual,
} from "@/lib/inventario-actual-pos-data";
import { formatoMonedaCop } from "@/lib/pdf-documento-ventas";

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

async function pintarCabecera(doc: jsPDF, margin: number): Promise<number> {
  const pageW = doc.internal.pageSize.getWidth();
  const bandH = 34;
  doc.setFillColor(...BRAND_DARK);
  doc.rect(0, 0, pageW, bandH, "F");
  doc.setFillColor(...BRAND_GOLD);
  doc.rect(0, bandH - 1.2, pageW, 1.2, "F");

  const logo = await logoDataUrlAbsoluta();
  if (logo) {
    try {
      const { ancho, alto } = await medidasLogoEnMm(logo, 36, 14);
      const formato = logo.startsWith("data:image/jpeg") || logo.startsWith("data:image/jpg") ? "JPEG" : "PNG";
      doc.addImage(logo, formato, margin, 7, ancho, alto);
    } catch {
      /* ignore */
    }
  }
  return bandH + 6;
}

function etiquetaFuenteCatalogo(fuente: DatosInformeInventarioActual["fuenteCatalogo"]): string {
  if (fuente === "sheet") return "Hoja Google (DB_Franquicia_Insumos_Kit)";
  if (fuente === "firestore") return "Firestore";
  return "—";
}

export async function crearPdfInformeInventarioActual(d: DatosInformeInventarioActual): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" }) as JsPdfConAutoTable;
  const margin = 14;
  let y = await pintarCabecera(doc, margin);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...BRAND_GREEN);
  doc.text("Inventario actual — punto de venta", margin, y);
  y += 7;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(50, 50, 50);
  const meta = [
    `Punto de venta: ${d.puntoVenta}`,
    `Generado: ${fechaHoraColombia(new Date(d.generadoIso), { dateStyle: "long", timeStyle: "medium" })}`,
    `Catálogo: ${etiquetaFuenteCatalogo(d.fuenteCatalogo)}`,
  ];
  for (const line of meta) {
    doc.text(line, margin, y);
    y += 4.2;
  }
  y += 2;

  const r = d.resumen;
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Indicador", "Valor"]],
    body: [
      ["Productos en catálogo", String(r.productosCatalogo)],
      ["Productos con saldo > 0", String(r.productosConSaldo)],
      ["Total unidades en stock", r.totalUnidades.toLocaleString("es-CO", { maximumFractionDigits: 3 })],
      ["Valor total en stock", formatoMonedaCop(r.totalValorStock)],
    ],
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: BRAND_GREEN, textColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });
  y = (doc.lastAutoTable?.finalY ?? y) + 6;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...BRAND_DARK);
  doc.text("Detalle por producto", margin, y);
  y += 2;

  const body = d.filas.map((f) => [
    f.sku,
    f.descripcion.slice(0, 48),
    f.unidad,
    f.saldo.toLocaleString("es-CO", { maximumFractionDigits: 3 }),
    f.precioCompra != null ? formatoMonedaCop(f.precioCompra) : "—",
    f.valorStock != null ? formatoMonedaCop(f.valorStock) : "—",
  ]);

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Código", "Descripción", "Unidad", "Saldo", "Precio compra", "Valor stock"]],
    body,
    styles: { fontSize: 7, cellPadding: 1.6, overflow: "linebreak" },
    headStyles: { fillColor: BRAND_GREEN, fontSize: 7 },
    columnStyles: {
      0: { cellWidth: 18 },
      1: { cellWidth: 52 },
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right" },
    },
  });

  const pageH = doc.internal.pageSize.getHeight();
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    const pageW = doc.internal.pageSize.getWidth();
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.setTextColor(130, 130, 130);
    doc.text(
      `Maria Chorizos POS · Inventario actual · Pág. ${i} de ${totalPages}`,
      pageW / 2,
      pageH - 8,
      { align: "center" }
    );
  }

  return doc;
}

export async function descargarPdfInformeInventarioActual(d: DatosInformeInventarioActual): Promise<void> {
  const doc = await crearPdfInformeInventarioActual(d);
  doc.save(nombreArchivoInformeInventarioActualPdf(d));
}

export async function pdfInformeInventarioActualBase64(d: DatosInformeInventarioActual): Promise<string> {
  const doc = await crearPdfInformeInventarioActual(d);
  return doc.output("datauristring").split(",", 2)[1] || "";
}
