import type { WorkBook } from "xlsx";
import {
  filasMetaReporteVentasPos,
  nombreArchivoReporteVentasExcel,
  type DatosReporteVentasPos,
} from "@/lib/ventas-reporte-pos-data";

type XlsxModule = typeof import("xlsx");

async function loadXLSX(): Promise<XlsxModule> {
  return import("xlsx");
}

function appendSheet(XLSX: XlsxModule, wb: WorkBook, name: string, rows: unknown[][]) {
  const safeName = name.slice(0, 31).replace(/[\\/?*[\]]/g, "_");
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, safeName);
}

function filasPorTipo(d: DatosReporteVentasPos): unknown[][] {
  if (d.porTipo.length === 0) return [];
  return [
    ["Tipo de documento", "Cantidad", "Total vigente"],
    ...d.porTipo.map((t) => [t.tipo, t.cantidad, t.total]),
  ];
}

function filasPorDia(d: DatosReporteVentasPos): unknown[][] {
  if (d.porDia.length === 0) return [];
  return [
    ["Día", "Documentos", "Total"],
    ...d.porDia.map((dia) => [dia.fechaLabel, dia.cantidad, dia.total]),
  ];
}

function filasDocumentos(d: DatosReporteVentasPos): unknown[][] {
  if (d.transacciones.length === 0) return [];
  return [
    [
      "Fecha",
      "Comprobante",
      "Tipo",
      "Cliente",
      "Medio de pago",
      "Total",
      "Estado",
    ],
    ...d.transacciones.map((t) => [
      t.fechaLabel,
      t.comprobante,
      t.tipoLabel,
      t.cliente,
      t.medioPagoDetalle || t.medioPago,
      t.total,
      t.anulada ? "Anulada" : "Vigente",
    ]),
  ];
}

function filasProductos(d: DatosReporteVentasPos): unknown[][] {
  if (d.productosAgregados.length === 0) return [];
  return [
    ["SKU", "Producto", "Cantidad", "Total"],
    ...d.productosAgregados.map((p) => [p.sku || "—", p.descripcion, p.cantidad, p.total]),
  ];
}

function filasDetalleLineas(d: DatosReporteVentasPos): unknown[][] {
  if (d.detallePorVenta.length === 0) return [];
  const rows: unknown[][] = [
    [
      "Comprobante",
      "Fecha",
      "Cliente",
      "Medio de pago",
      "Total documento",
      "Producto",
      "Cantidad",
      "Subtotal",
    ],
  ];
  for (const v of d.detallePorVenta) {
    if (v.lineas.length === 0) {
      rows.push([v.comprobante, v.fechaLabel, v.cliente, v.medioPagoDetalle, v.total, "—", 0, 0]);
      continue;
    }
    for (const l of v.lineas) {
      rows.push([
        v.comprobante,
        v.fechaLabel,
        v.cliente,
        v.medioPagoDetalle,
        v.total,
        l.descripcion,
        l.cantidad,
        l.subtotal,
      ]);
    }
  }
  return rows;
}

export async function crearWorkbookReporteVentasPos(d: DatosReporteVentasPos): Promise<WorkBook> {
  const XLSX = await loadXLSX();
  const wb = XLSX.utils.book_new();

  const resumen: unknown[][] = [...filasMetaReporteVentasPos(d)];
  const porTipo = filasPorTipo(d);
  if (porTipo.length > 0) {
    resumen.push([], ["Por tipo de documento"], ...porTipo);
  }
  const porDia = filasPorDia(d);
  if (porDia.length > 0 && d.nivel !== "resumen") {
    resumen.push([], ["Por día"], ...porDia);
  }
  appendSheet(XLSX, wb, "Resumen", resumen);

  if (d.nivel !== "resumen") {
    const docs = filasDocumentos(d);
    if (docs.length > 0) appendSheet(XLSX, wb, "Documentos", docs);
  }

  if (d.productosAgregados.length > 0) {
    appendSheet(XLSX, wb, "Productos", filasProductos(d));
  }

  if (d.detallePorVenta.length > 0) {
    appendSheet(XLSX, wb, "Detalle lineas", filasDetalleLineas(d));
  }

  if (wb.SheetNames.length === 0) {
    appendSheet(XLSX, wb, "Sin datos", [["No hay documentos en el período seleccionado."]]);
  }

  return wb;
}

export async function descargarExcelReporteVentasPos(d: DatosReporteVentasPos): Promise<void> {
  const XLSX = await loadXLSX();
  const wb = await crearWorkbookReporteVentasPos(d);
  XLSX.writeFile(wb, nombreArchivoReporteVentasExcel(d));
}
