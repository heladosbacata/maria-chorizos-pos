/**
 * Valorización de inventario cuando el saldo y el precio no usan la misma unidad
 * (salsas: ml vs COP/L; empaques x6/x10: und vs COP/paquete).
 */

export type UnidadInventarioBase = "ml" | "l" | "g" | "kg" | "und" | "otro";

function textoNorm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Misma lógica que `inferirUnidadesPorPaquete` (sin import circular con cargue-presentación). */
function unidadesPorPaqueteDesdeTexto(texto: string): number | null {
  const t = textoNorm(texto);
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

function unidadEsGenerica(u: string): boolean {
  return !u || /^(und|unid|unidad|unidades|u)$/.test(u);
}

/** Productos líquidos que en el POS suelen llevar saldo en ml aunque el nombre diga «1 Litro». */
function pareceLiquidoPos(texto: string): boolean {
  return (
    /\b(salsa|chimichurri|aji|aderezo|vinagre|aceite|jugo|sirope|jarabe|bebida)\b/.test(texto) ||
    /(?:^|[\s_\-])sal(?:[-_]|$)/.test(texto) ||
    /\bpt-sal-/.test(texto)
  );
}

/** «1 Litro», «1L», «-1L» en el nombre = presentación de empaque, no unidad de stock. */
function mencionaEmpaqueLitro(texto: string): boolean {
  return (
    /\b\d+(?:[.,]\d+)?\s*l(?:itros?)?\b/.test(texto) ||
    /(?:^|[\s_\-])\d+l(?:\b|$)/.test(texto)
  );
}

/**
 * Clasifica la unidad de stock del ítem.
 * Prioriza el campo `unidad`. «1 Litro» en la descripción es tamaño de empaque, no litros de saldo.
 */
export function clasificarUnidadInventario(
  unidad: string,
  descripcion = "",
  sku = ""
): UnidadInventarioBase {
  const u = textoNorm(unidad);
  if (/^(ml|mililitro|mililitros)$/.test(u) || /\bml\b/.test(u)) return "ml";
  if (/^(l|lt|lts|litro|litros)$/.test(u)) return "l";
  if (/^(g|gr|gramos?)$/.test(u) || /\bgramos?\b/.test(u)) return "g";
  if (/^(kg|kilos?|kilogramos?)$/.test(u)) return "kg";

  const d = textoNorm(`${descripcion} ${sku}`);

  // Contenido explícito en ml en el nombre (ej. «500 ml»).
  if (/\b\d+\s*ml\b/.test(d) || /\bmililitros?\b/.test(d)) return "ml";

  /**
   * Caso real POS: «Salsa de Ajo 1 Litro» con unidad und y saldo 1000.
   * El «1 Litro» es el envase; el saldo se lleva en mililitros.
   */
  if (unidadEsGenerica(u) && pareceLiquidoPos(d) && mencionaEmpaqueLitro(d)) {
    return "ml";
  }
  if (unidadEsGenerica(u) && pareceLiquidoPos(d)) {
    return "ml";
  }

  // «por litro» solo indica precio; si unidad es und no implica saldo en litros.
  if (/\bpor\s*litro\b/.test(d) && !unidadEsGenerica(u)) return "l";

  if (unidadEsGenerica(u)) return "und";
  if (u) return "otro";
  return "und";
}

/**
 * Si el costo registrado parece «por litro/kg» (≥ umbral) y el saldo está en ml/g,
 * convierte a costo por unidad de saldo.
 *
 * Ejemplo: 18.000 COP/L con saldo 1.000 ml → 18 COP/ml → valor 18.000.
 */
export const UMBRAL_COSTO_MACRO_VS_MICRO = 500;

export type CostoParaSaldo = {
  /** COP por cada unidad del saldo (ml, g, und…). */
  costoPorUnidadSaldo: number;
  /** Etiqueta corta para UI (ej. COP/L · stock en ml). */
  etiquetaCosto: string;
  /** true si se dividió /1000 (L→ml o kg→g) o /xN (paq→und). */
  convirtioMacroAMicro: boolean;
};

export function costoParaUnidadDeSaldo(
  costoCompraRegistrado: number,
  unidadStock: UnidadInventarioBase
): CostoParaSaldo | null {
  if (!Number.isFinite(costoCompraRegistrado) || costoCompraRegistrado <= 0) return null;

  if (unidadStock === "ml" && costoCompraRegistrado >= UMBRAL_COSTO_MACRO_VS_MICRO) {
    return {
      costoPorUnidadSaldo: costoCompraRegistrado / 1000,
      etiquetaCosto: "COP/L (saldo en ml)",
      convirtioMacroAMicro: true,
    };
  }
  if (unidadStock === "g" && costoCompraRegistrado >= UMBRAL_COSTO_MACRO_VS_MICRO) {
    return {
      costoPorUnidadSaldo: costoCompraRegistrado / 1000,
      etiquetaCosto: "COP/kg (saldo en g)",
      convirtioMacroAMicro: true,
    };
  }
  if (unidadStock === "ml") {
    return {
      costoPorUnidadSaldo: costoCompraRegistrado,
      etiquetaCosto: "COP/ml",
      convirtioMacroAMicro: false,
    };
  }
  if (unidadStock === "l") {
    return {
      costoPorUnidadSaldo: costoCompraRegistrado,
      etiquetaCosto: "COP/L",
      convirtioMacroAMicro: false,
    };
  }
  if (unidadStock === "g") {
    return {
      costoPorUnidadSaldo: costoCompraRegistrado,
      etiquetaCosto: "COP/g",
      convirtioMacroAMicro: false,
    };
  }
  if (unidadStock === "kg") {
    return {
      costoPorUnidadSaldo: costoCompraRegistrado,
      etiquetaCosto: "COP/kg",
      convirtioMacroAMicro: false,
    };
  }
  return {
    costoPorUnidadSaldo: costoCompraRegistrado,
    etiquetaCosto: "COP/u.",
    convirtioMacroAMicro: false,
  };
}

/**
 * Empaques x6/x10/x100…: el precio de hoja/cargue es COP/paquete y el saldo del sistema es en und.
 * Ej.: 96,99 paq × $15.000/paq → 9.699 und × ($15.000/100) = $1.454.850.
 */
export function metaCostoInventarioItem(
  costoCompraRegistrado: number | null | undefined,
  item: {
    unidad?: string;
    descripcion?: string;
    sku?: string;
    /** Si ya se calculó en UI (vistaSaldoConEmpaque), preferirlo. */
    unidadesPorPaquete?: number | null;
  }
): CostoParaSaldo | null {
  if (costoCompraRegistrado == null || !Number.isFinite(costoCompraRegistrado) || costoCompraRegistrado <= 0) {
    return null;
  }

  const nExplicito =
    item.unidadesPorPaquete != null &&
    Number.isFinite(item.unidadesPorPaquete) &&
    item.unidadesPorPaquete >= 2
      ? Math.round(item.unidadesPorPaquete)
      : null;
  const nTexto = unidadesPorPaqueteDesdeTexto(`${item.sku ?? ""} ${item.descripcion ?? ""}`);
  const n = nExplicito ?? nTexto;
  if (n != null && n >= 2) {
    return {
      costoPorUnidadSaldo: costoCompraRegistrado / n,
      etiquetaCosto: `COP/paq x${n}`,
      convirtioMacroAMicro: true,
    };
  }

  const unidad = clasificarUnidadInventario(item.unidad ?? "", item.descripcion ?? "", item.sku ?? "");
  return costoParaUnidadDeSaldo(costoCompraRegistrado, unidad);
}

/** Valor en stock = saldo × costo por unidad de saldo (con conversión ml/L o paq→und si aplica). */
export function valorStockValorizado(
  saldo: number,
  costoCompraRegistrado: number | null | undefined,
  item: {
    unidad?: string;
    descripcion?: string;
    sku?: string;
    unidadesPorPaquete?: number | null;
  }
): number | null {
  const meta = metaCostoInventarioItem(costoCompraRegistrado, item);
  if (!meta || !Number.isFinite(saldo)) return null;
  return Math.round(saldo * meta.costoPorUnidadSaldo * 100) / 100;
}
