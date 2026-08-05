import type { ProductoPOS } from "@/types";

export type VarianteBebidaUi = {
  clave: string;
  etiqueta: string;
  precioVenta?: number;
};

export const CLAVE_BRISA_600_SIN_GAS = "600_ML_SIN_GAS";
export const CLAVE_BRISA_600_CON_GAS = "600_ML_CON_GAS";
export const ETIQUETA_BRISA_600_SIN_GAS = "600 ml sin gas";
export const ETIQUETA_BRISA_600_CON_GAS = "600 ml con gas";

function textoNorm(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Extrae ml de un texto (nombre o etiqueta), p. ej. "Agua Brisa 600ml" → 600. */
export function tamanoMlDesdeTexto(texto: string): number | null {
  const m = String(texto ?? "").match(/(\d+)\s*m\.?l\.?\b/i);
  if (!m) return null;
  const ml = Number(m[1]);
  return Number.isFinite(ml) && ml > 0 ? ml : null;
}

/**
 * Quita el tamaño del final del nombre para no confundir con la variante.
 * "Agua Brisa 600ml" → "Agua Brisa"
 */
export function descripcionProductoSinTamanoEnNombre(descripcion: string): string {
  const raw = String(descripcion ?? "").trim();
  if (!raw) return raw;
  const cleaned = raw
    .replace(/\s*[-–]?\s*\d+\s*m\.?l\.?\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || raw;
}

/** Quita sufijos de gas/tamaño del nombre de Agua Brisa. */
export function descripcionAguaBrisaLimpia(descripcion: string): string {
  const raw = String(descripcion ?? "").trim();
  if (!raw) return "Agua Brisa";
  let d = raw
    .replace(/\s*[\(\[{\-]?\s*(con|sin)\s*gas\s*[\)\]}]?/gi, " ")
    .replace(/\s*gasificada\s*/gi, " ")
    .replace(/\s*[-–]?\s*\d+\s*m\.?l\.?\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return d || "Agua Brisa";
}

/** Unifica etiquetas duplicadas: "250ml"/"250 ml", "Pet 250"/"Pet 250 ML". */
export function canonEtiquetaVarianteBebida(label: string): string {
  let n = textoNorm(label).replace(/\s+/g, " ");
  n = n.replace(/(\d)\s*m\.?l\.?\b/g, "$1 ml");
  n = n.replace(/\bpet\s+(\d+)(?:\s*ml)?\b/g, "pet $1 ml");
  return n;
}

function etiquetaTamanoMl(ml: number): string {
  return `${ml} ml`;
}

function claveTamanoMl(ml: number): string {
  return `${ml}_ML`;
}

export function esProductoAguaBrisa(p: ProductoPOS): boolean {
  const t = textoNorm(`${p.descripcion ?? ""} ${p.sku ?? ""}`);
  return t.includes("brisa") && (t.includes("agua") || /^brisa\b/.test(t) || t.includes("agua-brisa") || t.includes("aguabrisa"));
}

function textoIndicaConGas(texto: string): boolean {
  const t = textoNorm(texto);
  return /\bcon\s*gas\b|\bcongas\b|\bgasificada\b|\bsparkling\b/.test(t);
}

function textoIndicaSinGas(texto: string): boolean {
  const t = textoNorm(texto);
  if (textoIndicaConGas(texto)) return false;
  return /\bsin\s*gas\b|\bsingas\b|\bnatural\b/.test(t);
}

function precioDesdeVariantes(
  p: ProductoPOS,
  pred: (texto: string) => boolean
): number | undefined {
  const preciosMap = p.preciosPorVariante ?? {};
  for (const v of p.variantes ?? []) {
    const texto = `${v.clave ?? ""} ${v.etiqueta ?? ""}`;
    if (!pred(texto)) continue;
    if (typeof v.precioVenta === "number" && Number.isFinite(v.precioVenta)) return v.precioVenta;
    const pr = preciosMap[String(v.clave ?? "").trim()];
    if (typeof pr === "number" && Number.isFinite(pr)) return pr;
  }
  for (const [k, pr] of Object.entries(preciosMap)) {
    if (!pred(k)) continue;
    if (typeof pr === "number" && Number.isFinite(pr)) return pr;
  }
  if (pred(p.descripcion ?? "")) return p.precioUnitario;
  return undefined;
}

/**
 * Agua Brisa unificada: solo dos opciones visibles.
 * «600 ml sin gas» | «600 ml con gas»
 */
export function variantesAguaBrisaUnificada(productos: ProductoPOS | ProductoPOS[]): VarianteBebidaUi[] {
  const list = Array.isArray(productos) ? productos : [productos];
  const base = list[0];
  const fallback = base?.precioUnitario ?? 0;

  let precioSin: number | undefined;
  let precioCon: number | undefined;

  for (const p of list) {
    const desdeVarsSin = precioDesdeVariantes(p, textoIndicaSinGas);
    const desdeVarsCon = precioDesdeVariantes(p, textoIndicaConGas);
    if (desdeVarsSin != null) precioSin = desdeVarsSin;
    if (desdeVarsCon != null) precioCon = desdeVarsCon;

    const desc = p.descripcion ?? "";
    if (textoIndicaConGas(desc)) precioCon = p.precioUnitario;
    else if (textoIndicaSinGas(desc)) precioSin = p.precioUnitario;
    else if (esProductoAguaBrisa(p) && list.length === 1 && desdeVarsSin == null && desdeVarsCon == null) {
      // Un solo producto sin tipificar gas: mismo precio base para ambas opciones.
      precioSin = precioSin ?? p.precioUnitario;
      precioCon = precioCon ?? p.precioUnitario;
    } else if (esProductoAguaBrisa(p) && !textoIndicaConGas(desc) && !textoIndicaSinGas(desc)) {
      // Producto genérico “Agua Brisa” en un grupo: aporta precio a sin gas por defecto.
      precioSin = precioSin ?? p.precioUnitario;
    }
  }

  return [
    {
      clave: CLAVE_BRISA_600_SIN_GAS,
      etiqueta: ETIQUETA_BRISA_600_SIN_GAS,
      precioVenta: precioSin ?? fallback,
    },
    {
      clave: CLAVE_BRISA_600_CON_GAS,
      etiqueta: ETIQUETA_BRISA_600_CON_GAS,
      precioVenta: precioCon ?? fallback,
    },
  ];
}

/**
 * Si el catálogo trae varias filas de Agua Brisa, deja una sola tarjeta
 * con variantes 600 ml sin gas / 600 ml con gas.
 */
export function unificarAguaBrisaEnCatalogo(productos: ProductoPOS[]): ProductoPOS[] {
  const brisas = productos.filter(esProductoAguaBrisa);
  if (brisas.length === 0) return productos;

  const resto = productos.filter((p) => !esProductoAguaBrisa(p));
  const base = brisas.find((p) => (p.urlImagen ?? "").trim()) ?? brisas[0];
  const vars = variantesAguaBrisaUnificada(brisas);

  const unified: ProductoPOS = {
    ...base,
    descripcion: "Agua Brisa",
    precioUnitario: vars[0]?.precioVenta ?? base.precioUnitario,
    variantes: vars.map((v) => ({
      clave: v.clave,
      etiqueta: v.etiqueta,
      precioVenta: v.precioVenta ?? null,
    })),
    preciosPorVariante: Object.fromEntries(
      vars.map((v) => [v.clave, v.precioVenta ?? base.precioUnitario])
    ),
  };

  return [unified, ...resto];
}

/**
 * Variantes de bebida para UI (caja y domicilios):
 * - Agua Brisa: solo 600 ml sin gas / 600 ml con gas
 * - resto: dedupe por etiqueta; si el nombre trae tamaño (600ml), lo agrega como variante
 */
export function variantesBebidaParaUi(p: ProductoPOS): VarianteBebidaUi[] {
  if (esProductoAguaBrisa(p)) {
    return variantesAguaBrisaUnificada(p);
  }

  const preciosMap = p.preciosPorVariante ?? {};
  const out: VarianteBebidaUi[] = [];
  const seenKeys = new Set<string>();
  const seenLabels = new Set<string>();

  const push = (claveRaw: string, etiquetaRaw: string, precio?: number) => {
    const clave = String(claveRaw ?? "").trim();
    if (!clave || seenKeys.has(clave.toUpperCase())) return;
    let etiqueta = String(etiquetaRaw || clave).trim();
    const soloMl = etiqueta.match(/^(\d+)\s*m\.?l\.?$/i);
    if (soloMl) etiqueta = etiquetaTamanoMl(Number(soloMl[1]));
    const labelCanon = canonEtiquetaVarianteBebida(etiqueta);
    if (labelCanon && seenLabels.has(labelCanon)) return;
    seenKeys.add(clave.toUpperCase());
    if (labelCanon) seenLabels.add(labelCanon);
    const pr =
      typeof precio === "number" && Number.isFinite(precio)
        ? precio
        : preciosMap[clave];
    out.push({
      clave,
      etiqueta,
      precioVenta: typeof pr === "number" && Number.isFinite(pr) ? pr : undefined,
    });
  };

  const mlNombre = tamanoMlDesdeTexto(p.descripcion ?? "");
  if (mlNombre != null) {
    const etiqueta = etiquetaTamanoMl(mlNombre);
    const canon = canonEtiquetaVarianteBebida(etiqueta);
    const yaExiste =
      (p.variantes ?? []).some((v) => canonEtiquetaVarianteBebida(v.etiqueta ?? v.clave) === canon) ||
      Object.keys(preciosMap).some((k) => canonEtiquetaVarianteBebida(k) === canon);
    if (!yaExiste) {
      push(claveTamanoMl(mlNombre), etiqueta, p.precioUnitario);
    }
  }

  if (Array.isArray(p.variantes) && p.variantes.length > 0) {
    for (const v of p.variantes) {
      const clave = String(v.clave ?? "").trim();
      if (!clave) continue;
      push(
        clave,
        String(v.etiqueta ?? clave).trim() || clave,
        typeof v.precioVenta === "number" ? v.precioVenta : undefined
      );
    }
  } else {
    for (const [k, pr] of Object.entries(preciosMap)) {
      if (!String(k).trim() || typeof pr !== "number" || !Number.isFinite(pr)) continue;
      push(String(k).trim(), String(k).trim(), pr);
    }
  }

  return out;
}

/** Nombre amigable en catálogo/carrito: sin ml al final si es bebida. */
export function descripcionBebidaParaUi(p: ProductoPOS): string {
  if (esProductoAguaBrisa(p)) return descripcionAguaBrisaLimpia(p.descripcion ?? "Agua Brisa");
  const cat = `${p.categoria ?? ""}`.toLowerCase();
  const d = p.descripcion ?? "";
  if (cat.includes("bebida") || /\bagua\b/i.test(d)) {
    return descripcionProductoSinTamanoEnNombre(d);
  }
  return d;
}
