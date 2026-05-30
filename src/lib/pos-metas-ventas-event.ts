/** El POS registró o anuló una venta; el banner de metas debe recalcular avance. */
export const EVENT_POS_VENTA_LOCAL_REGISTRADA = "posgeb-venta-local-registrada";

export function emitirVentaLocalRegistrada(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT_POS_VENTA_LOCAL_REGISTRADA));
}

/** Alias explícito para anulaciones y sincronización manual. */
export function emitirMetasVentasActualizadas(): void {
  emitirVentaLocalRegistrada();
}
