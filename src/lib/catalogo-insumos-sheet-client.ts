import type { InsumoKitItem } from "@/types/inventario-pos";

export async function fetchCatalogoInsumosDesdeSheet(
  puntoVenta: string | null | undefined
): Promise<{ ok: boolean; data: InsumoKitItem[]; message?: string; fuente?: string }> {
  const pv = (puntoVenta ?? "").trim();
  const q = pv ? `?puntoVenta=${encodeURIComponent(pv)}` : "";
  try {
    const res = await fetch(`/api/catalogo_insumos_sheet${q}`, { cache: "no-store" });
    const json = (await res.json()) as {
      ok: boolean;
      data?: InsumoKitItem[];
      message?: string;
      fuente?: string;
    };
    if (!json.ok) {
      return { ok: false, data: [], message: json.message };
    }
    return { ok: true, data: json.data ?? [], fuente: json.fuente };
  } catch {
    return { ok: false, data: [], message: "Error de red al cargar el catálogo." };
  }
}
