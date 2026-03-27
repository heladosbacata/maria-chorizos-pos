/** Contrato POS ↔ WMS: envíos desde casa matriz (recepción en punto de venta). */

export interface LineaEnvioMatriz {
  sku: string;
  descripcion: string;
  /** Cantidad enviada desde matriz */
  cantidadDespachada: number;
}

export interface LineaRecepcionPayload {
  sku: string;
  cantidadRecibida: number;
  comentario?: string;
}

/** Ítem en listado GET .../envios-matriz */
export interface EnvioMatrizListItem {
  id: string;
  estado?: string;
  idDespacho?: string;
  puntoVentaDestino?: string;
  fechaDespacho?: string;
  fechaCreacion?: string;
  comentario?: string;
  lineas?: LineaEnvioMatriz[];
  raw?: Record<string, unknown>;
}

export interface EnvioMatrizListadoResponse {
  ok: boolean;
  data?: EnvioMatrizListItem[];
  pendientes?: number;
  puntoVenta?: string;
  message?: string;
}

export interface EnvioMatrizDetalleData {
  id: string;
  estado?: string;
  idDespacho?: string;
  puntoVentaDestino?: string;
  fechaDespacho?: string;
  lineas: LineaEnvioMatriz[];
  raw?: Record<string, unknown>;
}

export interface EnvioMatrizDetalleResponse {
  ok: boolean;
  data?: EnvioMatrizDetalleData;
  message?: string;
}

export interface RecepcionMatrizPayload {
  lineas: LineaRecepcionPayload[];
  comentarioGeneral?: string;
}
