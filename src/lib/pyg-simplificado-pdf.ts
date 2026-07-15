"use client";

import { jsPDF } from "jspdf";
import {
  BASE_PERSONAL_MENSUAL,
  calcularPygSimplificado,
  FEE_PUBLICIDAD_MENSUAL,
  formatCop,
  GASTO_ASEO_MENSUAL,
  GASTO_INTERNET_MENSUAL,
  leerPersonalGuardado,
  leerRentaGuardada,
  PORCENTAJE_INSUMOS_VENTAS,
  type PygSimplificadoCalculo,
} from "@/lib/pyg-simplificado";

export type PygPdfInput = {
  puntoNombre: string;
  ingresos: number;
  desde: string;
  hasta: string;
  uid: string;
  puntoVenta?: string;
};

type FilaPdf = {
  concepto: string;
  valor: string;
  nota?: string;
  destacado?: boolean;
};

function formatFechaLegible(iso: string): string {
  try {
    return new Intl.DateTimeFormat("es-CO", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(`${iso.slice(0, 10)}T12:00:00`));
  } catch {
    return iso;
  }
}

function formatFechaHoy(): string {
  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}

function nombreArchivoPyg(punto: string, desde: string, hasta: string): string {
  const base = punto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase()
    .slice(0, 40);
  return `pyg-${base || "punto"}-${desde}-${hasta}.pdf`;
}

function ensureSpace(doc: jsPDF, y: number, need: number, margin: number): number {
  const pageH = doc.internal.pageSize.getHeight();
  if (y + need > pageH - margin) {
    doc.addPage();
    return margin + 6;
  }
  return y;
}

function dibujarEncabezadoPagina(doc: jsPDF, puntoNombre: string, margin: number): number {
  const pageW = doc.internal.pageSize.getWidth();
  doc.setFillColor(61, 41, 20);
  doc.rect(0, 0, pageW, 24, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.text(puntoNombre, margin, 10);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(214, 203, 184);
  doc.text("María Chorizos · PyG del punto de venta", margin, 17);

  return 32;
}

function dibujarFilas(
  doc: jsPDF,
  filas: FilaPdf[],
  startY: number,
  margin: number,
  contentW: number
): number {
  let y = startY;

  filas.forEach((fila, index) => {
    const conceptoLines = doc.splitTextToSize(fila.concepto, contentW * 0.58);
    const notaLines = fila.nota ? doc.splitTextToSize(fila.nota, contentW * 0.58) : [];
    const rowH =
      Math.max(conceptoLines.length, 1) * 4.2 +
      (notaLines.length > 0 ? notaLines.length * 3.2 + 2 : 0) +
      4;

    y = ensureSpace(doc, y, rowH, margin);

    if (fila.destacado) {
      doc.setFillColor(240, 253, 250);
      doc.rect(margin, y - 5, contentW, rowH, "F");
    } else if (index % 2 === 0) {
      doc.setFillColor(249, 250, 251);
      doc.rect(margin, y - 5, contentW, rowH, "F");
    }

    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.1);
    doc.line(margin, y - 5, margin + contentW, y - 5);

    doc.setFont("helvetica", fila.destacado ? "bold" : "normal");
    doc.setFontSize(fila.destacado ? 10 : 9);
    doc.setTextColor(31, 41, 55);
    doc.text(conceptoLines, margin + 2, y);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(fila.destacado ? 11 : 9);
    if (fila.destacado && fila.valor.startsWith("−")) {
      doc.setTextColor(185, 28, 28);
    } else if (fila.destacado) {
      doc.setTextColor(4, 120, 87);
    } else {
      doc.setTextColor(55, 65, 81);
    }
    doc.text(fila.valor, margin + contentW - 2, y, { align: "right" });

    if (notaLines.length > 0) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text(notaLines, margin + 2, y + conceptoLines.length * 4);
    }

    y += rowH;
  });

  return y;
}

