import type { InsumoKitItem } from "@/types/inventario-pos";

/** ID de la hoja de insumos (Maria Chorizos) — se puede sobreescribir con env. */
export const DEFAULT_GOOGLE_SHEETS_INSUMOS_ID = "1c1Ihhx0mtGduvNLPN_DIURK5AJYU2JJ9oIbChDVaABQ";
export const DEFAULT_GOOGLE_SHEETS_INSUMOS_GID = 415609818;

function normHeader(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

/** Parsea una línea CSV respetando comillas. */
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQ = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQ = true;
    } else if (c === ",") {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur.trim());
  return out;
}

export function parseCsvToRows(text: string): string[][] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  return lines.map(parseCsvLine);
}

const SKU_KEYS = ["sku", "codigo", "codigoinsumo", "codigo_insumo", "referencia", "cod"];
const DESC_KEYS = ["descripcion", "nombre", "producto", "item", "descripcionproducto", "nombreproducto"];
const UNIDAD_KEYS = ["unidad", "um", "medida", "u_m"];
const CAT_KEYS = ["categoria", "rubro", "tipo"];
const MIN_KEYS = [
  "minimo",
  "minimosugerido",
  "minimostock",
  "stockminimo",
  "stockmin",
  "minstock",
  "puntopedido",
  "pedidominimo",
];
const PV_KEYS = [
  "puntodeventa",
  "puntoventa",
  "pv",
  "codigopunto",
  "codigo_punto",
  "sucursal",
  "franquicia",
  "tienda",
];

function findCol(headersNorm: string[], keys: string[]): number {
  for (let i = 0; i < headersNorm.length; i++) {
    const h = headersNorm[i];
    if (!h) continue;
    for (const k of keys) {
      if (h === k || h.endsWith(k) || h.includes(k)) return i;
    }
  }
  return -1;
}

function parseNumeroMinimo(raw: string): number | undefined {
  const t = raw.trim();
  if (!t) return undefined;
  const n = Number(t.replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n * 1000) / 1000;
}

/**
 * Convierte la primera fila como encabezados + datos en `InsumoKitItem`.
 * Si hay columna de punto de venta (PV, sucursal, etc.): celda vacía = ítem visible en todos los PV;
 * con valor = solo el PV cuyo código coincida con `puntoVentaFiltro` (mismo texto que en el perfil del cajero).
 * Si no hay columna de PV, todas las filas aplican a todos los puntos.
 */
export function insumosDesdeGrilla(
  rows: string[][],
  puntoVentaFiltro: string | null | undefined,
  idPrefix = "gs"
): InsumoKitItem[] {
  if (rows.length < 2) return [];
  const headers = rows[0]!.map((h) => String(h ?? ""));
  const headersNorm = headers.map(normHeader);
  const iSku = findCol(headersNorm, SKU_KEYS);
  const iDesc = findCol(headersNorm, DESC_KEYS);
  const iUn = findCol(headersNorm, UNIDAD_KEYS);
  const iCat = findCol(headersNorm, CAT_KEYS);
  const iMin = findCol(headersNorm, MIN_KEYS);
  const iPv = findCol(headersNorm, PV_KEYS);

  const pvNeedle = (puntoVentaFiltro ?? "").trim().toLowerCase();
  const out: InsumoKitItem[] = [];
  const seenSku = new Set<string>();

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]!;
    const cell = (i: number) => (i >= 0 && i < row.length ? String(row[i] ?? "").trim() : "");

    let sku = iSku >= 0 ? cell(iSku) : "";
    const descripcion = iDesc >= 0 ? cell(iDesc) : "";
    const unidad = iUn >= 0 ? cell(iUn) : "und";
    const categoria = iCat >= 0 ? cell(iCat) : undefined;
    const minRaw = iMin >= 0 ? cell(iMin) : "";
    const minimoSheet = parseNumeroMinimo(minRaw);
    const pvCell = iPv >= 0 ? cell(iPv) : "";

    if (!sku && !descripcion) continue;

    if (pvNeedle && iPv >= 0 && pvCell) {
      if (pvCell.trim().toLowerCase() !== pvNeedle) continue;
    }

    if (!sku) sku = `FILA-${r + 1}`;
    const descFinal = descripcion || sku;

    const slugSku = normHeader(sku).replace(/[^a-z0-9_-]/gi, "-") || "item";
    let id = `${idPrefix}-${slugSku}`;
    if (seenSku.has(sku)) {
      id = `${idPrefix}-${slugSku}--dup${r + 1}`;
    }
    seenSku.add(sku);

    out.push({
      id,
      sku,
      descripcion: descFinal,
      unidad: unidad || "und",
      ...(categoria ? { categoria } : {}),
      ...(pvCell ? { puntoVentaOrigen: pvCell } : {}),
      ...(minimoSheet != null ? { minimoSugeridoSheet: minimoSheet } : {}),
    });
  }

  out.sort((a, b) => a.descripcion.localeCompare(b.descripcion, "es"));
  return out;
}
