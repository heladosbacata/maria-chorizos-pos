import type { InsumoKitItem } from "@/types/inventario-pos";
import { clasificarUnidadInventario } from "@/lib/inventario-valorizacion-unidades";

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

function formatNumInventario(n: number): string {
  return n.toLocaleString("es-CO", { maximumFractionDigits: 3 });
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

export type VistaSaldoEmpaque = {
  /** Factor xN del empaque de matriz; null si no aplica. */
  unidadesPorPaquete: number | null;
  /** El saldo del sistema se interpreta como paquetes (cargue POS). */
  saldoEnPaquetes: boolean;
  paquetes: number | null;
  unidadesEquivalentes: number | null;
  /** Línea principal (ej. «12 paq.»). */
  textoPrincipal: string;
  /** Línea secundaria (ej. «72 und · x6»). */
  textoSecundario: string | null;
  /** Etiqueta corta para columna Unidad. */
  labelUnidad: string;
};

/**
 * Presenta el saldo en paquetes y unidades sueltas.
 * Convención POS: en productos de empaque (x6, x100…) el saldo guardado = paquetes cargados.
 */
export function vistaSaldoConEmpaque(
  saldo: number,
  item: Pick<InsumoKitItem, "sku" | "descripcion" | "unidad">
): VistaSaldoEmpaque {
  const n = inferirUnidadesPorPaquete(`${item.sku} ${item.descripcion}`);
  const esPaquete = itemParecePaqueteCargue(item) || (n != null && n >= 2);
  const saldoR = Math.round(saldo * 1000) / 1000;

  if (esPaquete && n != null && n >= 2) {
    const und = Math.round(saldoR * n * 1000) / 1000;
    return {
      unidadesPorPaquete: n,
      saldoEnPaquetes: true,
      paquetes: saldoR,
      unidadesEquivalentes: und,
      textoPrincipal: `${formatNumInventario(saldoR)} paq.`,
      textoSecundario: `${formatNumInventario(und)} und · x${n}`,
      labelUnidad: `paq. x${n}`,
    };
  }

  const unidadClas = clasificarUnidadInventario(item.unidad ?? "", item.descripcion ?? "", item.sku ?? "");
  if (unidadClas === "ml") {
    const litros = Math.round((saldoR / 1000) * 1000) / 1000;
    return {
      unidadesPorPaquete: null,
      saldoEnPaquetes: false,
      paquetes: null,
      unidadesEquivalentes: saldoR,
      textoPrincipal: `${formatNumInventario(saldoR)} ml`,
      textoSecundario: `${formatNumInventario(litros)} L`,
      labelUnidad: "ml",
    };
  }

  const u = (item.unidad ?? "").trim() || "und";
  return {
    unidadesPorPaquete: n,
    saldoEnPaquetes: false,
    paquetes: null,
    unidadesEquivalentes: saldoR,
    textoPrincipal: `${formatNumInventario(saldoR)} ${u}`,
    textoSecundario: null,
    labelUnidad: u,
  };
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
    const unidadClas = clasificarUnidadInventario(
      item.unidad ?? "",
      item.descripcion ?? "",
      item.sku ?? ""
    );
    if (unidadClas === "ml") {
      return {
        esPaquete: false,
        unidadesPorPaquete: null,
        labelCantidad: "Cantidad (ml)",
        placeholderCantidad: "Ej. 1000",
        labelPrecio: "Precio de compra (COP / litro)",
        labelUnidadCorta: "ml",
        ayuda:
          "Indique mililitros (ej. 1000 = 1 L). El precio de la hoja es por litro; el valor del cargue se calcula como ml÷1000×precio.",
      };
    }
    if (unidadClas === "g") {
      return {
        esPaquete: false,
        unidadesPorPaquete: null,
        labelCantidad: "Cantidad (g)",
        placeholderCantidad: "Ej. 1000",
        labelPrecio: "Precio de compra (COP / kg)",
        labelUnidadCorta: "g",
        ayuda:
          "Indique gramos. Si el precio es por kilo, el valor del cargue se calcula como g÷1000×precio.",
      };
    }
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
