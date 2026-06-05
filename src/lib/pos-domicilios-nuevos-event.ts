import type { PedidoDomicilio } from "@/types/pos-domicilios";

export const EVENT_DOMICILIOS_PEDIDO_NUEVO = "pos-domicilios-pedido-nuevo";
export const EVENT_DOMICILIOS_CONTADOR_NUEVOS = "pos-domicilios-contador-nuevos";
export const EVENT_DOMICILIOS_FORZAR_REFRESH = "pos-domicilios-forzar-refresh";

export type DomiciliosPedidoNuevoDetail = {
  pedido: PedidoDomicilio;
  cantidadNuevos: number;
};

export type DomiciliosContadorNuevosDetail = {
  cantidad: number;
  ids: string[];
};

export function emitirDomiciliosPedidoNuevo(detail: DomiciliosPedidoNuevoDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<DomiciliosPedidoNuevoDetail>(EVENT_DOMICILIOS_PEDIDO_NUEVO, { detail }));
}

export function emitirDomiciliosContadorNuevos(detail: DomiciliosContadorNuevosDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<DomiciliosContadorNuevosDetail>(EVENT_DOMICILIOS_CONTADOR_NUEVOS, { detail }));
}

export function emitirDomiciliosForzarRefresh(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT_DOMICILIOS_FORZAR_REFRESH));
}
