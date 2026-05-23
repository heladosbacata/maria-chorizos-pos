import { fechaColombia, mediodiaColombiaDesdeYmd } from "@/lib/fecha-colombia";
import type { FilaDocumentoPosVenta } from "@/lib/ventas-documentos-pos";
import { formatoFechaTabla } from "@/lib/ventas-documentos-pos";

export type NivelDetalleReporteVentas = "resumen" | "transacciones" | "detallado";

export type FilaTransaccionReporte = {
  comprobante: string;
  fechaLabel: string;
  tipoLabel: string;
  cliente: string;
  total: number;
  anulada: boolean;
};

export type ProductoAgregadoReporte = {
  clave: string;
  descripcion: string;
  sku: string;
  cantidad: number;
  total: number;
};

export type DetalleVentaReporte = {
  comprobante: string;
  fechaLabel: string;
  cliente: string;
  total: number;
  lineas: { descripcion: string; cantidad: number; subtotal: number }[];
};

export type DatosReporteVentasPos = {
  puntoVenta: string;
  desdeYmd: string;
  hastaYmd: string;
  generadoIso: string;
  nivel: NivelDetalleReporteVentas;
  filtroTabLabel: string;
  cantidadDocumentos: number;
  cantidadAnuladas: number;
  totalVigente: number;
  totalAnulado: number;
  porTipo: { tipo: string; cantidad: number; total: number }[];
  porDia: { ymd: string; fechaLabel: string; cantidad: number; total: number }[];
  transacciones: FilaTransaccionReporte[];
  productosAgregados: ProductoAgregadoReporte[];
  detallePorVenta: DetalleVentaReporte[];
};

const ETIQUETA_TIPO: Record<FilaDocumentoPosVenta["tipo"], string> = {
  factura_electronica: "Factura electrónica",
  recibo_pos: "Recibo POS",
  cotizacion: "Cotización",
  remision: "Remisión",
};

function fechaRangoLegible(desdeYmd: string, hastaYmd: string): string {
  const fmt = (ymd: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
    const d = mediodiaColombiaDesdeYmd(ymd);
    return fechaColombia(d, { day: "numeric", month: "long", year: "numeric" });
  };
  if (desdeYmd === hastaYmd) return fmt(desdeYmd);
  return `${fmt(desdeYmd)} — ${fmt(hastaYmd)}`;
}

export function etiquetaNivelDetalle(nivel: NivelDetalleReporteVentas): string {
  if (nivel === "resumen") return "Resumen ejecutivo";
  if (nivel === "transacciones") return "Resumen + listado de ventas";
  return "Detallado (ventas y productos vendidos)";
}

