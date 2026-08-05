import type { ProductoPOS } from "@/types";

export type TabCatalogoPedidos =
  | "combos"
  | "paquetes"
  | "imperdibles"
  | "bebidas"
  | "adicionales";

export const TABS_CATALOGO_PEDIDOS: { id: TabCatalogoPedidos; label: string }[] = [
  { id: "combos", label: "Combos" },
  { id: "paquetes", label: "Paquetes" },
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
  if (n === "complementos" || n === "complemento" || n === "adicionales" || n === "extras") {
    return "Complementos";
  }
  return raw;
}

export function productoEsBebidasTab(p: ProductoPOS): boolean {
  if (categoriaCanon(p) === "Bebidas") return true;
  const t = textoNorm(`${p.descripcion} ${p.categoria ?? ""}`);
  return /gaseosa|limonada|jugo|bebida|agua|soda|malteada/.test(t);
}

export function productoEsComboTab(p: ProductoPOS): boolean {
  return /combo/.test(textoNorm(`${p.descripcion} ${p.categoria ?? ""}`));
}

export function productoEsPaqueteTab(p: ProductoPOS): boolean {
  const t = textoNorm(`${p.descripcion} ${p.categoria ?? ""}`);
  return /paquete/.test(t) && !/combo/.test(t);
}

export function productoEsAdicionalTab(p: ProductoPOS): boolean {
  if (categoriaCanon(p) === "Complementos") return true;
  const t = textoNorm(`${p.descripcion} ${p.categoria ?? ""}`);
  return /adicional|extra|salsa|complemento|agregado/.test(t);
}

/** Platos estrella / básicos / destacados (no combo, paquete, bebida ni adicional). */
export function productoEsImperdibleTab(p: ProductoPOS): boolean {
  if (productoEsBebidasTab(p) || productoEsComboTab(p) || productoEsPaqueteTab(p) || productoEsAdicionalTab(p)) {
    return false;
  }
  const t = textoNorm(`${p.descripcion} ${p.categoria ?? ""}`);
  if (/imperdible|destacado|especialidad|favorito/.test(t)) return true;
  if (categoriaCanon(p) === "Básicos") return true;
  return true;
}

export function tabCatalogoDeProducto(p: ProductoPOS): TabCatalogoPedidos {
  if (productoEsComboTab(p)) return "combos";
  if (productoEsPaqueteTab(p)) return "paquetes";
  if (productoEsBebidasTab(p)) return "bebidas";
  if (productoEsAdicionalTab(p)) return "adicionales";
  return "imperdibles";
}

export function filtrarCatalogoPorTab(productos: ProductoPOS[], tab: TabCatalogoPedidos): ProductoPOS[] {
  return productos.filter((p) => tabCatalogoDeProducto(p) === tab);
}
