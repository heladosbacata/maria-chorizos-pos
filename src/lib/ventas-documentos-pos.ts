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
  const tieneFe = Boolean(v.facturaElectronicaCufe?.trim() || v.facturaElectronicaNumero?.trim());
  const tipo = tieneFe ? "factura_electronica" : "recibo_pos";
  const comprobante = tieneFe
    ? v.facturaElectronicaNumero?.trim() || `POS-${v.id.slice(0, 8)}`
    : `POS-${v.id.slice(0, 12)}`;
  const anulada = v.anulada === true;
  return {
    id: `venta:${v.id}`,
    fuente: "venta",
    tipo,
    fechaYmd: v.fechaYmd,
    fechaMs: msDesdeIso(v.isoTimestamp),
    comprobante,
    tipoLabel: tieneFe ? "Factura electrónica de venta" : "Recibo POS",
    clienteNombre: v.cajeroNombre?.trim() ? `Cajero: ${v.cajeroNombre.trim()}` : "Consumidor final",
    clienteDocumento: "",
    total: v.total,
    saldoLabel: anulada ? "Anulada" : "Pagada",
    dianLabel: tieneFe ? (v.facturaElectronicaCufe?.trim() ? "Con CUFE" : "Emitida") : "—",
    estadoLabel: anulada ? "Anulada" : "Vigente",
    anulada,
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
    clienteNombre: d.clienteNombre.trim() || "—",
    clienteDocumento: d.clienteDocumento?.trim() ?? "",
    total: Math.round(totalDocumento(d) * 100) / 100,
    saldoLabel: "Borrador",
    dianLabel: "—",
    estadoLabel: "Guardado",
    anulada: false,
    documento: d,
  };
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
      f.tipoLabel.toLowerCase().includes(q);
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