export function construirDatosReporteVentasPos(params: {
  puntoVenta: string;
  desdeYmd: string;
  hastaYmd: string;
  nivel: NivelDetalleReporteVentas;
  filas: FilaDocumentoPosVenta[];
  filtroTabLabel: string;
}): DatosReporteVentasPos {
  const { filas, nivel, puntoVenta, desdeYmd, hastaYmd, filtroTabLabel } = params;
  let totalVigente = 0;
  let totalAnulado = 0;
  let cantidadAnuladas = 0;
  const mapTipo = new Map<string, { cantidad: number; total: number }>();
  const mapDia = new Map<string, { cantidad: number; total: number }>();
  const mapProductos = new Map<string, ProductoAgregadoReporte>();
  const transacciones: FilaTransaccionReporte[] = [];
  const detallePorVenta: DetalleVentaReporte[] = [];

  for (const f of filas) {
    const tipoKey = ETIQUETA_TIPO[f.tipo];
    const prevT = mapTipo.get(tipoKey) ?? { cantidad: 0, total: 0 };
    prevT.cantidad += 1;
    if (!f.anulada) prevT.total += f.total;
    mapTipo.set(tipoKey, prevT);

    if (f.anulada) {
      cantidadAnuladas += 1;
      totalAnulado += f.total;
    } else {
      totalVigente += f.total;
      const prevD = mapDia.get(f.fechaYmd) ?? { cantidad: 0, total: 0 };
      prevD.cantidad += 1;
      prevD.total += f.total;
      mapDia.set(f.fechaYmd, prevD);
    }

    transacciones.push({
      comprobante: f.comprobante,
      fechaLabel: formatoFechaTabla(f.fechaYmd, f.fechaMs),
      tipoLabel: f.tipoLabel,
      cliente: f.clienteNombre,
      total: f.total,
      anulada: f.anulada,
    });

    const lineasDetalle: DetalleVentaReporte["lineas"] = [];
    if (f.venta?.lineas?.length) {
      for (const l of f.venta.lineas) {
        const sub = Math.round(l.precioUnitario * l.cantidad * 100) / 100;
        lineasDetalle.push({
          descripcion: l.descripcion,
          cantidad: l.cantidad,
          subtotal: sub,
        });
        if (!f.anulada) {
          const sku = l.sku?.trim() || "";
          const clave = `${sku}|${l.descripcion.trim().toLowerCase()}`;
          const prev = mapProductos.get(clave) ?? {
            clave,
            descripcion: l.descripcion,
            sku,
            cantidad: 0,
            total: 0,
          };
          prev.cantidad += l.cantidad;
          prev.total += sub;
          mapProductos.set(clave, prev);
        }
      }
    } else if (f.documento?.lineas?.length) {
      for (const l of f.documento.lineas) {
        const sub = Math.round(l.cantidad * l.precioUnitario * 100) / 100;
        const desc = l.descripcion || l.sku;
        lineasDetalle.push({ descripcion: desc, cantidad: l.cantidad, subtotal: sub });
        if (!f.anulada) {
          const sku = l.sku?.trim() || "";
          const clave = `${sku}|${desc.trim().toLowerCase()}`;
          const prev = mapProductos.get(clave) ?? {
            clave,
            descripcion: desc,
            sku,
            cantidad: 0,
            total: 0,
          };
          prev.cantidad += l.cantidad;
          prev.total += sub;
          mapProductos.set(clave, prev);
        }
      }
    }

    if (lineasDetalle.length > 0) {
      detallePorVenta.push({
        comprobante: f.comprobante,
        fechaLabel: formatoFechaTabla(f.fechaYmd, f.fechaMs),
        cliente: f.clienteNombre,
        total: f.total,
        lineas: lineasDetalle,
      });
    }
  }

  const porDia = Array.from(mapDia.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ymd, v]) => ({
      ymd,
      fechaLabel: formatoFechaTabla(ymd, mediodiaColombiaDesdeYmd(ymd).getTime()),
      cantidad: v.cantidad,
      total: v.total,
    }));

  const productosAgregados = Array.from(mapProductos.values()).sort((a, b) => b.total - a.total);

  return {
    puntoVenta: puntoVenta.trim(),
    desdeYmd,
    hastaYmd,
    generadoIso: new Date().toISOString(),
    nivel,
    filtroTabLabel,
    cantidadDocumentos: filas.length,
    cantidadAnuladas,
    totalVigente,
    totalAnulado,
    porTipo: Array.from(mapTipo.entries()).map(([tipo, v]) => ({ tipo, ...v })),
    porDia,
    transacciones: nivel === "resumen" ? [] : transacciones,
    productosAgregados: nivel === "detallado" ? productosAgregados : [],
    detallePorVenta: nivel === "detallado" ? detallePorVenta : [],
  };
}

export function textoResumenReporteVentasCorreo(d: DatosReporteVentasPos): string {
  const rango = fechaRangoLegible(d.desdeYmd, d.hastaYmd);
  const lineas = [
    "Hola,",
    "",
    `Adjuntamos el reporte de ventas del POS Maria Chorizos.`,
    "",
    `Punto de venta: ${d.puntoVenta}`,
    `Período: ${rango}`,
    `Filtro de lista: ${d.filtroTabLabel}`,
    `Nivel de detalle: ${etiquetaNivelDetalle(d.nivel)}`,
    "",
    `Documentos en el período: ${d.cantidadDocumentos}`,
    `Total ventas vigentes: ${d.totalVigente.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 })}`,
  ];
  if (d.cantidadAnuladas > 0) {
    lineas.push(
      `Anuladas (referencia): ${d.cantidadAnuladas} · ${d.totalAnulado.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 })}`
    );
  }
  lineas.push("", "El detalle completo está en el PDF adjunto.", "", "— Maria Chorizos POS");
  return lineas.join("\n");
}

export function nombreArchivoReporteVentasPdf(d: DatosReporteVentasPos): string {
  const slugPv = d.puntoVenta.replace(/[^\w.-]+/g, "_").slice(0, 32);
  return `Reporte-ventas-${slugPv}-${d.desdeYmd}_${d.hastaYmd}.pdf`;
}
