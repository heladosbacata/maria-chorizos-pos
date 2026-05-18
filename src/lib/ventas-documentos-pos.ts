import { fechaColombia, finDiaColombiaMs, inicioDiaColombiaMs, mediodiaColombiaDesdeYmd } from "@/lib/fecha-colombia";
import type { DocumentoComercialFirestoreDoc } from "@/lib/documentos-comerciales-firestore";
import type { VentaGuardadaLocal } from "@/lib/pos-ventas-local-storage";

export type TabDocumentoPosVenta =
  | "todos"
  | "factura_electronica"
  | "recibo_pos"
  | "cotizacion"
  | "remision";

export type FilaDocumentoPosVenta = {
  id: string;
  fuente: "venta" | "documento";
  tipo: "factura_electronica" | "recibo_pos" | "cotizacion" | "remision";
  fechaYmd: string;
  fechaMs: number;
  comprobante: string;
  tipoLabel: string;
  clienteNombre: string;
  clienteDocumento: string;
  total: number;
  saldoLabel: string;
  dianLabel: string;
  estadoLabel: string;
  anulada: boolean;
  /** Texto largo para tooltip (email al comprador; no es estado DIAN). */
  emailLabel: string;
  /** Texto corto del badge de email (ej. «Sin correo» / «Correo ok»). */
  correoClienteCorto: string;
  /** FE vs documento interno (según lo elegido al cobrar o inferencia en ventas antiguas). */
  tipoComprobanteBadge: string;
  emailEnviado: boolean;
  emailDestino?: string;
  emailSugerido?: string;
  puedeEnviarCorreo: boolean;
  venta?: VentaGuardadaLocal;
  documento?: DocumentoComercialFirestoreDoc;
};

function totalDocumento(d: DocumentoComercialFirestoreDoc): number {
  return d.lineas.reduce((s, l) => s + l.cantidad * l.precioUnitario, 0);
}

