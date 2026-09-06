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
  /** Paquetes enteros (sin decimales). */
  paquetes: number | null;
  /** Unidades sueltas fuera de paquetes enteros (0…N-1). */
  unidadesSueltas: number | null;
  /** Total de unidades sueltas equivalentes. */
  unidadesEquivalentes: number | null;
  /** Línea principal (ej. «14 paquetes + 1 unidad»). */
  textoPrincipal: string;
  /** Línea secundaria (ej. «85 und en total · x6»). */
  textoSecundario: string | null;
  /** Etiqueta corta para columna Unidad. */
  labelUnidad: string;
};

/**
 * Parte un saldo en paquetes (posiblemente fraccionario) a paquetes enteros + unidades sueltas.
 * Evita decimales confusos (14,167 paq. → 14 paquetes + 1 unidad si x6).
 */
export function desglosarSaldoPaquetes(
  saldoPaquetes: number,
  unidadesPorPaquete: number
): { paquetesEnteros: number; unidadesSueltas: number; totalUnidades: number } {
  const n = unidadesPorPaquete >= 2 ? unidadesPorPaquete : 1;
  const totalUnidades = Math.max(0, Math.round(saldoPaquetes * n));
  const paquetesEnteros = Math.floor(totalUnidades / n);
  const unidadesSueltas = totalUnidades % n;
  return { paquetesEnteros, unidadesSueltas, totalUnidades };
}

function textoPaquetesYUnidades(paquetesEnteros: number, unidadesSueltas: number): string {
  const paqTxt =
    paquetesEnteros === 1 ? "1 paquete" : `${paquetesEnteros.toLocaleString("es-CO")} paquetes`;
  if (unidadesSueltas <= 0) return paqTxt;
  const undTxt = unidadesSueltas === 1 ? "1 unidad" : `${unidadesSueltas.toLocaleString("es-CO")} unidades`;
  if (paquetesEnteros <= 0) return undTxt;
  return `${paqTxt} + ${undTxt}`;
}

/**
 * Presenta el saldo en paquetes enteros + unidades sueltas (sin decimales).
 * Convención POS: en productos de empaque (x6, x100…) el saldo guardado = paquetes (puede ser fracción si hay destape).
 */
export function vistaSaldoConEmpaque(
  saldo: number,
  item: Pick<InsumoKitItem, "sku" | "descripcion" | "unidad">
): VistaSaldoEmpaque {
  const n = inferirUnidadesPorPaquete(`${item.sku} ${item.descripcion}`);
  const esPaquete = itemParecePaqueteCargue(item) || (n != null && n >= 2);
  const saldoR = Math.round(saldo * 1000) / 1000;

  if (esPaquete && n != null && n >= 2) {
    const { paquetesEnteros, unidadesSueltas, totalUnidades } = desglosarSaldoPaquetes(saldoR, n);
    return {
      unidadesPorPaquete: n,
      saldoEnPaquetes: true,
      paquetes: paquetesEnteros,
      unidadesSueltas,
      unidadesEquivalentes: totalUnidades,
      textoPrincipal: textoPaquetesYUnidades(paquetesEnteros, unidadesSueltas),
      textoSecundario: `${totalUnidades.toLocaleString("es-CO")} und en total · x${n}`,
      labelUnidad: `paq. x${n}`,
    };
  }

  const unidadClas = clasificarUnidadInventario(item.unidad ?? "", item.descripcion ?? "", item.sku ?? "");
  if (unidadClas === "ml") {
    const mlEnteros = Math.round(saldoR);
    const litros = Math.round((mlEnteros / 1000) * 1000) / 1000;
    return {
      unidadesPorPaquete: null,
      saldoEnPaquetes: false,
      paquetes: null,
      unidadesSueltas: null,
      unidadesEquivalentes: mlEnteros,
      textoPrincipal: `${mlEnteros.toLocaleString("es-CO")} ml`,
      textoSecundario: `${formatNumInventario(litros)} L`,
      labelUnidad: "ml",
    };
  }

  const u = (item.unidad ?? "").trim() || "und";
  const entero = Number.isInteger(saldoR) ? saldoR : Math.round(saldoR * 1000) / 1000;
  return {
    unidadesPorPaquete: n,
    saldoEnPaquetes: false,
    paquetes: null,
    unidadesSueltas: null,
    unidadesEquivalentes: entero,
    textoPrincipal: `${formatNumInventario(entero)} ${u}`,
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
