import type { PlanBonosLogroPublicado } from "@/lib/plan-bonos-artesanos";
import { ymdColombia } from "@/lib/fecha-colombia";

/** Query: `?planBonosAviso=1` en /caja (solo desarrollo / localhost). */
export const PLAN_BONOS_AVISO_PREVIEW_PARAM = "planBonosAviso";

export function planBonosAvisoPreviewActivo(search: string = ""): boolean {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  const v = new URLSearchParams(raw).get(PLAN_BONOS_AVISO_PREVIEW_PARAM)?.trim().toLowerCase();
  const on = v === "1" || v === "true" || v === "si" || v === "sí";
  if (!on) return false;
  if (process.env.NODE_ENV !== "production") return true;
  if (typeof window !== "undefined") {
    const h = window.location.hostname;
    if (h === "localhost" || h === "127.0.0.1") return true;
  }
  return false;
}

/** Logro simulado de otro punto para ver el aviso remoto + emojis. */
export function logroPlanBonosPreview(): PlanBonosLogroPublicado {
  return {
    id: "preview_plan_bonos_aviso",
    metaId: "plata_700",
    umbralCOP: 700_000,
    bonoCOP: 20_000,
    etiqueta: "Meta plata",
    tono: "plata",
    puntoVenta: "Punto Norte (ejemplo)",
    ventaAlcanzada: 712_000,
    ymd: ymdColombia(),
    createdAtMs: Date.now(),
    artesanoNombre: "Laura Artesana",
    reacciones: {
      "👏": ["uid-demo-1", "uid-demo-2"],
      "🔥": ["uid-demo-3"],
      "🎉": ["uid-demo-4"],
    },
  };
}
