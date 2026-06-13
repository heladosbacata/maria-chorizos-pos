/** Query: `?ligaCumplePreview=1` en /caja (solo `NODE_ENV=development`). */
export const LIGA_CUMPLE_PREVIEW_PARAM = "ligaCumplePreview";

export function ligaCumplePreviewActivo(search: string = ""): boolean {
  if (process.env.NODE_ENV === "production") return false;
  const raw = search.startsWith("?") ? search.slice(1) : search;
  const v = new URLSearchParams(raw).get(LIGA_CUMPLE_PREVIEW_PARAM)?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "si" || v === "sí";
}
