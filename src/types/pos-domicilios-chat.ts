export type AutorChatDomicilio = "cliente" | "pos";

export interface MensajeChatDomicilio {
  id: string;
  puntoVenta: string;
  pedidoId: string;
  autor: AutorChatDomicilio;
  autorLabel: string;
  texto: string;
  creadoEnIso: string;
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
}

export interface ChatDomicilioEnviarResponse {
  ok: boolean;
  message?: string;
  mensaje?: MensajeChatDomicilio;
}
