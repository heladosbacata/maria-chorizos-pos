import type { PedidoDomicilio } from "@/types/pos-domicilios";

export const EVENT_DOMICILIOS_ABRIR_CHAT = "pos-domicilios-abrir-chat";

export type DomiciliosAbrirChatDetail = {
  pedido: PedidoDomicilio;
  marcoEntradaNuevo?: boolean;
  enviarResumenAuto?: boolean;
};

export function emitirDomiciliosAbrirChat(detail: DomiciliosAbrirChatDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<DomiciliosAbrirChatDetail>(EVENT_DOMICILIOS_ABRIR_CHAT, { detail }));
}
