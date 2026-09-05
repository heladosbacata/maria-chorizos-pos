/**
 * Índice de satisfacción al Franquiciado: áreas fijas, escala 1–5 y reglas de validación.
 */

export const INDICE_SATISFACCION_AREAS = [
  {
    id: "operaciones",
    label: "Acompañamiento por parte del Departamento de Experiencia (Melissa Medrano)",
    pregunta: "¿Qué tan bien le acompaña el Departamento de Experiencia en el día a día del punto?",
  },
  {
    id: "producto",
    label: "Producto y calidad",
    pregunta: "¿Cómo se siente con el producto, la calidad y el surtido?",
  },
  {
    id: "marketing",
    label: "Marketing y marca",
    pregunta: "¿Qué tan útil le resulta el apoyo de marketing y la marca?",
  },
  {
    id: "tecnologia",
    label: "Tecnología (POS / app)",
    pregunta: "¿Qué tan cómodo se siente con el POS GEB y las herramientas digitales?",
  },
  {
    id: "finanzas",
    label: "Logística y entrega de pedidos",
    pregunta: "¿Qué tan bien le funciona la logística y la entrega de pedidos?",
  },
  {
    id: "capacitacion",
    label: "Califica el departamento de Mantenimiento y Soporte",
    pregunta: "¿Cómo califica al departamento de Mantenimiento y Soporte cuando necesita ayuda?",
  },
] as const;

export type IndiceSatisfaccionAreaId = (typeof INDICE_SATISFACCION_AREAS)[number]["id"];

export type EstrellasSatisfaccion = 1 | 2 | 3 | 4 | 5;

/** Respuesta de administración (WMS) a una calificación baja (≤3). */
export interface RespuestaWmsArea {
  texto: string;
  respondidoAt: string | null;
  respondidoPorNombre: string;
  estado: "pendiente" | "respondida";
}

export interface AreaCalificacion {
  estrellas: EstrellasSatisfaccion | 0;
  observacion: string;
  /** Solo aplica / se muestra si estrellas ≤ 3; se rellena desde WMS. */
  respuestaWms: RespuestaWmsArea | null;
}

export type AreasCalificacionMap = Record<IndiceSatisfaccionAreaId, AreaCalificacion>;

export interface IndiceSatisfaccionMes {
  ym: string;
  areas: AreasCalificacionMap;
  /** ISO cuando se guardó completo */
  guardadoAt: string | null;
  /** Promedio 1–5 con 1 decimal; null si incompleto */
  indice: number | null;
  /** Áreas con ≤3 estrellas pendientes de respuesta WMS (índice para admin). */
  seguimientoWmsAreaIds: IndiceSatisfaccionAreaId[];
}

export const ESTRELLAS_LABELS: Record<EstrellasSatisfaccion, string> = {
  1: "Muy mal",
  2: "Regular",
  3: "Bien",
  4: "Muy bien",
  5: "Excelente",
};

export const MESES_CORTOS_ES = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
] as const;

export function areaCalificacionVacia(): AreaCalificacion {
  return { estrellas: 0, observacion: "", respuestaWms: null };
}

export function areasVacias(): AreasCalificacionMap {
  const out = {} as AreasCalificacionMap;
  for (const a of INDICE_SATISFACCION_AREAS) {
    out[a.id] = areaCalificacionVacia();
  }
  return out;
}

export function registroMesVacio(ym: string): IndiceSatisfaccionMes {
  return {
    ym: ym.trim(),
    areas: areasVacias(),
    guardadoAt: null,
    indice: null,
    seguimientoWmsAreaIds: [],
  };
}

/** Calificaciones 1–3 quedan a la vista de admin WMS para responder. */
export function requiereSeguimientoWms(estrellas: number): boolean {
  return estrellas >= 1 && estrellas <= 3;
}

export function normalizarRespuestaWms(raw: unknown): RespuestaWmsArea | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const texto = typeof o.texto === "string" ? o.texto.trim().slice(0, 2000) : "";
  const respondidoAt =
    typeof o.respondidoAt === "string" && o.respondidoAt.trim() ? o.respondidoAt.trim() : null;
  const respondidoPorNombre =
    typeof o.respondidoPorNombre === "string" ? o.respondidoPorNombre.trim().slice(0, 120) : "";
  const estado: RespuestaWmsArea["estado"] =
    o.estado === "respondida" || (texto && respondidoAt) ? "respondida" : "pendiente";
  if (estado === "pendiente" && !texto && !respondidoAt) {
    return { texto: "", respondidoAt: null, respondidoPorNombre: "", estado: "pendiente" };
  }
  return { texto, respondidoAt, respondidoPorNombre, estado };
}

