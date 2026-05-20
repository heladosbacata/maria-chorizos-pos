const STORAGE_CAMPANA = "pos_anuncio_campana_id";
const STORAGE_VENTAS = "pos_anuncio_ventas_desde_lectura";

export function resetVentasDesdeLectura(campanaId: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_CAMPANA, campanaId);
  localStorage.setItem(STORAGE_VENTAS, "0");
}

export function ventasDesdeLectura(campanaId: string): number {
  if (typeof window === "undefined") return 0;
  const stored = localStorage.getItem(STORAGE_CAMPANA);
  if (stored !== campanaId) {
    localStorage.setItem(STORAGE_CAMPANA, campanaId);
    localStorage.setItem(STORAGE_VENTAS, "0");
    return 0;
  }
  const n = parseInt(localStorage.getItem(STORAGE_VENTAS) || "0", 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function incrementarVentasDesdeLectura(campanaId: string): number {
  const prev = ventasDesdeLectura(campanaId);
  const next = prev + 1;
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_VENTAS, String(next));
  }
  return next;
}
