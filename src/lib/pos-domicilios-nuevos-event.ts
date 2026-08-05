import type { PedidoDomicilio } from "@/types/pos-domicilios";

export const EVENT_DOMICILIOS_PEDIDO_NUEVO = "pos-domicilios-pedido-nuevo";
export const EVENT_DOMICILIOS_CONTADOR_NUEVOS = "pos-domicilios-contador-nuevos";
export const EVENT_DOMICILIOS_FORZAR_REFRESH = "pos-domicilios-forzar-refresh";
/** Dock: aviso vibrante de pedido nuevo (antes del modal). */
export const EVENT_DOMICILIOS_AVISO_PEDIDO_NUEVO = "pos-domicilios-aviso-pedido-nuevo";
/** Cajero tocó el aviso → abrir modal aceptar/rechazar. */
export const EVENT_DOMICILIOS_ABRIR_ALERTA_PEDIDO = "pos-domicilios-abrir-alerta-pedido";
/** Modal atendido o cola vacía → limpiar aviso del dock. */
export const EVENT_DOMICILIOS_ALERTA_ATENDIDA = "pos-domicilios-alerta-atendida";

export type DomiciliosPedidoNuevoDetail = {
  pedido: PedidoDomicilio;
  cantidadNuevos: number;
};

export type DomiciliosContadorNuevosDetail = {
  cantidad: number;
  ids: string[];
};

export type DomiciliosAvisoPedidoNuevoDetail = {
  pedido: PedidoDomicilio;
  cantidadEnCola: number;
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

export function emitirDomiciliosAvisoPedidoNuevo(detail: DomiciliosAvisoPedidoNuevoDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<DomiciliosAvisoPedidoNuevoDetail>(EVENT_DOMICILIOS_AVISO_PEDIDO_NUEVO, { detail })
  );
}

export function emitirDomiciliosAbrirAlertaPedido(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT_DOMICILIOS_ABRIR_ALERTA_PEDIDO));
}

export function emitirDomiciliosAlertaAtendida(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT_DOMICILIOS_ALERTA_ATENDIDA));
}
