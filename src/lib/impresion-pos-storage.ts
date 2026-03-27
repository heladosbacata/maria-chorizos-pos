import type { ImpresionPosPrefs } from "@/types/impresion-pos";

const STORAGE_KEY = "posGeb_impresion_prefs_v1";

export const DEFAULT_IMPRESION_PREFS: ImpresionPosPrefs = {
  metodo: "directa",
  impresoraNombre: "",
  tamanoPapel: "80mm",
  copias: 1,
  margenSuperiorMm: 2,
  margenInferiorMm: 2,
  margenIzquierdaMm: 2,
  margenDerechaMm: 2,
  impresionSimpleSinLogo: true,
  imprimirAutomaticoAlCobrar: true,
};

function num(v: unknown, d: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : d;
}

export function loadImpresionPrefs(): ImpresionPosPrefs {
  if (typeof window === "undefined") return { ...DEFAULT_IMPRESION_PREFS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_IMPRESION_PREFS };
    const j = JSON.parse(raw) as Record<string, unknown>;
    return {
      metodo: j.metodo === "navegador" ? "navegador" : "directa",
      impresoraNombre: typeof j.impresoraNombre === "string" ? j.impresoraNombre : "",
      tamanoPapel:
        j.tamanoPapel === "58mm" || j.tamanoPapel === "A4" ? j.tamanoPapel : "80mm",
      copias: Math.min(9, Math.max(1, Math.trunc(num(j.copias, 1)))),
      margenSuperiorMm: Math.max(0, num(j.margenSuperiorMm, 2)),
      margenInferiorMm: Math.max(0, num(j.margenInferiorMm, 2)),
      margenIzquierdaMm: Math.max(0, num(j.margenIzquierdaMm, 2)),
      margenDerechaMm: Math.max(0, num(j.margenDerechaMm, 2)),
      impresionSimpleSinLogo: j.impresionSimpleSinLogo !== false,
      imprimirAutomaticoAlCobrar: j.imprimirAutomaticoAlCobrar !== false,
    };
  } catch {
    return { ...DEFAULT_IMPRESION_PREFS };
  }
}

export function saveImpresionPrefs(p: ImpresionPosPrefs): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    // ignore
  }
}
