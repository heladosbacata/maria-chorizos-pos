import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { LOGO_ORG_URL } from "@/lib/brand";
import { fechaHoraColombia } from "@/lib/fecha-colombia";
import {
  etiquetaFuenteCatalogoAuditoria,
  etiquetaFuenteSaldo,
  etiquetaSeveridad,
  nombreArchivoAuditoriaInventarioPdf,
  type DatosAuditoriaInventarioPos,
  type FilaAuditoriaInventarioProducto,
} from "@/lib/inventario-auditoria-pos-data";

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

function asegurarEspacio(doc: JsPdfConAutoTable, y: number, necesario: number, margin: number): number {
  const pageH = doc.internal.pageSize.getHeight();
  if (y + necesario > pageH - 14) {
    doc.addPage();
    return margin + 8;
  }
  return y;
}

function resumenCeldas(d: DatosAuditoriaInventarioPos): string[][] {
  const r = d.resumen;
  return [
    ["Productos en catálogo", String(r.productosCatalogo)],
    ["Con saldo ≠ 0", String(r.conSaldo)],
    ["Saldo negativo", String(r.saldoNegativo)],
    ["Grupos duplicados (catálogo crudo)", String(r.duplicadosCatalogo)],
    ["Grupos descripción similar", String(r.descripcionesSimilares)],
    ["Desajuste saldo legacy", String(r.desajusteLegacy)],
    ["Desajuste saldo ensamble", String(r.desajusteEnsamble)],
    ["Solo WMS ensamble (sin legacy)", String(r.soloEnsambleSinLegacy)],
    ["Hallazgos críticos", String(r.criticos)],
    ["Advertencias", String(r.advertencias)],
  ];
}

function filaDetalleProducto(p: FilaAuditoriaInventarioProducto): string[] {
  const hall = p.hallazgos.length ? p.hallazgos.join("; ") : "—";
  const rec = p.recomendaciones.length ? p.recomendaciones[0] : "—";
  return [
    p.sku.slice(0, 22),
    p.descripcion.slice(0, 36),
    etiquetaSeveridad(p.severidad),
    String(p.saldoMostrado),
    p.saldoLegacy != null ? String(p.saldoLegacy) : "—",
    p.saldoEnsamble != null ? String(p.saldoEnsamble) : "—",
    etiquetaFuenteSaldo(p.fuenteSaldo),
    p.ajusteEditableEnPantalla ? "Sí" : "No",
    String(p.ventasEnsamble),
    String(p.cargues),
    p.desajusteLegacy != null ? String(p.desajusteLegacy) : "—",
    p.desajusteEnsamble != null ? String(p.desajusteEnsamble) : "—",
    hall.slice(0, 80),
    rec.slice(0, 70),
  ];
}

