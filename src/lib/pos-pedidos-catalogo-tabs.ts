import type { ProductoPOS } from "@/types";

/**
 * Tabs del menú cliente en /pedidos.
 * La categoría del catálogo POS manda; el cajero habilita/deshabilita por SKU aparte.
 */
export type TabCatalogoPedidos =
  | "combos"
  | "paquetes"
  | "basicos"
  | "imperdibles"
  | "bebidas"
  | "adicionales";

export const TABS_CATALOGO_PEDIDOS: { id: TabCatalogoPedidos; label: string }[] = [
  { id: "combos", label: "Combos" },
  { id: "paquetes", label: "Paquetes" },
  { id: "basicos", label: "Básicos" },
  { id: "imperdibles", label: "Imperdibles" },
  { id: "bebidas", label: "Bebidas" },
  { id: "adicionales", label: "Adicionales" },
];

function textoNorm(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function categoriaCanon(p: ProductoPOS): string {
  const raw = (p.categoria ?? "").trim();
  if (!raw) return "";
  const n = textoNorm(raw);
  if (n === "basicos") return "Básicos";
  if (n === "bebidas" || n === "bebida") return "Bebidas";
  if (
    n === "complementos" ||
    n === "complemento" ||
    n === "adicionales" ||
    n === "adicional" ||
    n === "extras" ||
    n === "extra"
  ) {
    return "Complementos";
  }
  if (n === "imperdibles" || n === "imperdible" || n === "destacados" || n === "destacado") {
    return "Imperdibles";
  }
  return raw;
}

export function productoEsBebidasTab(p: ProductoPOS): boolean {
  const cat = categoriaCanon(p);
  if (cat === "Bebidas") return true;
  // No “robar” platos de Básicos / Complementos por palabras sueltas en el nombre.
  if (cat === "Básicos" || cat === "Complementos" || cat === "Imperdibles") return false;
  const t = textoNorm(`${p.descripcion} ${p.categoria ?? ""}`);
  return /(?:^|[\s\-_/])(gaseosa|limonada|jugo|bebida|agua|soda|malteada)(?:$|[\s\-_/])/.test(` ${t} `);
}

export function productoEsComboTab(p: ProductoPOS): boolean {
  const cat = categoriaCanon(p);
  if (cat === "Básicos" || cat === "Bebidas" || cat === "Complementos") return false;
  return /combo/.test(textoNorm(`${p.descripcion} ${p.categoria ?? ""}`));
}

export function productoEsPaqueteTab(p: ProductoPOS): boolean {
  if (productoEsChimichurriPorLitroTab(p)) return true;
  const cat = categoriaCanon(p);
  if (cat === "Básicos" || cat === "Bebidas" || cat === "Complementos") return false;
  const t = textoNorm(`${p.descripcion} ${p.categoria ?? ""}`);
  return /paquete/.test(t) && !/combo/.test(t);
}

/**
 * Salsa chimichurri por litro (para llevar): se muestra en el tab Paquetes.
 * Acepta nombres tipo "Chimichurri por litro", "Salsa chimichurri 1L", etc.
 */
export function productoEsChimichurriPorLitroTab(p: ProductoPOS): boolean {
  const t = textoNorm(`${p.descripcion} ${p.sku ?? ""} ${p.categoria ?? ""}`);
  if (!/chimichurri/.test(t)) return false;
  return (
    /por\s*litro/.test(t) ||
    /\b1\s*l(?:itro)?s?\b/.test(t) ||
    /\bx?\s*1000\s*m\.?l\.?\b/.test(t) ||
    /\blt\b/.test(t) ||
    /\blitro\b/.test(t)
  );
}

export function productoEsAdicionalTab(p: ProductoPOS): boolean {
  const cat = categoriaCanon(p);
  if (productoEsChimichurriPorLitroTab(p)) return false;
  if (cat === "Complementos") return true;
  if (cat === "Básicos" || cat === "Bebidas" || cat === "Imperdibles") return false;
  // Solo por categoría explícita; no por “salsa/extra” en el nombre del plato.
  return false;
}

export function productoEsBasicosTab(p: ProductoPOS): boolean {
  return categoriaCanon(p) === "Básicos";
}

export function productoEsImperdibleTab(p: ProductoPOS): boolean {
  const cat = categoriaCanon(p);
  if (cat === "Imperdibles") return true;
  const t = textoNorm(`${p.descripcion} ${p.categoria ?? ""}`);
  return /imperdible|destacado|favorito/.test(t);
}

/**
 * Asigna un producto a un tab.
 * Prioridad: categoría POS (Básicos, Bebidas, Complementos) → combos/paquetes → imperdibles → resto en Básicos.
 */
export function tabCatalogoDeProducto(p: ProductoPOS): TabCatalogoPedidos {
  const cat = categoriaCanon(p);

  if (cat === "Bebidas" || productoEsBebidasTab(p)) return "bebidas";
  // Chimichurri por litro: Paquetes (aunque venga como Complemento).
  if (productoEsChimichurriPorLitroTab(p)) return "paquetes";
  if (cat === "Complementos") return "adicionales";
  if (productoEsComboTab(p)) return "combos";
  if (productoEsPaqueteTab(p)) return "paquetes";
  if (cat === "Básicos" || productoEsBasicosTab(p)) return "basicos";
  if (cat === "Imperdibles" || productoEsImperdibleTab(p)) return "imperdibles";

  // Especialidades u otras categorías del catálogo: van a Básicos para que no “desaparezcan”.
  return "basicos";
}

export function filtrarCatalogoPorTab(productos: ProductoPOS[], tab: TabCatalogoPedidos): ProductoPOS[] {
  return productos.filter((p) => tabCatalogoDeProducto(p) === tab);
}

/** Subtítulo bajo el nombre en la tarjeta del menú /pedidos. */
export function subtituloTarjetaCatalogoPedidos(p: ProductoPOS): string {
  if (tabCatalogoDeProducto(p) === "paquetes") {
    return "Producto fresco listo para llevar.";
  }
  return "Producto fresco, preparado al momento.";
}
