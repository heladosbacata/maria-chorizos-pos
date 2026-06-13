import { ymdColombia, ZONA_HORARIA_COLOMBIA } from "@/lib/fecha-colombia";

/** Meses abreviados/español que puede enviar el WMS en `cajeroCumpleanosCorto`. */
const MES_CORTO_A_NUM: Record<string, number> = {
  ene: 1,
  enero: 1,
  jan: 1,
  feb: 2,
  febrero: 2,
  mar: 3,
  marzo: 3,
  abr: 4,
  abril: 4,
  may: 5,
  mayo: 5,
  jun: 6,
  junio: 6,
  jul: 7,
  julio: 7,
  ago: 8,
  agosto: 8,
  sep: 9,
  sept: 9,
  septiembre: 9,
  oct: 10,
  octubre: 10,
  nov: 11,
  noviembre: 11,
  dic: 12,
  diciembre: 12,
};

export type PartesCumpleanos = { dia: number; mes: number };

export function minutosDesdeMedianocheColombia(d: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONA_HORARIA_COLOMBIA,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(d);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

/** Ventana festiva del cumpleaños: 6:00 a 23:59 (Colombia). */
export function ventanaCumpleanosActivaColombia(d: Date = new Date()): boolean {
  const m = minutosDesdeMedianocheColombia(d);
  return m >= 6 * 60 && m <= 23 * 60 + 59;
}

export function partesFechaColombia(d: Date = new Date()): { dia: number; mes: number; ymd: string } {
  const ymd = ymdColombia(d);
  const [, mm, dd] = ymd.split("-");
  return { dia: Number(dd), mes: Number(mm), ymd };
}

export function parseCumpleCorto(texto: string): PartesCumpleanos | null {
  const t = texto.trim().toLowerCase().replace(/\./g, "");
  const m = t.match(/^(\d{1,2})\s+([a-záéíóúñ]+)/i);
  if (!m) return null;
  const dia = Number(m[1]);
  const mesToken = m[2]!
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .slice(0, 10);
  const mes = MES_CORTO_A_NUM[mesToken];
  if (!mes || !Number.isFinite(dia) || dia < 1 || dia > 31) return null;
  return { dia, mes };
}

export function parseFechaNacimientoYmd(raw: string | undefined | null): PartesCumpleanos | null {
  if (!raw?.trim()) return null;
  const t = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    const [, mm, dd] = t.split("-");
    const mes = Number(mm);
    const dia = Number(dd);
    if (mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31) return { dia, mes };
    return null;
  }
  return parseCumpleCorto(t);
}

export function esCumpleanosHoyColombia(params: {
  fechaNacimiento?: string | null;
  cumpleCorto?: string | null;
  ahora?: Date;
}): boolean {
  const hoy = partesFechaColombia(params.ahora ?? new Date());
  const partes =
    parseFechaNacimientoYmd(params.fechaNacimiento ?? undefined) ??
    (params.cumpleCorto ? parseCumpleCorto(params.cumpleCorto) : null);
  if (!partes) return false;
  return partes.dia === hoy.dia && partes.mes === hoy.mes;
}

export function idMuroCumpleanos(cajeroId: string, ymd: string = ymdColombia()): string {
  const id = cajeroId.trim().replace(/[^\w.-]+/g, "_").slice(0, 80);
  return `${id}_${ymd}`;
}

export const FRASES_CUMPLE_LIGA = [
  "¡Que este día esté lleno de sonrisas y buenas ventas!",
  "¡Gracias por sumar alegría al equipo GEB!",
  "¡Hoy celebramos contigo desde todos los puntos del país!",
  "¡Un abrazo grande en tu día especial!",
  "¡Que cumplas muchos más rodeado de buena energía!",
] as const;
