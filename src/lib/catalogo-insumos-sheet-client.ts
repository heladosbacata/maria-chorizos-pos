import type { InsumoKitItem } from "@/types/inventario-pos";

export type CatalogoSheetSetupHint = {
  clientEmail: string;
  projectId: string;
  sheetsApiUrl: string;
  shareOnceHint: string;
};

export async function fetchCatalogoInsumosDesdeSheet(
  puntoVenta: string | null | undefined
): Promise<{
  ok: boolean;
  data: InsumoKitItem[];
  message?: string;
  fuente?: string;
  sheetSetup?: CatalogoSheetSetupHint;
  /** Ninguna fila coincidió con el PV en columna PV; se listaron todos los ítems de la hoja. */
  pvFiltroSinCoincidencias?: boolean;
}> {
  const pv = (puntoVenta ?? "").trim();
  const q = pv ? `?puntoVenta=${encodeURIComponent(pv)}` : "";
  try {
    const res = await fetch(`/api/catalogo_insumos_sheet${q}`, { cache: "no-store" });
    const json = (await res.json()) as {
      ok: boolean;
      data?: InsumoKitItem[];
      message?: string;
      fuente?: string;
      sheetSetup?: CatalogoSheetSetupHint;
      pvFiltroSinCoincidencias?: boolean;
    };
    if (!json.ok) {
      return { ok: false, data: [], message: json.message, sheetSetup: json.sheetSetup };
    }
    return {
      ok: true,
      data: json.data ?? [],
      fuente: json.fuente,
      ...(json.pvFiltroSinCoincidencias ? { pvFiltroSinCoincidencias: true } : {}),
    };
  } catch {
    return { ok: false, data: [], message: "Error de red al cargar el catálogo." };
  }
}
