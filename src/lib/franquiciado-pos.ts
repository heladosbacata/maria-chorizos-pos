/**
 * Ficha de franquiciado devuelta por el WMS (campos flexibles).
 */
export type FranquiciadoFicha = Record<string, unknown>;

export interface FranquiciadoResult {
  ok: boolean;
  franquiciado?: FranquiciadoFicha | null;
  message?: string;
}

/**
 * Obtiene la ficha del franquiciado del punto de venta desde el WMS vía proxy del POS.
 */
export async function getFranquiciadoPorPuntoVenta(
  puntoVenta: string,
  idToken?: string | null
): Promise<FranquiciadoResult> {
  const pv = puntoVenta.trim();
  if (!pv) {
    return { ok: false, message: "No hay punto de venta seleccionado." };
  }

  const url = `/api/franquiciado_por_pv?puntoVenta=${encodeURIComponent(pv)}`;
  const headers: HeadersInit = {};
  if (idToken) headers.Authorization = `Bearer ${idToken}`;

  try {
    const res = await fetch(url, { headers });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return {
        ok: false,
        message: data?.message || data?.error || `Error ${res.status}`,
      };
    }

    if (data && data.ok === false) {
      return {
        ok: false,
        message: data.message ?? "No se pudo cargar la ficha del franquiciado.",
      };
    }

    let ficha: FranquiciadoFicha | null = null;
    if (data?.franquiciado && typeof data.franquiciado === "object" && !Array.isArray(data.franquiciado)) {
      ficha = data.franquiciado as FranquiciadoFicha;
    } else if (data?.data && typeof data.data === "object" && !Array.isArray(data.data)) {
      ficha = data.data as FranquiciadoFicha;
    } else if (typeof data === "object" && data !== null && !Array.isArray(data)) {
      const skip = new Set(["ok", "message", "error"]);
      const rest: FranquiciadoFicha = {};
      for (const [k, v] of Object.entries(data)) {
        if (!skip.has(k)) rest[k] = v;
      }
      if (Object.keys(rest).length > 0) ficha = rest;
    }

    return { ok: true, franquiciado: ficha };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error de red";
    return { ok: false, message: msg };
  }
}

export function formatoEtiquetaFicha(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}
