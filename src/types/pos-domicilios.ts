export type EstadoDomicilio =
  | "NUEVO"
  | "ACEPTADO"
  | "EN_PREPARACION"
  | "LISTO_PARA_DESPACHO"
  | "EN_ENTREGA"
  | "ENTREGADO"
  | "RECHAZADO";

export type MetodoPagoDomicilio = "efectivo" | "transferencia" | "datafono";
export type CanalDomicilio = "web" | "whatsapp" | "qr";

export interface PedidoDomicilio {
  id: string;
  puntoVenta: string;
  cliente: string;
  telefono: string;
  direccion: string;
  referencia?: string;
  total: number;
  metodoPago: MetodoPagoDomicilio;
  canal: CanalDomicilio;
  estado: EstadoDomicilio;
  creadoEnIso: string;
  items: string[];
  tiempoObjetivoMin: number;
  rechazoMotivo?: string;
  rechazadoEnIso?: string;
}

export interface DomiciliosListadoResponse {
  ok: boolean;
  data: PedidoDomicilio[];
  message?: string;
}

export interface DomicilioCambioEstadoPayload {
  puntoVenta: string;
  pedidoId: string;
  estado: EstadoDomicilio;
  motivo?: string;
}

export interface DomicilioCambioEstadoResponse {
  ok: boolean;
  pedido?: PedidoDomicilio;
  message?: string;
}

export interface DomicilioCrearPayload {
  puntoVenta: string;
  cliente: string;
  telefono: string;
  direccion: string;
  referencia?: string;
  total: number;
  metodoPago: MetodoPagoDomicilio;
  canal: CanalDomicilio;
  items: string[];
  tiempoObjetivoMin?: number;
}

export interface DomicilioCrearResponse {
  ok: boolean;
  pedido?: PedidoDomicilio;
  message?: string;
}
