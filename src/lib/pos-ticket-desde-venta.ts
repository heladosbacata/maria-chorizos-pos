import { fechaHoraColombia } from "@/lib/fecha-colombia";
import { resumenIvaDesdeTotalConIvaIncluido } from "@/lib/iva-precios-incluidos";
import type { VentaGuardadaLocal } from "@/lib/pos-ventas-local-storage";
import type { TicketVentaPayload } from "@/types/impresion-pos";

/** Arma el payload de tirilla igual al cobro (o copia para reimpresión). */
export function payloadTicketDesdeVenta(
  v: VentaGuardadaLocal,
  opts?: { copia?: boolean }
): TicketVentaPayload {
  const t = new Date(v.isoTimestamp);
  const fechaHora = Number.isNaN(t.getTime()) ? v.isoTimestamp : fechaHoraColombia(t);
  const tieneFe = Boolean(v.facturaElectronicaCufe?.trim() || v.facturaElectronicaNumero?.trim());
  const alCobro = v.tipoComprobanteAlCobro;
  let tipoComprobanteLabel: string;
  if (alCobro === "factura_electronica") {
    tipoComprobanteLabel = tieneFe ? "Factura electrónica (DIAN)" : "Factura electrónica — pendiente DIAN";
  } else if (alCobro === "documento_interno") {
    tipoComprobanteLabel = "Doc. interno (recibo POS)";
  } else {
    tipoComprobanteLabel = tieneFe ? "Factura electrónica (DIAN)" : "Recibo POS";
  }
  const copia = opts?.copia === true;
  const cliente =
    v.clienteNombreVenta?.trim() ||
    (v.cajeroNombre?.trim() ? v.cajeroNombre.trim() : "") ||
    "Consumidor final";
  const notaBase = v.pagoResumen?.trim() ?? "";
  const notaPie = copia
    ? (notaBase ? `${notaBase}\n` : "") + `Copia · ID ${v.id.slice(0, 24)}…`
    : notaBase || "Gracias por elegirnos — calidad y sabor en cada visita.";

  return {
    titulo: copia ? "TICKET DE VENTA (copia)" : "TICKET DE VENTA",
    puntoVenta: v.puntoVenta,
    precuentaNombre: "Recibo",
    fechaHora,
    clienteNombre: cliente,
    tipoComprobanteLabel,
    vendedorLabel: v.cajeroNombre?.trim() || "—",
    lineas: v.lineas.map((l) => ({
      descripcion: l.descripcion,
      cantidad: l.cantidad,
      precioUnitario: l.precioUnitario,
      subtotal: Math.round(l.precioUnitario * l.cantidad * 100) / 100,
      ...(l.detalleVariante?.trim() ? { detalleVariante: l.detalleVariante.trim() } : {}),
    })),
    total: v.total,
    ...(alCobro === "factura_electronica" || tieneFe
      ? { desgloseIvaPreciosIncluidos: resumenIvaDesdeTotalConIvaIncluido(v.total) }
      : {}),
    ...(tieneFe
      ? {
          facturaElectronica: {
            ...(v.facturaElectronicaNumero?.trim() ? { numero: v.facturaElectronicaNumero.trim() } : {}),
            ...(v.facturaElectronicaCufe?.trim() ? { cufe: v.facturaElectronicaCufe.trim() } : {}),
            ...(v.facturaElectronicaEnviadoAt?.trim() ? { enviadoAt: v.facturaElectronicaEnviadoAt.trim() } : {}),
            adquirenteNombre: cliente,
            proveedorTecnologico: "Alegra / e-provider Colombia",
          },
        }
      : {}),
    notaPie,
  };
}
