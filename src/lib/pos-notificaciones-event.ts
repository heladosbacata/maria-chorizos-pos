/** Evento: el franquiciado registró y envió el TestSetId DIAN (mostrar en bandeja / campana del POS). */
export const EVENT_DIAN_TEST_SET_REGISTRADO = "posgeb-dian-test-set-registrado";

export type DianTestSetRegistradoDetail = {
  dianTestSetId: string;
  puntoVenta: string;
  mensaje: string;
};

export function emitirDianTestSetRegistrado(detail: DianTestSetRegistradoDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<DianTestSetRegistradoDetail>(EVENT_DIAN_TEST_SET_REGISTRADO, { detail }));
}
