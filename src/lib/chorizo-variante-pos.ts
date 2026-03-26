import type { ProductoPOS } from "@/types";

export type VarianteChorizo = "picante" | "tradicional";

/** Tipo de arepa cuando el producto incluye chorizo + arepa (combo u otro). `peto_queso` es legado, equivale a arepa de queso */
export type VarianteArepaCombo = "arepa_queso" | "queso_bocadillo" | "peto_queso";

export interface OpcionesVariantesLineaPos {
  varianteChorizo?: VarianteChorizo;
  varianteArepaCombo?: VarianteArepaCombo;
}

/** Combo con arepa: descripción incluye "combo" y "arepa" */
export function productoEsComboConArepa(p: ProductoPOS): boolean {
  const d = `${p.descripcion ?? ""}`.toLowerCase();
  return d.includes("combo") && d.includes("arepa");
}

/** Arepa fija tipo paisa (SKU …PAISA… o texto "paisa"): no se pregunta subtipo queso/bocadillo */
export function productoEsArepaSoloPaisa(p: ProductoPOS): boolean {
  const sku = `${p.sku ?? ""}`.toUpperCase();
  const d = `${p.descripcion ?? ""}`.toLowerCase();
  if (sku.includes("PAISA")) return true;
  return /\bpaisa\b/.test(d);
}

/**
 * Chorizo con arepa (incluye combo con arepa y p. ej. "Chorizo con Arepa de Peto…"):
 * modal con Picante/Tradicional + tipo de arepa.
 * No aplica si la arepa es solo paisa (fija).
 */
export function productoRequiereChorizoYArepa(p: ProductoPOS): boolean {
  if (productoEsArepaSoloPaisa(p)) return false;
  if (productoEsComboConArepa(p)) return true;
  const d = `${p.descripcion ?? ""}`.toLowerCase();
  if (!d.includes("chorizo")) return false;
  return d.includes("arepa");
}

/**
 * Chorizo con pan, o chorizo con arepa paisa: solo Picante / Tradicional (sin subtipo de arepa).
 */
export function productoRequiereSoloChorizoPan(p: ProductoPOS): boolean {
  if (productoRequiereChorizoYArepa(p)) return false;
  const d = `${p.descripcion ?? ""}`.toLowerCase();
  const sku = `${p.sku ?? ""}`.toUpperCase();
  const pareceChorizoEnSku = /CHO|CHORIZO/i.test(sku);
  if (!d.includes("chorizo") && !pareceChorizoEnSku) return false;
  if (d.includes("con pan")) return true;
  return productoEsArepaSoloPaisa(p);
}

/**
 * Arepa de peto sin chorizo (p. ej. "Arepa de Peto con Queso", SKU tipo PET-…QUESO…):
 * modal solo queso / queso y bocadillo.
 */
export function productoRequiereSoloTipoArepaPeto(p: ProductoPOS): boolean {
  if (productoRequiereChorizoYArepa(p) || productoRequiereSoloChorizoPan(p)) return false;
  const sku = `${p.sku ?? ""}`.toUpperCase();
  const d = `${p.descripcion ?? ""}`.toLowerCase();
  if (sku.startsWith("PET-") && sku.includes("QUESO")) return true;
  return d.includes("arepa") && d.includes("peto") && !d.includes("chorizo");
}

/** Producto que abre modal de variantes (chorizo y/o tipo de arepa) */
export function productoRequiereVarianteChorizo(p: ProductoPOS): boolean {
  return (
    productoRequiereChorizoYArepa(p) ||
    productoRequiereSoloChorizoPan(p) ||
    productoRequiereSoloTipoArepaPeto(p)
  );
}

export function buildLineIdPos(sku: string, opts?: OpcionesVariantesLineaPos): string {
  if (!opts?.varianteChorizo && !opts?.varianteArepaCombo) return sku;
  let id = sku;
  if (opts.varianteChorizo) id += `|chorizo:${opts.varianteChorizo}`;
  if (opts.varianteArepaCombo) id += `|arepa:${opts.varianteArepaCombo}`;
  return id;
}

export function etiquetaVarianteChorizo(v: VarianteChorizo): string {
  return v === "picante" ? "Picante" : "Tradicional";
}

export function etiquetaArepaCombo(v: VarianteArepaCombo): string {
  if (v === "queso_bocadillo") return "Arepa de queso y Bocadillo";
  return "Arepa de queso";
}
