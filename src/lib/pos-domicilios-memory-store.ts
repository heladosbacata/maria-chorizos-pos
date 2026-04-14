import { buildPedidosSemillaDomicilios } from "@/lib/pos-domicilios-seed";
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
  if (current?.length) return current;
  const seed = buildPedidosSemillaDomicilios(pv);
  map.set(pv, seed);
  return seed;
}

export function setPedidosMemory(puntoVenta: string, pedidos: PedidoDomicilio[]): void {
  const pv = puntoVenta.trim();
  if (!pv) return;
  store().set(pv, pedidos);
}
