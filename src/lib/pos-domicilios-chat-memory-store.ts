import type { MensajeChatDomicilio } from "@/types/pos-domicilios-chat";

const globalForPos = globalThis as unknown as {
  __posDomiciliosChatStore__?: Map<string, MensajeChatDomicilio[]>;
};

function keyChat(puntoVenta: string, pedidoId: string): string {
  return `${puntoVenta.trim().toLowerCase()}::${pedidoId.trim().toUpperCase()}`;
}

function store(): Map<string, MensajeChatDomicilio[]> {
  if (!globalForPos.__posDomiciliosChatStore__) {
    globalForPos.__posDomiciliosChatStore__ = new Map<string, MensajeChatDomicilio[]>();
  }
  return globalForPos.__posDomiciliosChatStore__;
}

export function getMensajesChatMemory(puntoVenta: string, pedidoId: string): MensajeChatDomicilio[] {
  const k = keyChat(puntoVenta, pedidoId);
  if (!k.trim()) return [];
  return store().get(k) ?? [];
}

export function appendMensajeChatMemory(msg: MensajeChatDomicilio): void {
  const k = keyChat(msg.puntoVenta, msg.pedidoId);
  if (!k.trim()) return;
  const prev = store().get(k) ?? [];
  store().set(k, [...prev, msg]);
}
