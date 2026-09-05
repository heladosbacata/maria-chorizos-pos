/** Evento: cambió el conteo de respuestas WMS no vistas del índice de satisfacción. */
export const EVENT_INDICE_SATISFACCION_RESPUESTAS_CAMBIO = "posgeb-indice-satisfaccion-respuestas-cambio";

export type IndiceSatisfaccionRespuestasCambioDetail = {
  puntoVenta: string;
  count: number;
};

export function emitirIndiceSatisfaccionRespuestasCambio(
  detail: IndiceSatisfaccionRespuestasCambioDetail
): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<IndiceSatisfaccionRespuestasCambioDetail>(
      EVENT_INDICE_SATISFACCION_RESPUESTAS_CAMBIO,
      { detail }
    )
  );
}
