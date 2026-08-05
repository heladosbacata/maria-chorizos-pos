/** Mapa sku → habilitado en menú de domicilios del punto. Ausencia = habilitado (default ON). */

export function normalizarCatalogoDomiciliosPorSku(raw: unknown): Record<string, boolean> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const sku = String(k ?? "").trim();
    if (!sku) continue;
    if (v === false) out[sku] = false;
    else if (v === true) out[sku] = true;
  }
  return out;
}

/** Por defecto todos los productos están habilitados para domicilios. */
export function productoHabilitadoEnDomiciliosPunto(
  sku: string,
  porSku: Record<string, boolean> | null | undefined
): boolean {
  const key = String(sku ?? "").trim();
  if (!key) return true;
  if (!porSku) return true;
  return porSku[key] !== false;
}

/** Compara dos mapas sku→habilitado (orden de claves irrelevante). */
export function catalogoDomiciliosPorSkuIgual(
  a: Record<string, boolean> | null | undefined,
  b: Record<string, boolean> | null | undefined
): boolean {
  const aa = a ?? {};
  const bb = b ?? {};
  const keysA = Object.keys(aa);
  const keysB = Object.keys(bb);
  if (keysA.length !== keysB.length) return false;
  for (const k of keysA) {
    if (aa[k] !== bb[k]) return false;
  }
  return true;
}
