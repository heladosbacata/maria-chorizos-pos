import { filtrarPedidosDemoDomicilios } from "@/lib/pos-domicilios-seed";
import type { PedidoDomicilio } from "@/types/pos-domicilios";

const globalForPos = globalThis as unknown as {
  __posDomiciliosStore__?: Map<string, PedidoDomicilio[]>;
};

function store(): Map<string, PedidoDomicilio[]> {
  if (!globalForPos.__posDomiciliosStore__) {
    globalForPos.__posDomiciliosStore__ = new Map<string, PedidoDomicilio[]>();
  }
  return globalForPos.__posDomiciliosStore__;
}

export function getPedidosMemory(puntoVenta: string): PedidoDomicilio[] {
  const pv = puntoVenta.trim();
  if (!pv) return [];
  const map = store();
  const current = map.get(pv);
  if (!current?.length) return [];
  const limpio = filtrarPedidosDemoDomicilios(current);
  if (limpio.length !== current.length) map.set(pv, limpio);
  return limpio;
}

export function setPedidosMemory(puntoVenta: string, pedidos: PedidoDomicilio[]): void {
  const pv = puntoVenta.trim();
  if (!pv) return;
  store().set(pv, pedidos);
}
