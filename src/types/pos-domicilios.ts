export type EstadoDomicilio =
  | "NUEVO"
  | "ACEPTADO"
  | "EN_PREPARACION"
  | "LISTO_PARA_DESPACHO"
  | "EN_ENTREGA"
  | "ENTREGADO"
  | "RECHAZADO"
  | "CANCELADO";

/** Estados en los que el cliente aún puede cancelar su pedido desde /pedidos. */
export const ESTADOS_CANCELABLES_POR_CLIENTE: readonly EstadoDomicilio[] = [
  "NUEVO",
  "ACEPTADO",
  "EN_PREPARACION",
  "LISTO_PARA_DESPACHO",
];

export function pedidoPuedeCancelarsePorCliente(estado: EstadoDomicilio): boolean {
  return (ESTADOS_CANCELABLES_POR_CLIENTE as readonly string[]).includes(estado);
}

export type MetodoPagoDomicilio = "efectivo" | "transferencia" | "datafono";
export type CanalDomicilio = "web" | "whatsapp" | "qr";
export type TipoEntregaDomicilio = "domicilio" | "recogida";

export interface PedidoDomicilio {
  id: string;
  puntoVenta: string;
  cliente: string;
  telefono: string;
  /** Solo dígitos (últimos 10) para historial / búsqueda. */
  telefonoNorm?: string;
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
  /** Venta local creada al marcar LISTO (puente a facturación / Ventas). */
  facturaVentaLocalId?: string;
  /** ISO cuando el pedido se envió a la cola de facturación. */
  enviadoAFacturacionEnIso?: string;
  /** CUFE si ya se emitió FE desde domicilios. */
  facturaElectronicaCufe?: string;
  /** Cédula / documento validado para Club de Millas (opcional). */
  clienteDocumento?: string;
  /** socioId del plan de millas si el cliente lo vinculó al pedir. */
  clienteFrecuenteSocioId?: string;
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
  tipoEntrega?: TipoEntregaDomicilio;
  /** Cédula validada en Club de Millas al confirmar el pedido web. */
  clienteDocumento?: string;
  clienteFrecuenteSocioId?: string;
}

export interface DomicilioCrearResponse {
  ok: boolean;
  pedido?: PedidoDomicilio;
  message?: string;
}

export interface DomicilioEliminarRechazadoPayload {
  puntoVenta: string;
  pedidoId?: string;
  limpiarTodosRechazados?: boolean;
  claveEspacioFranquiciados: string;
}

export interface DomicilioEliminarRechazadoResponse {
  ok: boolean;
  eliminados?: number;
  message?: string;
}
