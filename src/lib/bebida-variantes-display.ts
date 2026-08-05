import type { ProductoPOS } from "@/types";

export type VarianteBebidaUi = {
  clave: string;
  etiqueta: string;
  precioVenta?: number;
};

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

/**
 * Variantes de bebida para UI (caja y domicilios):
 * - dedupe por etiqueta
 * - si el nombre trae tamaño (600ml), lo agrega como variante y no debe quedar solo en el título
 */
export function variantesBebidaParaUi(p: ProductoPOS): VarianteBebidaUi[] {
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
  const cat = `${p.categoria ?? ""}`.toLowerCase();
  const d = p.descripcion ?? "";
  if (cat.includes("bebida") || /\bagua\b/i.test(d)) {
    return descripcionProductoSinTamanoEnNombre(d);
  }
  return d;
}