function filasTablaPyg(
  calc: PygSimplificadoCalculo,
  desde: string,
  hasta: string,
  pctInsumos: number
): FilaPdf[] {
  const utilidadPositiva = calc.utilidadPeriodo >= 0;

  return [
    {
      concepto: "1. Ventas en este periodo",
      valor: formatCop(calc.ingresos),
      nota: `Sincronizado con tu punto de venta (${desde} → ${hasta})`,
    },
    {
      concepto: "2. Días que llevas operando",
      valor: String(calc.diasOperando),
      nota: `De ${calc.diasDelMes} días del mes`,
    },
    {
      concepto: `3. Costo de insumos (${pctInsumos}% de ventas)`,
      valor: `− ${formatCop(calc.costoInsumos)}`,
      nota: `${pctInsumos}% estándar sobre ${formatCop(calc.ingresos)} vendidos`,
    },
    {
      concepto: "4. Margen después de insumos",
      valor: formatCop(calc.margenBruto),
      nota: "Ventas menos insumos",
    },
    {
      concepto: "5. Renta del local (mes completo)",
      valor: formatCop(calc.rentaMensual),
      nota: "Arriendo mensual del local",
    },
    {
      concepto: "6. Renta de este periodo",
      valor:
        calc.rentaMensual > 0 ? `− ${formatCop(calc.rentaPeriodo)}` : formatCop(0),
      nota:
        calc.rentaMensual > 0
          ? `${formatCop(calc.rentaMensual)} ÷ ${calc.diasDelMes} días × ${calc.diasOperando} días`
          : "Sin renta registrada",
    },
    {
      concepto: "7. Pago de personal (mes completo)",
      valor: formatCop(calc.personalMensual),
      nota: "Nómina mensual de referencia",
    },
    {
      concepto: "8. Personal de este periodo",
      valor:
        calc.personalMensual > 0 ? `− ${formatCop(calc.personalPeriodo)}` : formatCop(0),
      nota:
        calc.personalMensual > 0
          ? `${formatCop(calc.personalMensual)} ÷ ${calc.diasDelMes} días × ${calc.diasOperando} días`
          : "Sin personal registrado",
    },
    {
      concepto: "9. Otros gastos fijos del periodo",
      valor: `− ${formatCop(calc.otrosGastosFijosPeriodo)}`,
      nota: `Internet ${formatCop(GASTO_INTERNET_MENSUAL)} + aseo ${formatCop(GASTO_ASEO_MENSUAL)} + publicidad ${formatCop(FEE_PUBLICIDAD_MENSUAL)} al mes`,
    },
    {
      concepto: "10. Utilidad del periodo (lo que te queda)",
      valor: `${utilidadPositiva ? "" : "− "}${formatCop(Math.abs(calc.utilidadPeriodo))}`,
      destacado: true,
      nota: "Ventas − insumos − renta − personal − internet, aseo y publicidad",
    },
  ];
}

function dibujarBloqueResumen(
  doc: jsPDF,
  titulo: string,
  valor: string,
  nota: string,
  x: number,
  y: number,
  ancho: number
): void {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(titulo.toUpperCase(), x, y);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(13, 148, 136);
  doc.text(valor, x, y + 7);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  const notaLines = doc.splitTextToSize(nota, ancho);
  doc.text(notaLines, x, y + 13);
}