export function listarAreasSeguimientoWms(areas: AreasCalificacionMap): IndiceSatisfaccionAreaId[] {
  const ids: IndiceSatisfaccionAreaId[] = [];
  for (const a of INDICE_SATISFACCION_AREAS) {
    if (requiereSeguimientoWms(areas[a.id]?.estrellas ?? 0)) ids.push(a.id);
  }
  return ids;
}

export function clampEstrellas(n: unknown): EstrellasSatisfaccion | 0 {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return 0;
  const r = Math.round(x);
  if (r < 1 || r > 5) return 0;
  return r as EstrellasSatisfaccion;
}

export function normalizarArea(raw: unknown): AreaCalificacion {
  if (!raw || typeof raw !== "object") return areaCalificacionVacia();
  const o = raw as Record<string, unknown>;
  const obs = typeof o.observacion === "string" ? o.observacion.trim().slice(0, 800) : "";
  const estrellas = clampEstrellas(o.estrellas);
  const respuestaRaw = normalizarRespuestaWms(o.respuestaWms);
  const respuestaWms =
    requiereSeguimientoWms(estrellas) && respuestaRaw
      ? respuestaRaw
      : requiereSeguimientoWms(estrellas)
        ? { texto: "", respondidoAt: null, respondidoPorNombre: "", estado: "pendiente" as const }
        : null;
  return { estrellas, observacion: obs, respuestaWms };
}

export function normalizarRegistroMes(ym: string, raw: unknown): IndiceSatisfaccionMes {
  const base = registroMesVacio(ym);
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  const areasIn = o.areas && typeof o.areas === "object" ? (o.areas as Record<string, unknown>) : {};
  for (const a of INDICE_SATISFACCION_AREAS) {
    base.areas[a.id] = normalizarArea(areasIn[a.id]);
  }
  const guardadoAt = typeof o.guardadoAt === "string" && o.guardadoAt.trim() ? o.guardadoAt.trim() : null;
  const indiceCalc = calcularIndice(base.areas);
  base.guardadoAt = guardadoAt;
  base.indice = guardadoAt ? indiceCalc : null;
  base.seguimientoWmsAreaIds = listarAreasSeguimientoWms(base.areas);
  return base;
}

/**
 * Al guardar desde el franquiciado: conserva respuestas WMS ya existentes
 * en áreas que siguen con ≤3 estrellas.
 */
/** Respuesta WMS publicada en un mes (para notificaciones al franquiciado). */
export type RespuestaWmsPublicada = {
  ym: string;
  areaId: IndiceSatisfaccionAreaId;
  areaLabel: string;
  texto: string;
  respondidoAt: string | null;
  respondidoPorNombre: string;
};

export function listarRespuestasWmsPublicadas(registro: IndiceSatisfaccionMes): RespuestaWmsPublicada[] {
  const items: RespuestaWmsPublicada[] = [];
  if (!registro.guardadoAt) return items;
  for (const a of INDICE_SATISFACCION_AREAS) {
    const cal = registro.areas[a.id];
    const rw = cal?.respuestaWms;
    if (rw?.estado === "respondida" && rw.texto.trim()) {
      items.push({
        ym: registro.ym,
        areaId: a.id,
        areaLabel: a.label,
        texto: rw.texto,
        respondidoAt: rw.respondidoAt,
        respondidoPorNombre: rw.respondidoPorNombre,
      });
    }
  }
  return items;
}

/** Elige la respuesta WMS más reciente entre local y nube (prioriza nube en empate). */
export function elegirRespuestaWmsMejor(
  a: RespuestaWmsArea | null | undefined,
  b: RespuestaWmsArea | null | undefined
): RespuestaWmsArea {
  const aOk = a?.estado === "respondida" && Boolean(a.texto.trim());
  const bOk = b?.estado === "respondida" && Boolean(b.texto.trim());
  if (aOk && bOk) {
    const aAt = a!.respondidoAt ?? "";
    const bAt = b!.respondidoAt ?? "";
    return bAt >= aAt ? b! : a!;
  }
  if (bOk) return b!;
  if (aOk) return a!;
  if (b?.texto?.trim() || b?.respondidoAt) return b;
  if (a?.texto?.trim() || a?.respondidoAt) return a;
  return { texto: "", respondidoAt: null, respondidoPorNombre: "", estado: "pendiente" };
}

