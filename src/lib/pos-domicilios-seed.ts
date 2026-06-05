import type { PedidoDomicilio } from "@/types/pos-domicilios";

/** IDs fijos de pedidos demo que se insertaban al abrir Domicilios sin datos reales. */
export const IDS_PEDIDOS_DEMO_DOMICILIOS = new Set([
  "DOM-9012",
  "DOM-9011",
  "DOM-9010",
  "DOM-9009",
  "DOM-9008",
]);

export function esPedidoDemoDomicilio(pedidoId: string): boolean {
  return IDS_PEDIDOS_DEMO_DOMICILIOS.has(pedidoId.trim().toUpperCase());
}

export function filtrarPedidosDemoDomicilios(pedidos: PedidoDomicilio[]): PedidoDomicilio[] {
  return pedidos.filter((p) => !esPedidoDemoDomicilio(p.id));
}

/** Ya no genera pedidos de prueba; todos los PV inician en cero. */
export function buildPedidosSemillaDomicilios(_puntoVenta: string): PedidoDomicilio[] {
  return [];
}
