import type { EstadoDomicilio, PedidoDomicilio } from "@/types/pos-domicilios";

/** Estados que requieren venta registrada en Ventas / facturación. */
export const ESTADOS_DOMICILIO_REQUIEREN_FACTURACION: readonly EstadoDomicilio[] = [
  "EN_ENTREGA",
  "ENTREGADO",
];

/** Pedido ya enviado/registrado como venta para facturar (Ventas e ingresos / comprobantes). */
export function pedidoDomicilioTieneVentaFacturacion(pedido: Pick<
  PedidoDomicilio,
  "facturaVentaLocalId" | "enviadoAFacturacionEnIso" | "facturaElectronicaCufe"
>): boolean {
  return Boolean(
    pedido.facturaVentaLocalId?.trim() ||
      pedido.enviadoAFacturacionEnIso?.trim() ||
      pedido.facturaElectronicaCufe?.trim()
  );
}

/** FE emitida (CUFE). */
export function pedidoDomicilioFacturaElectronicaEmitida(
  pedido: Pick<PedidoDomicilio, "facturaElectronicaCufe">
): boolean {
  return Boolean(pedido.facturaElectronicaCufe?.trim());
}

export function estadoDomicilioRequiereFacturacion(estado: EstadoDomicilio): boolean {
  return (ESTADOS_DOMICILIO_REQUIEREN_FACTURACION as readonly string[]).includes(estado);
}

export function mensajeBloqueoEntregaSinFacturacion(pedidoId: string): string {
  return (
    `El pedido ${pedidoId} aún no está facturado en Ventas e ingresos. ` +
    "Factúrelo primero y luego puede enviarlo a entrega o marcarlo entregado."
  );
}
