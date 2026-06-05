/** Reglas de horario de domicilios (zona horaria Colombia). */

import {
  DIAS_SEMANA_DOMICILIOS_UI,
  type DiaSemanaDomicilio,
  type HorarioSemanalDomicilios,
} from "@/lib/pos-domicilios-horario-semanal";

export const ZONA_HORARIA_DOMICILIOS_DEFAULT = "America/Bogota";

export function minutosRelojEnZona(d: Date, timeZone: string): number {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return h * 60 + m;
}

/** Devuelve minutos desde medianoche o null si el formato no es HH:mm (24 h). */
export function parseHHmmAMinutos(s: string): number | null {
  const t = s.trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

/**
 * Inicio y fin inclusive en el reloj local de la zona (p. ej. 08:00–22:00).
 * Si inicio > fin, se interpreta ventana que cruza medianoche.
 */
export function estaEnVentanaHoraria(
  horaInicio: string,
  horaFin: string,
  ahora = new Date(),
  timeZone = ZONA_HORARIA_DOMICILIOS_DEFAULT
): boolean {
  const a = parseHHmmAMinutos(horaInicio);
  const b = parseHHmmAMinutos(horaFin);
  if (a == null || b == null) return true;
  const t = minutosRelojEnZona(ahora, timeZone);
  if (a === b) return true;
  if (a < b) return t >= a && t <= b;
  return t >= a || t <= b;
}

export function textoHorarioAtencionCliente(horaInicio: string, horaFin: string): string {
  return `Los domicilios de este punto se toman de ${horaInicio} a ${horaFin} (hora Colombia, ${ZONA_HORARIA_DOMICILIOS_DEFAULT}).`;
}

/** Día de la semana en Colombia: 0 = domingo … 6 = sábado. */
export function diaSemanaColombia(d: Date, timeZone = ZONA_HORARIA_DOMICILIOS_DEFAULT): DiaSemanaDomicilio {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" });
  const wd = fmt.format(d).toLowerCase();
  const map: Record<string, DiaSemanaDomicilio> = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
  };
  return map[wd] ?? 0;
}

export function estaEnHorarioSemanalDomicilios(
  horario: HorarioSemanalDomicilios,
  ahora = new Date(),
  timeZone = ZONA_HORARIA_DOMICILIOS_DEFAULT
): boolean {
  const dow = diaSemanaColombia(ahora, timeZone);
  const franja = horario[dow];
  if (!franja?.activo) return false;
  return estaEnVentanaHoraria(franja.horaInicio, franja.horaFin, ahora, timeZone);
}

export function textoHorarioSemanalCliente(horario: HorarioSemanalDomicilios): string {
  const partes: string[] = [];
  for (const { key, corto } of DIAS_SEMANA_DOMICILIOS_UI) {
    const f = horario[key];
    if (!f?.activo) continue;
    partes.push(`${corto} ${f.horaInicio}–${f.horaFin}`);
  }
  if (!partes.length) {
    return "Este punto no tiene días habilitados para pedidos en línea.";
  }
  return `Horario de pedidos (Colombia): ${partes.join(", ")}.`;
}

export function estaEnHorarioDomiciliosConfig(
  cfg: {
    domiciliosHorarioSemanal: HorarioSemanalDomicilios;
    domiciliosHoraInicio: string;
    domiciliosHoraFin: string;
  },
  ahora = new Date()
): boolean {
  return estaEnHorarioSemanalDomicilios(cfg.domiciliosHorarioSemanal, ahora);
}

export function textoHorarioDomiciliosCliente(cfg: {
  domiciliosHorarioSemanal: HorarioSemanalDomicilios;
  domiciliosHoraInicio: string;
  domiciliosHoraFin: string;
}): string {
  return textoHorarioSemanalCliente(cfg.domiciliosHorarioSemanal);
}

/** Normaliza a "HH:mm" o null si no es una hora válida. */
export function normalizarHoraConfig(s: string): string | null {
  const m = parseHHmmAMinutos(s);
  if (m == null) return null;
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
