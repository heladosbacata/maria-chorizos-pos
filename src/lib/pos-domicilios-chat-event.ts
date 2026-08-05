import type { PedidoDomicilio } from "@/types/pos-domicilios";

export const EVENT_DOMICILIOS_ABRIR_CHAT = "pos-domicilios-abrir-chat";
export const EVENT_DOMICILIOS_MENSAJE_CLIENTE = "pos-domicilios-mensaje-cliente";

export type DomiciliosAbrirChatDetail = {
  pedido: PedidoDomicilio;
  marcoEntradaNuevo?: boolean;
  enviarResumenAuto?: boolean;
};

export type DomiciliosMensajeClienteDetail = {
  puntoVenta: string;
  pedidoId: string;
  clienteNombre: string;
  noLeidosPedido: number;
  noLeidosTotal: number;
};

export function emitirDomiciliosAbrirChat(detail: DomiciliosAbrirChatDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<DomiciliosAbrirChatDetail>(EVENT_DOMICILIOS_ABRIR_CHAT, { detail }));
}

export function emitirDomiciliosMensajeCliente(detail: DomiciliosMensajeClienteDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<DomiciliosMensajeClienteDetail>(EVENT_DOMICILIOS_MENSAJE_CLIENTE, { detail })
  );
}