/**
 * Combina datos del franquiciado (primary) con el otro origen;
 * las respuestas WMS se toman de cualquiera que tenga `respondida`.
 */
export function fusionarAreasIndiceLocalNube(
  primary: AreasCalificacionMap,
  secondary: AreasCalificacionMap
): AreasCalificacionMap {
  const out = areasVacias();
  for (const a of INDICE_SATISFACCION_AREAS) {
    const p = primary[a.id] ?? areaCalificacionVacia();
    const s = secondary[a.id] ?? areaCalificacionVacia();
    const estrellas = p.estrellas >= 1 ? p.estrellas : s.estrellas;
    const observacion = p.estrellas >= 1 ? p.observacion : s.observacion;
    const respuestaWms = requiereSeguimientoWms(estrellas)
      ? elegirRespuestaWmsMejor(p.respuestaWms, s.respuestaWms)
      : null;
    out[a.id] = { estrellas, observacion, respuestaWms };
  }
  return out;
}

/**
 * Fusiona local ↔ nube: datos del mes (estrellas) del `guardadoAt` más reciente;
 * respuestas WMS siempre se combinan para no perder actualizaciones de administración.
 */
export function fusionarRegistrosIndiceSatisfaccion(
  local: IndiceSatisfaccionMes,
  cloud: IndiceSatisfaccionMes | null | undefined
): IndiceSatisfaccionMes | null {
  if (!local.guardadoAt && !cloud?.guardadoAt) return null;
  if (!local.guardadoAt) return cloud ?? null;
  if (!cloud?.guardadoAt) return local;

  const localMasReciente = local.guardadoAt >= cloud.guardadoAt;
  const base = localMasReciente ? local : cloud;
  const otro = localMasReciente ? cloud : local;
  const areasMerged = fusionarAreasIndiceLocalNube(base.areas, otro.areas);

  return {
    ym: base.ym || local.ym,
    areas: areasMerged,
    guardadoAt: base.guardadoAt,
    indice: calcularIndice(areasMerged),
    seguimientoWmsAreaIds: listarAreasSeguimientoWms(areasMerged),
  };
}

export function fusionarAreasPreservandoRespuestasWms(
  nuevas: AreasCalificacionMap,
  previas: AreasCalificacionMap | null | undefined
): AreasCalificacionMap {
  const out = areasVacias();
  for (const a of INDICE_SATISFACCION_AREAS) {
    const n = nuevas[a.id] ?? areaCalificacionVacia();
    const p = previas?.[a.id];
    if (requiereSeguimientoWms(n.estrellas) && p?.respuestaWms?.estado === "respondida") {
      out[a.id] = { ...n, respuestaWms: p.respuestaWms };
    } else if (requiereSeguimientoWms(n.estrellas)) {
      out[a.id] = {
        ...n,
        respuestaWms: p?.respuestaWms?.estado === "respondida"
          ? p.respuestaWms
          : { texto: "", respondidoAt: null, respondidoPorNombre: "", estado: "pendiente" },
      };
    } else {
      out[a.id] = { ...n, respuestaWms: null };
    }
  }
  return out;
}

/** Promedio de áreas con estrellas > 0; null si ninguna. */
export function calcularIndice(areas: AreasCalificacionMap): number | null {
  let sum = 0;
  let n = 0;
  for (const a of INDICE_SATISFACCION_AREAS) {
    const e = areas[a.id]?.estrellas ?? 0;
    if (e >= 1 && e <= 5) {
      sum += e;
      n += 1;
    }
  }
  if (n === 0) return null;
  return Math.round((sum / n) * 10) / 10;
}

export function contarAreasCompletas(areas: AreasCalificacionMap): number {
  let n = 0;
  for (const a of INDICE_SATISFACCION_AREAS) {
    if ((areas[a.id]?.estrellas ?? 0) >= 1) n += 1;
  }
  return n;
}