/** Genera y descarga el reporte PyG simplificado en PDF (A4). */
export async function descargarPygSimplificadoPdf(input: PygPdfInput): Promise<void> {
  const rentaMensual = leerRentaGuardada(input.uid, input.puntoVenta);
  const personalGuardado = leerPersonalGuardado(input.uid, input.puntoVenta);
  const personalMensual =
    personalGuardado !== null ? personalGuardado : BASE_PERSONAL_MENSUAL;

  const calc = calcularPygSimplificado(
    input.ingresos,
    rentaMensual,
    input.desde,
    input.hasta,
    personalMensual
  );
  const pctInsumos = Math.round(PORCENTAJE_INSUMOS_VENTAS * 100);

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const margin = 14;
  const pageW = doc.internal.pageSize.getWidth();
  const contentW = pageW - margin * 2;

  let y = dibujarEncabezadoPagina(doc, input.puntoNombre, margin);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(31, 41, 55);
  doc.text("Tu PyG en números simples", margin, y);
  y += 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Periodo: ${formatFechaLegible(input.desde)} → ${formatFechaLegible(input.hasta)}`,
    margin,
    y
  );
  y += 5;
  doc.text(
    `Ventas del POS · insumos al ${pctInsumos}% · renta y personal repartidos por día`,
    margin,
    y
  );
  y += 8;

  doc.setDrawColor(209, 213, 219);
  doc.setLineWidth(0.3);
  doc.line(margin, y, margin + contentW, y);
  y += 4;

  y = dibujarFilas(doc, filasTablaPyg(calc, input.desde, input.hasta, pctInsumos), y, margin, contentW);

  y = ensureSpace(doc, y, 28, margin);
  doc.setDrawColor(229, 231, 235);
  doc.line(margin, y, margin + contentW, y);
  y += 6;

  const mitad = contentW / 2 - 4;
  dibujarBloqueResumen(
    doc,
    "Promedio venta por día",
    formatCop(calc.promedioVentaDiario),
    `${formatCop(calc.ingresos)} ÷ ${calc.diasOperando} días`,
    margin,
    y,
    mitad
  );
  dibujarBloqueResumen(
    doc,
    "Utilidad promedio por día",
    `${calc.utilidadDiaria >= 0 ? "" : "− "}${formatCop(Math.abs(calc.utilidadDiaria))}`,
    "Con renta, personal y gastos fijos del periodo",
    margin + mitad + 8,
    y,
    mitad
  );
  y += 28;

  if (calc.diasOperando < calc.diasDelMes && calc.ingresos > 0) {
    y = ensureSpace(doc, y, 40, margin);
    doc.setFillColor(249, 250, 251);
    doc.rect(margin, y, contentW, 22, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text("SI MANTIENES ESTE RITMO HASTA FIN DE MES", margin + 3, y + 6);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(55, 65, 81);
    doc.text(
      `Ventas estimadas: ${formatCop(calc.ventasProyectadasMes)}  ·  Utilidad estimada: ${formatCop(calc.utilidadProyectadaMes)}`,
      margin + 3,
      y + 12
    );

    const notaProy = `(renta mes completo + personal ${formatCop(calc.personalMensual)} + internet ${formatCop(GASTO_INTERNET_MENSUAL)} + aseo ${formatCop(GASTO_ASEO_MENSUAL)} + publicidad ${formatCop(FEE_PUBLICIDAD_MENSUAL)} + insumos al ${pctInsumos}%)`;
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(doc.splitTextToSize(notaProy, contentW - 6), margin + 3, y + 17);
    y += 26;

    y = ensureSpace(doc, y, 36, margin);
    doc.setFillColor(236, 253, 245);
    doc.rect(margin, y, contentW, 34, "F");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(55, 65, 81);
    doc.text(
      "Si incrementas un 10% tus ventas diarias respecto a lo que llevas hoy, al cierre del mes podrías ganar:",
      margin + 3,
      y + 7,
      { maxWidth: contentW - 6 }
    );

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(4, 120, 87);
    doc.text(formatCop(calc.utilidadProyectadaMesPlus10), margin + 3, y + 18);

    if (calc.gananciaExtraConPlus10 > 0) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(15, 118, 110);
      doc.text(
        `Eso son ${formatCop(calc.gananciaExtraConPlus10)} más que manteniendo el ritmo actual (${formatCop(calc.utilidadProyectadaMes)}).`,
        margin + 3,
        y + 25,
        { maxWidth: contentW - 6 }
      );
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Ventas con +10%: ${formatCop(calc.ventasProyectadasMesPlus10)} al mes`,
      margin + 3,
      y + 31
    );
    y += 38;
  }

  const pageH = doc.internal.pageSize.getHeight();
  doc.setDrawColor(229, 231, 235);
  doc.line(margin, pageH - 14, margin + contentW, pageH - 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text("Grupo Bacatá · María Chorizos · Reporte informativo para franquiciado", margin, pageH - 9);
  doc.text(`Generado el ${formatFechaHoy()}`, margin + contentW, pageH - 9, { align: "right" });

  doc.save(nombreArchivoPyg(input.puntoNombre, input.desde, input.hasta));
}
