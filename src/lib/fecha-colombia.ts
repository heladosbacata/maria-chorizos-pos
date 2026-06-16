/**
 * Hora oficial de Colombia (COT, UTC−5, sin horario de verano).
 * @see https://www.iana.org/time-zones — America/Bogota
 */

export const ZONA_HORARIA_COLOMBIA = "America/Bogota" as const;

export const LOCALE_COL = "es-CO" as const;

const TZ: Intl.DateTimeFormatOptions = { timeZone: ZONA_HORARIA_COLOMBIA };

/** YYYY-MM-DD según calendario en Colombia (ventas, reportes, WMS). */
export function ymdColombia(d: Date = new Date()): string {
  return d.toLocaleDateString("sv-SE", TZ);
}

/** Fecha y hora legibles en locale Colombia con zona Bogotá. */
export function fechaHoraColombia(d: Date, options?: Omit<Intl.DateTimeFormatOptions, "timeZone">): string {
  return d.toLocaleString(LOCALE_COL, { ...TZ, ...options });
}

/** Solo fecha legible en Colombia. */
export function fechaColombia(d: Date, options?: Omit<Intl.DateTimeFormatOptions, "timeZone">): string {
  return d.toLocaleDateString(LOCALE_COL, { ...TZ, ...options });
}

/**
 * Opciones `toLocaleString` / `toLocaleDateString` con zona Colombia forzada
 * (útil para montos que también llevan locale es-CO).
 */
export function conZonaColombia(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormatOptions {
  return { ...options, timeZone: ZONA_HORARIA_COLOMBIA };
}

/** Mediodía en offset fijo Colombia; ancla segura para aritmética de días (sin DST en CO). */
export function mediodiaColombiaDesdeYmd(ymd: string): Date {
  return new Date(`${ymd}T12:00:00-05:00`);
}

/** Resta días naturales a un YYYY-MM-DD interpretado en Colombia. */
export function ymdColombiaMenosDias(ymd: string, dias: number): string {
  const ms = mediodiaColombiaDesdeYmd(ymd).getTime() - dias * 86_400_000;
  return ymdColombia(new Date(ms));
}

/** Inicio del día (00:00) en Colombia para un YYYY-MM-DD — timestamp ms. */
export function inicioDiaColombiaMs(yyyyMmDd: string): number {
  const t = yyyyMmDd.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return NaN;
  return new Date(`${t}T00:00:00-05:00`).getTime();
}

/** Fin del día (23:59:59.999) en Colombia para un YYYY-MM-DD — timestamp ms. */
export function finDiaColombiaMs(yyyyMmDd: string): number {
  const t = yyyyMmDd.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return NaN;
  return new Date(`${t}T23:59:59.999-05:00`).getTime();
}

/** HH:mm en Colombia (para inputs type="time"). */
export function horaInputColombia(d: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: ZONA_HORARIA_COLOMBIA,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const hh = parts.find((p) => p.type === "hour")?.value ?? "00";
  const mm = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${hh.padStart(2, "0")}:${mm.padStart(2, "0")}`;
}

/** Inicio del minuto (seg 0) en Colombia — YYYY-MM-DD + HH:mm. */
export function msDesdeYmdHoraColombia(ymd: string, horaInput: string): number {
  const t = ymd.trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(horaInput.trim());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t) || !m) return NaN;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return NaN;
  return new Date(
    `${t}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00.000-05:00`
  ).getTime();
}

/** Fin del minuto (seg 59.999) en Colombia — YYYY-MM-DD + HH:mm. */
export function msHastaYmdHoraColombia(ymd: string, horaInput: string): number {
  const inicio = msDesdeYmdHoraColombia(ymd, horaInput);
  if (!Number.isFinite(inicio)) return NaN;
  return inicio + 59_999;
}

/** Etiqueta legible de un rango exacto (fecha + hora, Colombia). */
export function etiquetaRangoFechaHoraColombia(desdeMs: number, hastaMs: number): string {
  if (!Number.isFinite(desdeMs) || !Number.isFinite(hastaMs)) return "—";
  const fmt = (ms: number) =>
    fechaHoraColombia(new Date(ms), { dateStyle: "short", timeStyle: "short" });
  return `${fmt(desdeMs)} — ${fmt(hastaMs)}`;
}
