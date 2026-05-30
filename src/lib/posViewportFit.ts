/**
 * Autoajuste de UI del POS para pantallas pequeñas (p. ej. portátiles 13").
 */

export type PosViewportFitMode = "auto" | "100" | "90" | "80" | "75";

export const POS_VIEWPORT_FIT_STORAGE_KEY = "pos_ui_fit_v1";
export const POS_VIEWPORT_FIT_HINT_KEY = "pos_ui_fit_hint_seen_v1";

/** Resolución de referencia con la que se diseñó la caja. */
export const DESIGN_BASE_WIDTH = 1440;
export const DESIGN_BASE_HEIGHT = 900;

export const MIN_AUTO_SCALE = 0.75;
export const MAX_SCALE = 1;

export const POS_VIEWPORT_FIT_MODES: {
  id: PosViewportFitMode;
  label: string;
  short: string;
}[] = [
  { id: "auto", label: "Automático", short: "Auto" },
  { id: "100", label: "Normal (100%)", short: "100%" },
  { id: "90", label: "Compacto (90%)", short: "90%" },
  { id: "80", label: "Muy compacto (80%)", short: "80%" },
  { id: "75", label: "Mínimo (75%)", short: "75%" },
];

export function isPosViewportFitMode(v: string): v is PosViewportFitMode {
  return POS_VIEWPORT_FIT_MODES.some((m) => m.id === v);
}

export function readStoredViewportFitMode(): PosViewportFitMode {
  if (typeof window === "undefined") return "auto";
  try {
    const raw = localStorage.getItem(POS_VIEWPORT_FIT_STORAGE_KEY);
    if (raw && isPosViewportFitMode(raw)) return raw;
  } catch {
    /* ignore */
  }
  return "auto";
}

export function writeStoredViewportFitMode(mode: PosViewportFitMode): void {
  try {
    localStorage.setItem(POS_VIEWPORT_FIT_STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

export function hasSeenViewportFitHint(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(POS_VIEWPORT_FIT_HINT_KEY) === "1";
  } catch {
    return true;
  }
}

export function markViewportFitHintSeen(): void {
  try {
    localStorage.setItem(POS_VIEWPORT_FIT_HINT_KEY, "1");
  } catch {
    /* ignore */
  }
}

/** Escala numérica efectiva (0.75–1). */
export function computeViewportScale(
  mode: PosViewportFitMode,
  width: number,
  height: number
): number {
  if (mode === "100") return 1;
  if (mode === "90") return 0.9;
  if (mode === "80") return 0.8;
  if (mode === "75") return MIN_AUTO_SCALE;

  const sw = width / DESIGN_BASE_WIDTH;
  const sh = height / DESIGN_BASE_HEIGHT;
  const auto = Math.min(MAX_SCALE, sw, sh);
  return Math.max(MIN_AUTO_SCALE, Math.min(MAX_SCALE, auto));
}

export function pantallaConsideradaPequena(width: number, height: number): boolean {
  return width < 1366 || height < 800;
}

export function etiquetaEscala(scale: number): string {
  return `${Math.round(scale * 100)}%`;
}