export function totalAreas(): number {
  return INDICE_SATISFACCION_AREAS.length;
}

export type ErrorValidacionIndice =
  | { tipo: "incompleto"; faltan: IndiceSatisfaccionAreaId[] }
  | { tipo: "observacion"; areaId: IndiceSatisfaccionAreaId; mensaje: string };

/** Para guardar el mes: todas las áreas con 1–5; observación obligatoria si ≤ 3. */
export function validarParaGuardar(areas: AreasCalificacionMap): ErrorValidacionIndice | null {
  const faltan: IndiceSatisfaccionAreaId[] = [];
  for (const a of INDICE_SATISFACCION_AREAS) {
    const e = areas[a.id]?.estrellas ?? 0;
    if (e < 1 || e > 5) faltan.push(a.id);
  }
  if (faltan.length) return { tipo: "incompleto", faltan };

  for (const a of INDICE_SATISFACCION_AREAS) {
    const cal = areas[a.id];
    if (cal.estrellas >= 1 && cal.estrellas <= 3 && !cal.observacion.trim()) {
      return {
        tipo: "observacion",
        areaId: a.id,
        mensaje: `En «${a.label}» con ${cal.estrellas} estrellas, cuéntenos qué pasó (observación obligatoria).`,
      };
    }
  }
  return null;
}

export function ymDesdeYmd(ymd: string): string {
  const t = ymd.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t.slice(0, 7);
  if (/^\d{4}-\d{2}$/.test(t)) return t;
  return "";
}

export function parseYm(ym: string): { anio: number; mes: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(ym.trim());
  if (!m) return null;
  const anio = Number(m[1]);
  const mes = Number(m[2]);
  if (!Number.isFinite(anio) || mes < 1 || mes > 12) return null;
  return { anio, mes };
}

export function labelMesYm(ym: string): string {
  const p = parseYm(ym);
  if (!p) return ym;
  return `${MESES_CORTOS_ES[p.mes - 1]} ${p.anio}`;
}

export function ymDeAnioMes(anio: number, mes1a12: number): string {
  return `${anio}-${String(mes1a12).padStart(2, "0")}`;
}

/** Días del mes siguiente en que aún se puede calificar el mes anterior (1–15). */
export const DIAS_GRACIA_MES_ANTERIOR = 15;

export function ymAnteriorDe(ym: string): string {
  const p = parseYm(ym);
  if (!p) return "";
  if (p.mes === 1) return ymDeAnioMes(p.anio - 1, 12);
  return ymDeAnioMes(p.anio, p.mes - 1);
}

export function diaDelMesDesdeYmd(ymd: string): number {
  const t = ymd.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return 0;
  const d = Number(t.slice(8, 10));
  return Number.isFinite(d) && d >= 1 && d <= 31 ? d : 0;
}

/** Mes en curso siempre; mes anterior solo del día 1 al 15 del mes actual (calendario Colombia vía ymd). */
export function puedeEditarYmIndice(ym: string, ymdHoy: string): boolean {
  const ymHoy = ymDesdeYmd(ymdHoy);
  const target = ym.trim();
  if (!ymHoy || !target) return false;
  if (target === ymHoy) return true;
  const dia = diaDelMesDesdeYmd(ymdHoy);
  if (dia < 1 || dia > DIAS_GRACIA_MES_ANTERIOR) return false;
  return target === ymAnteriorDe(ymHoy);
}

/**
 * Meses que se pueden calificar hoy.
 * En ventana de gracia el mes anterior va primero (caso típico: cerrar el mes pasado).
 */
export function ymsEditablesIndice(ymdHoy: string): string[] {
  const ymHoy = ymDesdeYmd(ymdHoy);
  if (!ymHoy) return [];
  const dia = diaDelMesDesdeYmd(ymdHoy);
  if (dia >= 1 && dia <= DIAS_GRACIA_MES_ANTERIOR) {
    const ant = ymAnteriorDe(ymHoy);
    return ant ? [ant, ymHoy] : [ymHoy];
  }
  return [ymHoy];
}

export function colorIndice(indice: number | null): "rojo" | "ambar" | "verde" | "gris" {
  if (indice == null) return "gris";
  if (indice < 3) return "rojo";
  if (indice < 4) return "ambar";
  return "verde";
}
