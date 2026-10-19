/**
 * Plan de bonos artesanos — borrador v1.
 * Metas por venta del turno/día en el punto de venta.
 */

export type PlanBonosMetaId = "bronce_500" | "plata_700" | "oro_1000";

export type PlanBonosMeta = {
  id: PlanBonosMetaId;
  umbralCOP: number;
  bonoCOP: number;
  etiqueta: string;
  tono: "bronce" | "plata" | "oro";
};

export const PLAN_BONOS_ARTESANOS_METAS: readonly PlanBonosMeta[] = [
  {
    id: "bronce_500",
    umbralCOP: 500_000,
    bonoCOP: 10_000,
    etiqueta: "Meta bronce",
    tono: "bronce",
  },
  {
    id: "plata_700",
    umbralCOP: 700_000,
    bonoCOP: 20_000,
    etiqueta: "Meta plata",
    tono: "plata",
  },
  {
    id: "oro_1000",
    umbralCOP: 1_000_000,
    bonoCOP: 100_000,
    etiqueta: "Bono de oro",
    tono: "oro",
  },
] as const;

/** Escala visual de la barra (tope del oro). */
export const PLAN_BONOS_ESCALA_MAX_COP = 1_000_000;

export const COL_PLAN_BONOS_ARTESANOS = "posPlanBonosArtesanos";

export type PlanBonosLogroPublicado = {
  id: string;
  metaId: PlanBonosMetaId;
  umbralCOP: number;
  bonoCOP: number;
  etiqueta: string;
  tono: PlanBonosMeta["tono"];
  puntoVenta: string;
  ventaAlcanzada: number;
  ymd: string;
  createdAtMs: number;
  uid?: string;
};

const STORAGE_PREFIX = "pos_plan_bonos_artesanos_v1";

/** Evento DOM: la billetera de bonos artesanos cambió (misma pestaña). */
export const EVENT_PLAN_BONOS_BILLETERA = "pos-plan-bonos-billetera";
/** Evento DOM: historial / cancelaciones del franquiciado. */
export const EVENT_PLAN_BONOS_HISTORIAL = "pos-plan-bonos-historial";

export type BilleteraItemArtesanos = {
  /** `${ymd}:${metaId}` — idempotente por día y meta. */
  key: string;
  metaId: PlanBonosMetaId;
  ymd: string;
  bonoCOP: number;
  etiqueta: string;
  tono: PlanBonosMeta["tono"];
  artesanoNombre?: string;
};

export type BilleteraArtesanosEstado = {
  quincenaId: string;
  items: BilleteraItemArtesanos[];
  totalCOP: number;
};

/** Registro histórico (todas las quincenas) para el franquiciado. */
export type HistorialBonoArtesanos = {
  id: string;
  key: string;
  metaId: PlanBonosMetaId;
  ymd: string;
  quincenaId: string;
  bonoCOP: number;
  etiqueta: string;
  tono: PlanBonosMeta["tono"];
  artesanoNombre: string;
  cancelado: boolean;
  canceladoAtMs?: number;
  registradoAtMs: number;
};

export function metaPorId(id: string): PlanBonosMeta | undefined {
  return PLAN_BONOS_ARTESANOS_METAS.find((m) => m.id === id);
}

/**
 * Quincena laboral Colombia: Q1 = días 1–15, Q2 = 16–fin de mes.
 * Al cambiar de quincena la billetera vuelve a cero (pago quincenal).
 */
export function idQuincenaColombia(ymd: string): string {
  const t = ymd.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return "invalid";
  const day = Number(t.slice(8, 10));
  const ym = t.slice(0, 7);
  return `${ym}-Q${day <= 15 ? "1" : "2"}`;
}

