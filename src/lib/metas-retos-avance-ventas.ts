import { ymdColombia, ymdColombiaMenosDias, ZONA_HORARIA_COLOMBIA } from "@/lib/fecha-colombia";
import {
  esVentaVigente,
  type LineaVentaGuardada,
  type VentaGuardadaLocal,
} from "@/lib/pos-ventas-local-storage";
import type { MetaRetoActiva } from "@/lib/wms-metas-retos-activas";

function normalizarClaveSkuMeta(s: string): string {
  return String(s ?? "").trim().toLowerCase();
}

/** WMS usa arepa:peto_queso; el POS persiste arepa:arepa_queso para la misma arepa. */
function normalizarSegmentoSkuMeta(seg: string): string {
  const t = seg.trim().toLowerCase();
  if (t === "arepa:arepa_queso" || t === "arepa:peto_queso") return "arepa:peto_queso";
  return t;
}

/** SKU compuesto normalizado para comparar ticket vs meta del WMS. */
export function skuNormalizadoParaMeta(s: string): string {
  const raw = normalizarClaveSkuMeta(s);
  if (!raw) return "";
  const parts = raw.split("|").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return "";
  const base = parts[0] ?? "";
  const segs = parts.slice(1).map(normalizarSegmentoSkuMeta);
  return [base, ...segs].join("|");
}

export function identificadoresLineaVenta(line: LineaVentaGuardada): string[] {
  const out: string[] = [];
  for (const v of [line.inventarioLookupKey, line.lineId, line.sku]) {
    const t = String(v ?? "").trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

function maxYmd(a: string, b: string): string {
  return a >= b ? a : b;
}

function minYmd(a: string, b: string): string {
  return a <= b ? a : b;
}

/** Domingo=0 … Sábado=6 según calendario Colombia. */
function diaSemanaColombiaSun0(ymd: string): number {
  const s = new Date(`${ymd}T12:00:00-05:00`).toLocaleDateString("en-US", {
    timeZone: ZONA_HORARIA_COLOMBIA,
    weekday: "short",
  });
  const m: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return m[s] ?? 0;
}

function ultimoDiaDelMesYmd(ymdCualquieraDelMes: string): string {
  const parts = ymdCualquieraDelMes.split("-");
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  if (!y || !m || m < 1 || m > 12) return ymdCualquieraDelMes;
  const nextM = m === 12 ? 1 : m + 1;
  const nextY = m === 12 ? y + 1 : y;
  const firstNext = `${nextY}-${String(nextM).padStart(2, "0")}-01`;
  return ymdColombiaMenosDias(firstNext, 1);
}

/**
 * Rango de fechas (YYYY-MM-DD) donde cuentan ventas para el reto, según cadencia y vigencia.
 * Usa la fecha de referencia del WMS (hoy en Colombia en el servidor) acotada a [fechaInicio, fechaFin].
 */
export function rangoConteoCadenciaReto(
  reto: Pick<MetaRetoActiva, "cadencia" | "fechaInicio" | "fechaFin">,
  fechaReferenciaYmd: string
): { desde: string; hasta: string } | null {
  const ini = reto.fechaInicio.trim();
  const fin = reto.fechaFin.trim();
  const ref = fechaReferenciaYmd.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ini) || !/^\d{4}-\d{2}-\d{2}$/.test(fin) || !/^\d{4}-\d{2}-\d{2}$/.test(ref)) {
    return null;
  }
  const refClamped = minYmd(maxYmd(ref, ini), fin);

  let periodDesde: string;
  let periodHasta: string;

  if (reto.cadencia === "diario") {
    periodDesde = periodHasta = refClamped;
  } else if (reto.cadencia === "semanal") {
    const dow = diaSemanaColombiaSun0(refClamped);
    const diasHastaLunes = dow === 0 ? 6 : dow - 1;
    const lunes = ymdColombiaMenosDias(refClamped, diasHastaLunes);
    const domingo = ymdColombiaMenosDias(lunes, -6);
    periodDesde = lunes;
    periodHasta = domingo;
  } else {
    const ym = refClamped.slice(0, 7);
    periodDesde = `${ym}-01`;
    periodHasta = ultimoDiaDelMesYmd(refClamped);
  }

  const desde = maxYmd(periodDesde, ini);
  const hasta = minYmd(periodHasta, fin);
  if (desde > hasta) return null;
  return { desde, hasta };
}

export function skuLineaCoincideReto(lineaSku: string, skuReto: string): boolean {
  const a = skuNormalizadoParaMeta(lineaSku);
  const b = skuNormalizadoParaMeta(skuReto);
  if (!a || !b) return false;
  if (a === b) return true;

  const partesA = a.split("|");
  const partesB = b.split("|");
  const baseA = partesA[0] ?? "";
  const baseB = partesB[0] ?? "";
  if (!baseA || baseA !== baseB) return false;

  const segsA = partesA.slice(1);
  const segsB = partesB.slice(1);

  // Meta sin variantes: cualquier venta del mismo código base cuenta.
  if (segsB.length === 0) return true;

  // Ticket guardó solo el SKU base (común en cobros POS); misma referencia de producto.
  if (segsA.length === 0) return true;

  const setA = new Set(segsA);
  return segsB.every((s) => setA.has(s));
}

export function lineaVentaCoincideReto(line: LineaVentaGuardada, skuReto: string): boolean {
  return identificadoresLineaVenta(line).some((id) => skuLineaCoincideReto(id, skuReto));
}

/** Suma cantidades vendidas del SKU en ventas vigentes cuya fechaYmd cae en [desde, hasta]. */
export function unidadesVendidasSkuEnRango(
  ventas: VentaGuardadaLocal[],
  skuReto: string,
  desde: string,
  hasta: string
): number {
  const target = String(skuReto ?? "").trim();
  if (!target) return 0;
  let sum = 0;
  for (const v of ventas) {
    if (!esVentaVigente(v)) continue;
    const fy = String(v.fechaYmd ?? "").trim();
    if (!fy || fy < desde || fy > hasta) continue;
    for (const line of v.lineas) {
      if (!lineaVentaCoincideReto(line, target)) continue;
      const q = Number(line.cantidad);
      if (Number.isFinite(q) && q > 0) sum += q;
    }
  }
  return sum;
}

export function avanceUnidadesReto(
  reto: MetaRetoActiva,
  ventas: VentaGuardadaLocal[],
  fechaReferenciaYmd: string
): { avance: number; rango: { desde: string; hasta: string } | null } {
  const rango = rangoConteoCadenciaReto(reto, fechaReferenciaYmd);
  if (!rango) return { avance: 0, rango: null };
  if (reto.tipoReto === "fidelizacion_clientes") {
    return { avance: Math.max(0, Math.trunc(Number(reto.avanceActual ?? 0) || 0)), rango };
  }
  const avance = unidadesVendidasSkuEnRango(ventas, reto.skuBarcode, rango.desde, rango.hasta);
  return { avance, rango };
}

export function etiquetaRangoPeriodo(desde: string, hasta: string): string {
  if (!desde && !hasta) return "";
  if (desde === hasta) return desde;
  return `${desde} → ${hasta}`;
}

/** Referencia para conteo: fecha del WMS o hoy Colombia. */
export function ymdReferenciaMetas(fechaReferenciaApi: string | null | undefined): string {
  const t = String(fechaReferenciaApi ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  return ymdColombia(new Date());
}
