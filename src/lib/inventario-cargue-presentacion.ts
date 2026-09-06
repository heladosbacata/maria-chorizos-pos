import type { InsumoKitItem } from "@/types/inventario-pos";

export type PresentacionCargueInventario = {
  /** El cajero debe indicar paquetes (no unidades sueltas). */
  esPaquete: boolean;
  /** Unds por paquete si se pudo inferir del SKU/nombre (ej. x6 → 6). */
  unidadesPorPaquete: number | null;
  labelCantidad: string;
  placeholderCantidad: string;
  labelPrecio: string;
  /** Texto corto bajo el precio / unidad. */
  labelUnidadCorta: string;
  /** Ayuda visible para evitar confusión und vs paquete. */
  ayuda: string;
};

function textoBusqueda(item: Pick<InsumoKitItem, "sku" | "descripcion" | "unidad">): string {
  return `${item.sku} ${item.descripcion} ${item.unidad}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Extrae N de patrones tipo x6, X10, -X6, paquete x6, und x6.
 * No usa el número de contenido genérico (ej. 600ml).
 */
export function inferirUnidadesPorPaquete(texto: string): number | null {
  const t = texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const patterns = [
    /(?:^|[\s_\-·.])x\s*(\d{1,3})(?:\b|$)/i,
    /\bpaquete[s]?\s*(?:de\s*)?(\d{1,3})\b/i,
    /\b(\d{1,3})\s*(?:und|unidades?)\s*(?:por\s*)?(?:paq|paquete)/i,
    /\bpaq(?:uete)?s?\s*x\s*(\d{1,3})\b/i,
  ];
  for (const re of patterns) {
    const m = re.exec(t);
    if (!m?.[1]) continue;
    const n = Number(m[1]);
    if (Number.isFinite(n) && n >= 2 && n <= 500) return n;
  }
  return null;
}

export function itemParecePaqueteCargue(
  item: Pick<InsumoKitItem, "sku" | "descripcion" | "unidad">
): boolean {
  const t = textoBusqueda(item);
  const und = (item.unidad ?? "").trim().toLowerCase();
  if (/\b(paq|paquete|pack|bulto|caja)\b/.test(und)) return true;
  if (/\bpaquete/.test(t)) return true;
  if (inferirUnidadesPorPaquete(`${item.sku} ${item.descripcion}`) != null) return true;
  return false;
}

/**
 * Presentación UX del cargue: si es paquete (arepas x6, etc.), el cajero escribe
 * cuántos paquetes llegaron. El número guardado NO se multiplica: el ensamble WMS
 * ya usa el factor definido en la receta.
 */
export function presentacionCargueInventario(
  item: Pick<InsumoKitItem, "sku" | "descripcion" | "unidad"> | null | undefined
): PresentacionCargueInventario {
  if (!item) {
    return {
      esPaquete: false,
      unidadesPorPaquete: null,
      labelCantidad: "Cantidad",
      placeholderCantidad: "—",
      labelPrecio: "Precio de compra (COP / unidad)",
      labelUnidadCorta: "und",
      ayuda: "",
    };
  }

  const unidadesPorPaquete = inferirUnidadesPorPaquete(`${item.sku} ${item.descripcion}`);
  const esPaquete = itemParecePaqueteCargue(item);

  if (!esPaquete) {
    const u = (item.unidad ?? "").trim() || "und";
    return {
      esPaquete: false,
      unidadesPorPaquete: null,
      labelCantidad: "Cantidad",
      placeholderCantidad: "Ej. 10",
      labelPrecio: `Precio de compra (COP / ${u})`,
      labelUnidadCorta: u,
      ayuda: `Indique cuántas unidades (${u}) llegaron.`,
    };
  }

  const nTxt = unidadesPorPaquete != null ? String(unidadesPorPaquete) : "varias";
  return {
    esPaquete: true,
    unidadesPorPaquete,
    labelCantidad: "Cantidad de paquetes",
    placeholderCantidad: "Ej. 10 paquetes",
    labelPrecio: "Precio de compra (COP / paquete)",
    labelUnidadCorta: unidadesPorPaquete != null ? `paquete (x${unidadesPorPaquete})` : "paquete",
    ayuda:
      unidadesPorPaquete != null
        ? `Escriba cuántos paquetes llegaron (no las unidades sueltas). Cada paquete trae ${nTxt} und; el ensamble WMS ya usa esa cantidad al descontar inventario.`
        : "Escriba cuántos paquetes llegaron (no las unidades sueltas). El ensamble WMS ya usa el contenido definido en la receta al descontar inventario.",
  };
}
