export const EVENTO_POS_TURNO_PAUSA = "pos-turno-pausa";

export type PausaTurnoPos = {
  motivo: string;
  pausadoPor: string;
  pausadoEn: string | null;
  respuesta: string | null;
  respondidoEn: string | null;
};

export function emitirPausaTurnoPos(pausa: PausaTurnoPos | null): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<PausaTurnoPos | null>(EVENTO_POS_TURNO_PAUSA, { detail: pausa }));
}

export function esPausaTurnoPos(value: unknown): value is PausaTurnoPos {
  if (!value || typeof value !== "object") return false;
  const motivo = (value as { motivo?: unknown }).motivo;
  return typeof motivo === "string" && motivo.trim().length > 0;
}