function msDesdeIso(iso: string): number {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

function ventaAFila(v: VentaGuardadaLocal): FilaDocumentoPosVenta {
  const alCobro = v.tipoComprobanteAlCobro;
  const tieneFe = Boolean(v.facturaElectronicaCufe?.trim() || v.facturaElectronicaNumero?.trim());
  let tipo: FilaDocumentoPosVenta["tipo"];
  if (alCobro === "factura_electronica") tipo = "factura_electronica";
  else if (alCobro === "documento_interno") tipo = "recibo_pos";
  else tipo = tieneFe ? "factura_electronica" : "recibo_pos";

  const tipoComprobanteBadge = tipo === "factura_electronica" ? "FE" : "Interno";
  const tipoLabel =
    alCobro === "factura_electronica"
      ? tieneFe
        ? "Factura electrónica (DIAN)"
        : "Factura electrónica — pendiente o error en Alegra"
      : alCobro === "documento_interno"
        ? "Doc. interno (recibo POS)"
        : tieneFe
          ? "Factura electrónica (DIAN)"
          : "Doc. interno (recibo POS)";

  const comprobante = tieneFe
    ? v.facturaElectronicaNumero?.trim() || `POS-${v.id.slice(0, 8)}`
    : `POS-${v.id.slice(0, 12)}`;
  const anulada = v.anulada === true;
  const emailEnviado = Boolean(v.comprobanteEmailEnviadoAt?.trim());
  const emailDestino = v.comprobanteEmailDestino?.trim();
  const clienteNombre = v.clienteNombreVenta?.trim()
    ? v.clienteNombreVenta.trim()
    : v.cajeroNombre?.trim()
      ? `Cajero: ${v.cajeroNombre.trim()}`
      : "Consumidor final";
  const clienteDocumento = v.clienteNitVenta?.trim() ?? "";
  const dianLabel =
    tipo === "factura_electronica"
      ? v.facturaElectronicaCufe?.trim()
        ? "Con CUFE"
        : "Sin CUFE"
      : "—";
  return {
    id: `venta:${v.id}`,
    fuente: "venta",
    tipo,
    fechaYmd: v.fechaYmd,
    fechaMs: msDesdeIso(v.isoTimestamp),
    comprobante,
    tipoLabel,
    tipoComprobanteBadge,
    clienteNombre,
    clienteDocumento,
    total: v.total,
    saldoLabel: anulada ? "Anulada" : "Pagada",
    dianLabel,
    estadoLabel: anulada ? "Anulada" : "Vigente",
    anulada,
    emailLabel: emailEnviado
      ? "Correo al comprador: ya enviado"
      : "Correo al comprador: pendiente (no indica si la DIAN recibió la factura)",
    correoClienteCorto: emailEnviado ? "Correo ok" : "Sin correo",
    emailEnviado,
    ...(emailDestino ? { emailDestino } : {}),
    ...(v.clienteEmailVenta?.trim() ? { emailSugerido: v.clienteEmailVenta.trim() } : {}),
    puedeEnviarCorreo: !anulada,
    venta: v,
  };
}

function documentoAFila(d: DocumentoComercialFirestoreDoc): FilaDocumentoPosVenta {
  const ymd = d.fechaIso.slice(0, 10);
  return {
    id: `doc:${d.id}`,
    fuente: "documento",
    tipo: d.tipo,
    fechaYmd: /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : d.fechaIso.slice(0, 10),
    fechaMs: msDesdeIso(d.fechaIso),
    comprobante: d.numeroDocumento.trim() || d.id.slice(0, 10),
    tipoLabel: d.tipo === "cotizacion" ? "Cotización" : "Remisión",
    tipoComprobanteBadge: d.tipo === "cotizacion" ? "Cotiz." : "Rem.",
    clienteNombre: d.clienteNombre.trim() || "—",
    clienteDocumento: d.clienteDocumento?.trim() ?? "",
    total: Math.round(totalDocumento(d) * 100) / 100,
    saldoLabel: "Borrador",
    dianLabel: "—",
    estadoLabel: "Guardado",
    anulada: false,
    emailLabel: "Correo al comprador: pendiente",
    correoClienteCorto: "Sin correo",
    emailEnviado: false,
    puedeEnviarCorreo: true,
    documento: d,
  };
}

export function filaComprobanteCorreoBody(f: FilaDocumentoPosVenta, puntoVenta: string) {
  if (f.venta) {
    const v = f.venta;
    const tieneFe = Boolean(v.facturaElectronicaCufe?.trim() || v.facturaElectronicaNumero?.trim());
    return {
      ventaLocalId: v.id,
      comprobante: f.comprobante,
      tipoLabel: f.tipoLabel,
      total: v.total,
      fechaIso: v.isoTimestamp,
      puntoVenta,
      lineas: v.lineas.map((l) => ({
        descripcion: l.descripcion,
        cantidad: l.cantidad,
        precioUnitario: l.precioUnitario,
      })),
      clienteNombre: v.clienteNombreVenta?.trim() || f.clienteNombre,
      clienteNit: v.clienteNitVenta?.trim(),
      ...(tieneFe
        ? {
            facturaElectronica: {
              numero: v.facturaElectronicaNumero?.trim(),
              cufe: v.facturaElectronicaCufe?.trim(),
            },
          }
        : {}),
    };
  }
  if (f.documento) {
    const d = f.documento;
    return {
      comprobante: f.comprobante,
      tipoLabel: f.tipoLabel,
      total: f.total,
      fechaIso: d.fechaIso,
      puntoVenta,
      lineas: d.lineas.map((l) => ({
        descripcion: l.descripcion || l.sku,
        cantidad: l.cantidad,
        precioUnitario: l.precioUnitario,
      })),
      clienteNombre: d.clienteNombre.trim() || undefined,
      clienteNit: d.clienteDocumento?.trim(),
    };
  }
  return null;
}

export function construirFilasDocumentosPos(params: {
  ventas: VentaGuardadaLocal[];
  cotizaciones: DocumentoComercialFirestoreDoc[];
  remisiones: DocumentoComercialFirestoreDoc[];
}): FilaDocumentoPosVenta[] {
  const rows: FilaDocumentoPosVenta[] = [];
  for (const v of params.ventas) rows.push(ventaAFila(v));
  for (const c of params.cotizaciones) rows.push(documentoAFila(c));
  for (const r of params.remisiones) rows.push(documentoAFila(r));
  return rows.sort((a, b) => b.fechaMs - a.fechaMs);
}

export function filtrarFilasDocumentosPos(
  filas: FilaDocumentoPosVenta[],
  opts: {
    tab: TabDocumentoPosVenta;
    desdeYmd: string;
    hastaYmd: string;
    busqueda: string;
    soloVigentes: boolean;
  }
): FilaDocumentoPosVenta[] {
  const desde = inicioDiaColombiaMs(opts.desdeYmd);
  const hasta = finDiaColombiaMs(opts.hastaYmd);
  const q = opts.busqueda.trim().toLowerCase();
  return filas.filter((f) => {
    if (opts.tab !== "todos" && f.tipo !== opts.tab) return false;
    if (opts.soloVigentes && f.anulada) return false;
    if (Number.isFinite(desde) && Number.isFinite(hasta) && f.fechaMs > 0) {
      if (f.fechaMs < desde || f.fechaMs > hasta) return false;
    } else if (f.fechaYmd) {
      if (f.fechaYmd < opts.desdeYmd || f.fechaYmd > opts.hastaYmd) return false;
    }
    if (!q) return true;
    const hay =
      f.comprobante.toLowerCase().includes(q) ||
      f.clienteNombre.toLowerCase().includes(q) ||
      f.clienteDocumento.toLowerCase().includes(q) ||
      f.tipoLabel.toLowerCase().includes(q) ||
      f.tipoComprobanteBadge.toLowerCase().includes(q);
    return hay;
  });
}

export function formatoFechaTabla(ymd: string, fechaMs: number): string {
  const d = fechaMs > 0 ? new Date(fechaMs) : mediodiaColombiaDesdeYmd(ymd);
  return fechaColombia(d, { day: "numeric", month: "short", year: "numeric" });
}

export function formatoPesos(n: number): string {
  return `$ ${n.toLocaleString("es-CO", { maximumFractionDigits: 0 })}`;
}