export async function crearPdfAuditoriaInventarioPos(d: DatosAuditoriaInventarioPos): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" }) as JsPdfConAutoTable;
  const margin = 12;
  let y = await pintarCabecera(doc, margin);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...BRAND_GREEN);
  doc.text("Auditoría de inventario — POS", margin, y);
  y += 7;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(50, 50, 50);
  const meta = [
    `Punto de venta: ${d.puntoVenta}`,
    `Catálogo: ${etiquetaFuenteCatalogoAuditoria(d.fuenteCatalogo)}${d.incluyeCatalogoPos ? " + POS" : ""}`,
    `Movimientos analizados (máx.): ${d.limiteMovimientos}`,
    `Generado: ${fechaHoraColombia(new Date(d.generadoIso))}`,
  ];
  for (const line of meta) {
    doc.text(line, margin, y);
    y += 4;
  }
  y += 3;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...BRAND_DARK);
  doc.text("Resumen ejecutivo", margin, y);
  y += 2;

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Indicador", "Valor"]],
    body: resumenCeldas(d),
    styles: { fontSize: 7.5, cellPadding: 1.8 },
    headStyles: { fillColor: BRAND_GREEN, textColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });
  y = (doc.lastAutoTable?.finalY ?? y) + 6;

  if (d.duplicadosCatalogo.length > 0) {
    y = asegurarEspacio(doc, y, 24, margin);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Duplicados en catálogo (misma clave kit)", margin, y);
    y += 2;
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Clave kit", "SKU", "Id", "Origen", "Descripción"]],
      body: d.duplicadosCatalogo.flatMap((g) =>
        g.entradas.map((e, i) => [
          i === 0 ? g.claveKit : "",
          e.sku,
          e.id.slice(0, 28),
          e.origen,
          e.descripcion.slice(0, 42),
        ])
      ),
      styles: { fontSize: 6.5, cellPadding: 1.5 },
      headStyles: { fillColor: [180, 83, 9], textColor: [255, 255, 255] },
    });
    y = (doc.lastAutoTable?.finalY ?? y) + 6;
  }

  if (d.descripcionesSimilares.length > 0) {
    y = asegurarEspacio(doc, y, 24, margin);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Productos con descripción similar (SKUs distintos)", margin, y);
    y += 2;
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Clave descripción", "SKUs", "Nombres"]],
      body: d.descripcionesSimilares.map((g) => [
        g.claveDescripcion.slice(0, 40),
        g.skus.join(", ").slice(0, 55),
        g.descripciones.join(" · ").slice(0, 70),
      ]),
      styles: { fontSize: 6.5, cellPadding: 1.5 },
      headStyles: { fillColor: [120, 53, 15], textColor: [255, 255, 255] },
    });
    y = (doc.lastAutoTable?.finalY ?? y) + 6;
  }

  y = asegurarEspacio(doc, y, 20, margin);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Detalle por producto", margin, y);
  y += 2;

  const productosConHallazgo = d.productos.filter((p) => p.hallazgos.length > 0);
  const cuerpoDetalle =
    productosConHallazgo.length > 0 ? productosConHallazgo.map(filaDetalleProducto) : d.productos.slice(0, 80).map(filaDetalleProducto);

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [
      [
        "SKU",
        "Descripción",
        "Nivel",
        "Saldo",
        "Legacy",
        "Ensamble",
        "Fuente",
        "Ajuste UI",
        "Vtas ens.",
        "Cargues",
        "Δ legacy",
        "Δ ens.",
        "Hallazgos",
        "Recomendación",
      ],
    ],
    body: cuerpoDetalle,
    styles: { fontSize: 5.5, cellPadding: 1.2, overflow: "linebreak" },
    headStyles: { fillColor: BRAND_GREEN, fontSize: 5.5 },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 32 },
      12: { cellWidth: 38 },
      13: { cellWidth: 34 },
    },
  });
  y = (doc.lastAutoTable?.finalY ?? y) + 5;

  if (productosConHallazgo.length < d.productos.length) {
    doc.setFontSize(7);
    doc.setTextColor(90, 90, 90);
    doc.text(
      `Se listan ${cuerpoDetalle.length} filas (${productosConHallazgo.length} con hallazgos de ${d.productos.length} productos).`,
      margin,
      y
    );
    y += 5;
  }

  y = asegurarEspacio(doc, y, 30, margin);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...BRAND_DARK);
  doc.text("Metodología y ajustes generales", margin, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  const bullets = [
    ...d.notasMetodologia,
    "Unificar SKUs duplicados en la hoja antes de cargues masivos.",
    "Tras corregir catálogo, registrar cargue o ajuste de conteo en la fila con saldo legacy editable.",
    "Validar DB_POS_Composición en WMS con el SKU exacto que envía el POS al cobrar (ver diagnóstico último cobro en Inventarios).",
  ];
  for (const b of bullets) {
    y = asegurarEspacio(doc, y, 8, margin);
    const lines = doc.splitTextToSize(`• ${b}`, doc.internal.pageSize.getWidth() - margin * 2);
    doc.text(lines, margin, y);
    y += lines.length * 3.2;
  }

  const pageH = doc.internal.pageSize.getHeight();
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    const pageW = doc.internal.pageSize.getWidth();
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.setTextColor(130, 130, 130);
    doc.text(
      `Maria Chorizos POS · Auditoría inventario · Pág. ${i} de ${totalPages}`,
      pageW / 2,
      pageH - 8,
      { align: "center" }
    );
  }

  return doc;
}

export async function blobPdfAuditoriaInventarioPos(d: DatosAuditoriaInventarioPos): Promise<Blob> {
  const doc = await crearPdfAuditoriaInventarioPos(d);
  return doc.output("blob");
}

/** URL temporal (`blob:`) para previsualizar en iframe; revocar con `revocarUrlPdfAuditoriaInventario`. */
export async function urlPdfAuditoriaInventarioPos(d: DatosAuditoriaInventarioPos): Promise<string> {
  const blob = await blobPdfAuditoriaInventarioPos(d);
  return URL.createObjectURL(blob);
}

export function revocarUrlPdfAuditoriaInventario(url: string | null | undefined): void {
  if (url?.startsWith("blob:")) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  }
}

export async function descargarPdfAuditoriaInventarioPos(d: DatosAuditoriaInventarioPos): Promise<void> {
  const doc = await crearPdfAuditoriaInventarioPos(d);
  doc.save(nombreArchivoAuditoriaInventarioPdf(d.puntoVenta, d.generadoIso));
}
