import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { LOGO_ORG_URL } from "@/lib/brand";
import { fechaColombia, mediodiaColombiaDesdeYmd } from "@/lib/fecha-colombia";

type JsPdfConAutoTable = jsPDF & { lastAutoTable?: { finalY: number } };

export interface LineaPdfDocumento {
  sku: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
}

export function formatoMonedaCop(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(n) ? n : 0);
}

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

/**
 * Tamaño en mm para el PDF respetando la proporción original (evita estirar/aplastar el logo).
 */
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

export interface OpcionesPdfComercial {
  tipo: "cotizacion" | "remision";
  numeroDocumento: string;
  fechaIso: string;
  puntoVenta?: string;
  clienteNombre: string;
  clienteDocumento?: string;
  clienteTelefono?: string;
  /** Solo cotización */
  eventoReferencia?: string;
  /** Solo remisión */
  direccionEntrega?: string;
  observaciones?: string;
  lineas: LineaPdfDocumento[];
}

function tituloDocumento(tipo: "cotizacion" | "remision"): string {
  return tipo === "cotizacion" ? "COTIZACIÓN PARA EVENTO" : "REMISIÓN DE DESPACHO";
}

function fechaLegible(iso: string): string {
  if (!iso || iso.length < 10) return iso;
  const ymd = iso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return iso;
  const d = mediodiaColombiaDesdeYmd(ymd);
  if (Number.isNaN(d.getTime())) return iso;
  return fechaColombia(d, { day: "numeric", month: "long", year: "numeric" });
}

function nombreArchivo(tipo: "cotizacion" | "remision", numero: string): string {
  const slug = numero.replace(/[^\w.-]+/g, "_").slice(0, 40);
  const pref = tipo === "cotizacion" ? "Cotizacion" : "Remision";
  return `${pref}-Maria-Chorizos-${slug}.pdf`;
}

/**
 * Genera y descarga un PDF A4 con logo, datos del documento y tabla de ítems.
 * Solo ejecutar en el cliente.
 */
export async function descargarPdfDocumentoComercial(opts: OpcionesPdfComercial): Promise<void> {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;
  const logoTop = margin;
  let y = logoTop;

  const logo = await logoDataUrlAbsoluta();
  let altoLogoMm = 0;
  if (logo) {
    try {
      const { ancho, alto } = await medidasLogoEnMm(logo, 52, 20);
      const formato =
        logo.startsWith("data:image/jpeg") || logo.startsWith("data:image/jpg")
          ? "JPEG"
          : "PNG";
      doc.addImage(logo, formato, margin, logoTop, ancho, alto);
      altoLogoMm = alto;
    } catch {
      /* formato no soportado o imagen corrupta */
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(30, 30, 30);
  doc.text("Maria Chorizos", pageW - margin, logoTop + 5, { align: "right" });
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 80, 80);
  doc.text("Punto de venta institucional", pageW - margin, logoTop + 11, { align: "right" });

  const altoBandaEncabezado = Math.max(altoLogoMm, 12);
  y = logoTop + altoBandaEncabezado + 6;
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, y, pageW - margin, y);
  y += 8;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(15, 90, 60);
  doc.text(tituloDocumento(opts.tipo), margin, y);
  y += 7;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(40, 40, 40);
  doc.text(`No. ${opts.numeroDocumento}`, margin, y);
  doc.text(`Fecha: ${fechaLegible(opts.fechaIso)}`, pageW - margin, y, { align: "right" });
  y += 6;

  if (opts.puntoVenta?.trim()) {
    doc.setFontSize(9);
    doc.setTextColor(70, 70, 70);
    doc.text(`Punto de venta: ${opts.puntoVenta.trim()}`, margin, y);
    y += 5;
  }

  y += 2;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(30, 30, 30);
  doc.text("Cliente", margin, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(opts.clienteNombre.trim() || "—", margin, y);
  y += 4;
  if (opts.clienteDocumento?.trim()) {
    doc.text(`Documento: ${opts.clienteDocumento.trim()}`, margin, y);
    y += 4;
  }
  if (opts.clienteTelefono?.trim()) {
    doc.text(`Teléfono: ${opts.clienteTelefono.trim()}`, margin, y);
    y += 4;
  }

  if (opts.tipo === "cotizacion" && opts.eventoReferencia?.trim()) {
    doc.setFont("helvetica", "bold");
    doc.text("Evento / referencia", margin, y + 2);
    y += 6;
    doc.setFont("helvetica", "normal");
    const split = doc.splitTextToSize(opts.eventoReferencia.trim(), pageW - 2 * margin);
    doc.text(split, margin, y);
    y += split.length * 4 + 2;
  }

  if (opts.tipo === "remision" && opts.direccionEntrega?.trim()) {
    doc.setFont("helvetica", "bold");
    doc.text("Dirección de entrega", margin, y + 2);
    y += 6;
    doc.setFont("helvetica", "normal");
    const split = doc.splitTextToSize(opts.direccionEntrega.trim(), pageW - 2 * margin);
    doc.text(split, margin, y);
    y += split.length * 4 + 2;
  }

  if (opts.observaciones?.trim()) {
    doc.setFont("helvetica", "bold");
    doc.text("Observaciones", margin, y + 2);
    y += 6;
    doc.setFont("helvetica", "normal");
    const split = doc.splitTextToSize(opts.observaciones.trim(), pageW - 2 * margin);
    doc.text(split, margin, y);
    y += split.length * 4 + 4;
  } else {
    y += 4;
  }

  const subtotal = opts.lineas.reduce((s, l) => s + l.cantidad * l.precioUnitario, 0);
  const body = opts.lineas.map((l, i) => [
    String(i + 1),
    l.sku,
    l.descripcion.length > 60 ? `${l.descripcion.slice(0, 57)}…` : l.descripcion,
    String(l.cantidad),
    formatoMonedaCop(l.precioUnitario),
    formatoMonedaCop(l.cantidad * l.precioUnitario),
  ]);

  autoTable(doc, {
    startY: y,
    head: [["#", "SKU", "Descripción", "Cant.", "V. unitario", "Subtotal"]],
    body: body.length ? body : [["—", "—", "Sin ítems", "0", "—", "—"]],
    margin: { left: margin, right: margin },
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [15, 90, 60], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 10 },
      1: { cellWidth: 22 },
      3: { halign: "center", cellWidth: 14 },
      4: { halign: "right" },
      5: { halign: "right" },
    },
  });

  const finalY = (doc as JsPdfConAutoTable).lastAutoTable?.finalY ?? y + 40;
  let ty = finalY + 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 90, 60);
  doc.text(`Total: ${formatoMonedaCop(subtotal)}`, pageW - margin, ty, { align: "right" });

  ty = doc.internal.pageSize.getHeight() - 12;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7);
  doc.setTextColor(120, 120, 120);
  doc.text(
    "Documento generado desde el POS Maria Chorizos. Valide plazos y condiciones comerciales con su asesor.",
    pageW / 2,
    ty,
    { align: "center" }
  );

  doc.save(nombreArchivo(opts.tipo, opts.numeroDocumento));
}
