export type AutorChatDomicilio = "cliente" | "pos";

export type TipoMensajeChatDomicilio = "texto" | "respuesta_rapida" | "comprobante";

export type RespuestaRapidaDomicilioId = "confirmado" | "modificar" | "anular";

export interface MensajeChatDomicilio {
  id: string;
  puntoVenta: string;
  pedidoId: string;
  autor: AutorChatDomicilio;
  autorLabel: string;
  texto: string;
  creadoEnIso: string;
  /** Clasificación del mensaje (mensajes antiguos: sin campo = texto). */
  tipoMensaje?: TipoMensajeChatDomicilio;
  /** Si el cliente usó una respuesta rápida. */
  respuestaRapidaId?: RespuestaRapidaDomicilioId;
  /** Imagen del comprobante (data URL JPEG/PNG/WebP). */
  adjuntoDataUrl?: string;
  adjuntoNombre?: string;
}

export interface ChatDomicilioListadoResponse {
  ok: boolean;
  data: MensajeChatDomicilio[];
  message?: string;
}

export interface ChatDomicilioEnviarPayload {
  puntoVenta: string;
  pedidoId: string;
  autor: AutorChatDomicilio;
  autorLabel?: string;
  texto: string;
  tipoMensaje?: TipoMensajeChatDomicilio;
  respuestaRapidaId?: RespuestaRapidaDomicilioId;
  adjuntoDataUrl?: string;
  adjuntoNombre?: string;
}

export interface ChatDomicilioEnviarResponse {
  ok: boolean;
  message?: string;
  mensaje?: MensajeChatDomicilio;
}

/** Textos que envía el cliente con un toque (landing pedidos). */
export const RESPUESTAS_RAPIDAS_CLIENTE_DOMICILIO: readonly {
  id: RespuestaRapidaDomicilioId;
  etiqueta: string;
  texto: string;
}[] = [
  {
    id: "confirmado",
    etiqueta: "Confirmado",
    texto: "Confirmo el pedido según el resumen enviado. Gracias.",
  },
  {
    id: "modificar",
    etiqueta: "Modificar pedido",
    texto: "Necesito modificar algo de mi pedido. Les detallo a continuación:",
  },
  {
    id: "anular",
    etiqueta: "Anular pedido",
    texto: "Solicito anular mi pedido.",
  },
];

export function etiquetaRespuestaRapidaDomicilio(id: RespuestaRapidaDomicilioId | undefined): string {
  if (!id) return "";
  const row = RESPUESTAS_RAPIDAS_CLIENTE_DOMICILIO.find((x) => x.id === id);
  return row?.etiqueta ?? id;
}
