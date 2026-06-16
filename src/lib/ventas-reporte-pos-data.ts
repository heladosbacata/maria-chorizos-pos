import { fechaColombia, mediodiaColombiaDesdeYmd } from "@/lib/fecha-colombia";
import type { FilaDocumentoPosVenta } from "@/lib/ventas-documentos-pos";
import { formatoFechaTabla } from "@/lib/ventas-documentos-pos";

export type NivelDetalleReporteVentas = "resumen" | "transacciones" | "detallado";

export type FilaTransaccionReporte = {
  comprobante: string;
  fechaLabel: string;
  tipoLabel: string;
  cliente: string;
  medioPago: string;
  medioPagoDetalle: string;
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
  medioPagoDetalle: string;
  total: number;
  lineas: { descripcion: string; cantidad: number; subtotal: number }[];
};

export type DatosReporteVentasPos = {
  puntoVenta: string;
  desdeYmd: string;
  hastaYmd: string;
  /** Si está definido, reemplaza el período por fechas solas en PDF/correo (rango con hora). */
  periodoLabel?: string;
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

export function periodoLegibleReporteVentas(d: Pick<DatosReporteVentasPos, "desdeYmd" | "hastaYmd" | "periodoLabel">): string {
  if (d.periodoLabel?.trim()) return d.periodoLabel.trim();
  const fmt = (ymd: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
    const day = mediodiaColombiaDesdeYmd(ymd);
    return fechaColombia(day, { day: "numeric", month: "long", year: "numeric" });
  };
  if (d.desdeYmd === d.hastaYmd) return fmt(d.desdeYmd);
  return `${fmt(d.desdeYmd)} — ${fmt(d.hastaYmd)}`;
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
  /** Muestra hora en listados del PDF (informe por rango exacto). */
  fechaConHora?: boolean;
}): DatosReporteVentasPos {
  const { filas, nivel, puntoVenta, desdeYmd, hastaYmd, filtroTabLabel, fechaConHora = false } = params;
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
      fechaLabel: formatoFechaTabla(f.fechaYmd, f.fechaMs, { conHora: fechaConHora }),
      tipoLabel: f.tipoLabel,
      cliente: f.clienteNombre,
      medioPago: f.medioPagoLabel,
      medioPagoDetalle: f.medioPagoDetalle,
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
        fechaLabel: formatoFechaTabla(f.fechaYmd, f.fechaMs, { conHora: fechaConHora }),
        cliente: f.clienteNombre,
        medioPagoDetalle: f.medioPagoDetalle,
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
  const rango = periodoLegibleReporteVentas(d);
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

/** Límite seguro del adjunto en base64 (~3 MB PDF) para APIs serverless (Vercel ~4,5 MB body). */
export const MAX_BASE64_ADJUNTO_CORREO_CHARS = 2_500_000;

const UMBRAL_DOCS_DETALLADO_CORREO = 45;
const UMBRAL_DOCS_TRANSACCIONES_CORREO = 120;

/**
 * Reduce el reporte para correo si el PDF detallado sería demasiado grande (evita HTTP 413).
 */
export function prepararDatosReporteParaCorreo(d: DatosReporteVentasPos): {
  datos: DatosReporteVentasPos;
  notaCorreo?: string;
} {
  if (d.cantidadDocumentos > UMBRAL_DOCS_TRANSACCIONES_CORREO) {
    return {
      datos: {
        ...d,
        nivel: "resumen",
        transacciones: [],
        productosAgregados: d.productosAgregados.slice(0, 80),
        detallePorVenta: [],
      },
      notaCorreo:
        `Hay ${d.cantidadDocumentos} documentos: el adjunto por correo es resumen ejecutivo + top productos (máx. 80). Para el listado completo usá «Descargar PDF».`,
    };
  }
  if (d.nivel === "detallado" && d.cantidadDocumentos > UMBRAL_DOCS_DETALLADO_CORREO) {
    return {
      datos: {
        ...d,
        nivel: "transacciones",
        detallePorVenta: [],
      },
      notaCorreo:
        `El período tiene ${d.cantidadDocumentos} documentos: por límite del servidor de correo se adjunta versión «Con listado de ventas» y ranking de productos, sin el detalle ítem por ítem de cada ticket. Para el PDF completo en modo detallado usá «Descargar PDF».`,
    };
  }
  return { datos: d };
}

export function estimaAdjuntoCorreoDemasiadoGrande(base64: string): boolean {
  return base64.length > MAX_BASE64_ADJUNTO_CORREO_CHARS;
}

export function mensajeErrorEnvioReporteCorreo(status: number, mensajeServidor?: string): string {
  if (status === 413) {
    return (
      "El PDF es demasiado grande para enviarlo por correo (límite del servidor). " +
      "Descargalo con «Descargar PDF», acortá el rango de fechas o elegí «Resumen ejecutivo» / «Con listado de ventas» en lugar de «Detallado con productos»."
    );
  }
  if (mensajeServidor?.trim()) return mensajeServidor.trim();
  if (status === 502 || status === 503) {
    return `No se pudo enviar el correo (${status}). Revisá la configuración SMTP/Zoho/Resend del POS o probá más tarde.`;
  }
  return `No se pudo enviar el correo (error ${status}).`;
}

export function nombreArchivoReporteVentasPdf(d: DatosReporteVentasPos): string {
  const slugPv = d.puntoVenta.replace(/[^\w.-]+/g, "_").slice(0, 32);
  return `Reporte-ventas-${slugPv}-${d.desdeYmd}_${d.hastaYmd}.pdf`;
}

export function nombreArchivoReporteVentasExcel(d: DatosReporteVentasPos): string {
  const slugPv = d.puntoVenta.replace(/[^\w.-]+/g, "_").slice(0, 32);
  return `Reporte-ventas-${slugPv}-${d.desdeYmd}_${d.hastaYmd}.xlsx`;
}

/** Metadatos del reporte en filas clave-valor (Excel / export). */
export function filasMetaReporteVentasPos(d: DatosReporteVentasPos): string[][] {
  return [
    ["Reporte de ventas — Maria Chorizos POS"],
    [],
    ["Punto de venta", d.puntoVenta],
    ["Período", periodoLegibleReporteVentas(d)],
    ["Filtro de lista", d.filtroTabLabel],
    ["Nivel de detalle", etiquetaNivelDetalle(d.nivel)],
    ["Generado", new Date(d.generadoIso).toLocaleString("es-CO")],
    [],
    ["Documentos en período", String(d.cantidadDocumentos)],
    ["Total ventas vigentes", String(d.totalVigente)],
    ["Documentos anulados", String(d.cantidadAnuladas)],
    ["Total anulado (referencia)", String(d.totalAnulado)],
  ];
}