function ultimoDiaMesYmd(ym: string): string {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7));
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return `${ym}-28`;
  const d = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${ym}-${String(d).padStart(2, "0")}`;
}

export function rangoEtiquetaQuincena(ymd: string): { desde: string; hasta: string; etiquetaCorta: string } {
  const t = ymd.trim();
  const ym = t.slice(0, 7);
  const day = Number(t.slice(8, 10));
  const mesCorto = (() => {
    try {
      return new Intl.DateTimeFormat("es-CO", { month: "short", timeZone: "America/Bogota" }).format(
        new Date(`${ym}-15T12:00:00-05:00`)
      );
    } catch {
      return ym;
    }
  })();
  if (day <= 15) {
    return { desde: `${ym}-01`, hasta: `${ym}-15`, etiquetaCorta: `1–15 ${mesCorto}` };
  }
  const hasta = ultimoDiaMesYmd(ym);
  const diaFin = hasta.slice(8, 10);
  return { desde: `${ym}-16`, hasta, etiquetaCorta: `16–${diaFin} ${mesCorto}` };
}

function storageKeyBilletera(puntoVenta: string): string {
  const pv = puntoVenta.trim().toLowerCase() || "sin-pv";
  return `${STORAGE_PREFIX}:billetera:${pv}`;
}

function emitirBilleteraChanged(puntoVenta: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(EVENT_PLAN_BONOS_BILLETERA, { detail: { puntoVenta: puntoVenta.trim() } })
  );
}

function emitirHistorialChanged(puntoVenta: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(EVENT_PLAN_BONOS_HISTORIAL, { detail: { puntoVenta: puntoVenta.trim() } })
  );
}

function storageKeyHistorial(puntoVenta: string): string {
  const pv = puntoVenta.trim().toLowerCase() || "sin-pv";
  return `${STORAGE_PREFIX}:historial:${pv}`;
}

function leerHistorialCrudo(puntoVenta: string): HistorialBonoArtesanos[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKeyHistorial(puntoVenta));
    if (!raw) return [];
    const data = JSON.parse(raw) as { items?: HistorialBonoArtesanos[] };
    if (!Array.isArray(data.items)) return [];
    return data.items.filter((it) => it && typeof it.id === "string" && typeof it.bonoCOP === "number");
  } catch {
    return [];
  }
}

function guardarHistorialCrudo(puntoVenta: string, items: HistorialBonoArtesanos[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKeyHistorial(puntoVenta), JSON.stringify({ items }));
    emitirHistorialChanged(puntoVenta);
  } catch {
    /* ignore */
  }
}

export function listarHistorialBonosArtesanos(puntoVenta: string): HistorialBonoArtesanos[] {
  const pv = puntoVenta.trim();
  const items = leerHistorialCrudo(pv);
  // Migración suave: bonos que solo estaban en la billetera quincenal.
  const bill = leerBilleteraCruda(pv);
  if (bill?.items?.length) {
    let changed = false;
    for (const it of bill.items) {
      if (items.some((h) => h.key === it.key)) continue;
      const meta = metaPorId(it.metaId);
      if (!meta) continue;
      items.push({
        id: `${pv.toLowerCase().replace(/\s+/g, "_").slice(0, 40)}_${it.key}`,
        key: it.key,
        metaId: it.metaId,
        ymd: it.ymd,
        quincenaId: bill.quincenaId,
        bonoCOP: it.bonoCOP,
        etiqueta: it.etiqueta || meta.etiqueta,
        tono: it.tono || meta.tono,
        artesanoNombre: it.artesanoNombre?.trim() || "Artesano del turno",
        cancelado: false,
        registradoAtMs: Date.now(),
      });
      changed = true;
    }
    if (changed) guardarHistorialCrudo(pv, items);
  }
  return [...items].sort((a, b) => {
    if (a.ymd !== b.ymd) return b.ymd.localeCompare(a.ymd);
    return (b.registradoAtMs || 0) - (a.registradoAtMs || 0);
  });
}

export function etiquetaQuincenaDesdeId(quincenaId: string): string {
  const m = /^(\d{4}-\d{2})-Q([12])$/.exec(quincenaId.trim());
  if (!m) return quincenaId;
  const ym = m[1];
  const q = m[2];
  const ymdRef = q === "1" ? `${ym}-01` : `${ym}-16`;
  return rangoEtiquetaQuincena(ymdRef).etiquetaCorta;
}

/**
 * Marca (o desmarca) un bono como ya cancelado/pagado por el franquiciado.
 * Si está en la quincena actual, también ajusta la billetera.
 */
export function marcarBonoArtesanosCancelado(
  puntoVenta: string,
  bonoId: string,
  cancelado: boolean,
  ymdHoy: string
): HistorialBonoArtesanos[] {
  const pv = puntoVenta.trim();
  if (!pv || !bonoId.trim()) return listarHistorialBonosArtesanos(pv);
  const items = leerHistorialCrudo(pv);
  const next = items.map((it) => {
    if (it.id !== bonoId) return it;
    return {
      ...it,
      cancelado,
      canceladoAtMs: cancelado ? Date.now() : undefined,
    };
  });
  guardarHistorialCrudo(pv, next);

  const qHoy = idQuincenaColombia(ymdHoy);
  const billetera = leerBilleteraCruda(pv);
  if (billetera && billetera.quincenaId === qHoy) {
    const pendientes = next.filter((it) => it.quincenaId === qHoy && !it.cancelado);
    guardarBilleteraCruda(pv, {
      quincenaId: qHoy,
      items: pendientes.map((it) => ({
        key: it.key,
        metaId: it.metaId,
        ymd: it.ymd,
        bonoCOP: it.bonoCOP,
        etiqueta: it.etiqueta,
        tono: it.tono,
        artesanoNombre: it.artesanoNombre,
      })),
    });
  }

  return [...next].sort((a, b) => b.ymd.localeCompare(a.ymd));
}

function upsertHistorialBono(
  puntoVenta: string,
  meta: PlanBonosMeta,
  ymd: string,
  artesanoNombre?: string
): void {
  const pv = puntoVenta.trim();
  const y = ymd.trim();
  const qId = idQuincenaColombia(y);
  if (!pv || qId === "invalid") return;
  const key = `${y}:${meta.id}`;
  const id = `${pv.toLowerCase().replace(/\s+/g, "_").slice(0, 40)}_${key}`;
  const items = leerHistorialCrudo(pv);
  if (items.some((it) => it.id === id || it.key === key)) return;
  const nombre = artesanoNombre?.trim() || "Artesano del turno";
  items.push({
    id,
    key,
    metaId: meta.id,
    ymd: y,
    quincenaId: qId,
    bonoCOP: meta.bonoCOP,
    etiqueta: meta.etiqueta,
    tono: meta.tono,
    artesanoNombre: nombre,
    cancelado: false,
    registradoAtMs: Date.now(),
  });
  guardarHistorialCrudo(pv, items);
}

function leerBilleteraCruda(puntoVenta: string): { quincenaId: string; items: BilleteraItemArtesanos[] } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKeyBilletera(puntoVenta));
    if (!raw) return null;
    const data = JSON.parse(raw) as { quincenaId?: string; items?: BilleteraItemArtesanos[] };
    if (typeof data.quincenaId !== "string" || !Array.isArray(data.items)) return null;
    return { quincenaId: data.quincenaId, items: data.items };
  } catch {
    return null;
  }
}

function guardarBilleteraCruda(
  puntoVenta: string,
  estado: { quincenaId: string; items: BilleteraItemArtesanos[] }
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKeyBilletera(puntoVenta), JSON.stringify(estado));
    emitirBilleteraChanged(puntoVenta);
  } catch {
    /* ignore */
  }
}

/** Lee la billetera de la quincena actual; si cambió la quincena, queda en cero. */
export function leerBilleteraArtesanos(puntoVenta: string, ymd: string): BilleteraArtesanosEstado {
  const pv = puntoVenta.trim();
  const ymdRef = ymd.trim();
  const qId = ymdRef ? idQuincenaColombia(ymdRef) : "invalid";
  if (!pv || qId === "invalid") {
    return { quincenaId: qId, items: [], totalCOP: 0 };
  }
  const cruda = leerBilleteraCruda(pv);
  if (!cruda || cruda.quincenaId !== qId) {
    if (cruda && cruda.quincenaId !== qId) {
      guardarBilleteraCruda(pv, { quincenaId: qId, items: [] });
    }
    return { quincenaId: qId, items: [], totalCOP: 0 };
  }
  const cancelados = new Set(
    leerHistorialCrudo(pv)
      .filter((h) => h.cancelado)
      .map((h) => h.key)
  );
  const items = cruda.items.filter(
    (it) => it && typeof it.bonoCOP === "number" && !cancelados.has(it.key)
  );
  const totalCOP = items.reduce((s, it) => s + Math.max(0, it.bonoCOP), 0);
  return { quincenaId: qId, items, totalCOP };
}

/**
 * Acumula un bono ganado en la billetera de la quincena (idempotente por día+meta)
 * y lo deja en el historial del franquiciado.
 * Al pasar a la siguiente quincena, la billetera se reinicia sola.
 */
export function registrarBonoEnBilletera(
  puntoVenta: string,
  meta: PlanBonosMeta,
  ymd: string,
  artesanoNombre?: string
): BilleteraArtesanosEstado {
  const pv = puntoVenta.trim();
  const y = ymd.trim();
  const qId = idQuincenaColombia(y);
  if (!pv || qId === "invalid") {
    return { quincenaId: qId, items: [], totalCOP: 0 };
  }
  upsertHistorialBono(pv, meta, y, artesanoNombre);
  const actual = leerBilleteraArtesanos(pv, y);
  const key = `${y}:${meta.id}`;
  if (actual.items.some((it) => it.key === key)) {
    return actual;
  }
  // Si ya estaba cancelado en historial, no vuelve a la billetera.
  const hist = leerHistorialCrudo(pv).find((it) => it.key === key);
  if (hist?.cancelado) {
    return actual;
  }
  const items: BilleteraItemArtesanos[] = [
    ...actual.items,
    {
      key,
      metaId: meta.id,
      ymd: y,
      bonoCOP: meta.bonoCOP,
      etiqueta: meta.etiqueta,
      tono: meta.tono,
      artesanoNombre: artesanoNombre?.trim() || undefined,
    },
  ];
  guardarBilleteraCruda(pv, { quincenaId: qId, items });
  const totalCOP = items.reduce((s, it) => s + it.bonoCOP, 0);
  return { quincenaId: qId, items, totalCOP };
}

export function pctBarraPlanBonos(ventaCOP: number, maxCOP = PLAN_BONOS_ESCALA_MAX_COP): number {
  if (!Number.isFinite(ventaCOP) || ventaCOP <= 0 || maxCOP <= 0) return 0;
  return Math.min(100, Math.round((ventaCOP / maxCOP) * 1000) / 10);
}

export function metasAlcanzadas(ventaCOP: number): PlanBonosMeta[] {
  const v = Number.isFinite(ventaCOP) ? ventaCOP : 0;
  return PLAN_BONOS_ARTESANOS_METAS.filter((m) => v >= m.umbralCOP);
}

export function storageKeyLogroLocal(puntoVenta: string, ymd: string, metaId: PlanBonosMetaId): string {
  const pv = puntoVenta.trim().toLowerCase() || "sin-pv";
  return `${STORAGE_PREFIX}:local:${pv}:${ymd}:${metaId}`;
}

export function yaCelebradoLocal(key: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function marcarCelebradoLocal(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    /* ignore */
  }
}

export function storageKeyLogroRemotoVisto(logroId: string): string {
  return `${STORAGE_PREFIX}:remoto:${logroId}`;
}

export function yaVistoRemoto(logroId: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.sessionStorage.getItem(storageKeyLogroRemotoVisto(logroId)) === "1";
  } catch {
    return false;
  }
}

export function marcarVistoRemoto(logroId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(storageKeyLogroRemotoVisto(logroId), "1");
  } catch {
    /* ignore */
  }
}

export function docIdPlanBonosLogro(puntoVenta: string, ymd: string, metaId: PlanBonosMetaId): string {
  const pv = puntoVenta
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/gi, "_")
    .slice(0, 80);
  return `${pv}_${ymd}_${metaId}`;
}

export function siguienteMetaPendiente(ventaCOP: number): PlanBonosMeta | null {
  const v = Number.isFinite(ventaCOP) ? ventaCOP : 0;
  return PLAN_BONOS_ARTESANOS_METAS.find((m) => v < m.umbralCOP) ?? null;
}
