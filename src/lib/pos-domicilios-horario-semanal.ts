import { normalizarHoraConfig } from "@/lib/pos-domicilios-horario";

/** 0 = domingo … 6 = sábado (igual que `Date.getDay` en zona Colombia). */
export type DiaSemanaDomicilio = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type FranjaHorarioDiaDomicilio = {
  activo: boolean;
  horaInicio: string;
  horaFin: string;
};

export type HorarioSemanalDomicilios = Record<DiaSemanaDomicilio, FranjaHorarioDiaDomicilio>;

export const DIAS_SEMANA_DOMICILIOS_UI: { key: DiaSemanaDomicilio; label: string; corto: string }[] = [
  { key: 1, label: "Lunes", corto: "Lun" },
  { key: 2, label: "Martes", corto: "Mar" },
  { key: 3, label: "Miércoles", corto: "Mié" },
  { key: 4, label: "Jueves", corto: "Jue" },
  { key: 5, label: "Viernes", corto: "Vie" },
  { key: 6, label: "Sábado", corto: "Sáb" },
  { key: 0, label: "Domingo", corto: "Dom" },
];

const DEFAULT_HORA_INICIO = "07:00";
const DEFAULT_HORA_FIN = "22:00";

function franjaDefault(horaInicio = DEFAULT_HORA_INICIO, horaFin = DEFAULT_HORA_FIN): FranjaHorarioDiaDomicilio {
  return { activo: true, horaInicio, horaFin };
}

export function horarioSemanalDesdeLegacy(horaInicio: string, horaFin: string): HorarioSemanalDomicilios {
  const ini = normalizarHoraConfig(horaInicio) ?? DEFAULT_HORA_INICIO;
  const fin = normalizarHoraConfig(horaFin) ?? DEFAULT_HORA_FIN;
  const base = franjaDefault(ini, fin);
  return {
    0: { ...base },
    1: { ...base },
    2: { ...base },
    3: { ...base },
    4: { ...base },
    5: { ...base },
    6: { ...base },
  };
}

export function horarioSemanalVacioDefault(): HorarioSemanalDomicilios {
  return horarioSemanalDesdeLegacy(DEFAULT_HORA_INICIO, DEFAULT_HORA_FIN);
}

export function normalizarHorarioSemanalDomicilios(
  raw: unknown,
  fallback?: HorarioSemanalDomicilios
): HorarioSemanalDomicilios {
  const base = fallback ?? horarioSemanalVacioDefault();
  if (!raw || typeof raw !== "object") return { ...base };

  const out = { ...base };
  const o = raw as Record<string, unknown>;
  for (const { key } of DIAS_SEMANA_DOMICILIOS_UI) {
    const entry = o[String(key)] ?? o[key];
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const activo = e.activo === false ? false : e.activo === true ? true : base[key].activo;
    const hi = typeof e.horaInicio === "string" ? normalizarHoraConfig(e.horaInicio) : null;
    const hf = typeof e.horaFin === "string" ? normalizarHoraConfig(e.horaFin) : null;
    out[key] = {
      activo,
      horaInicio: hi ?? base[key].horaInicio,
      horaFin: hf ?? base[key].horaFin,
    };
  }
  return out;
}

export function validarHorarioSemanalDomicilios(h: HorarioSemanalDomicilios): string | null {
  let algunoActivo = false;
  for (const { key, label } of DIAS_SEMANA_DOMICILIOS_UI) {
    const f = h[key];
    if (!f.activo) continue;
    algunoActivo = true;
    if (!normalizarHoraConfig(f.horaInicio)) return `Hora de inicio inválida en ${label}.`;
    if (!normalizarHoraConfig(f.horaFin)) return `Hora de cierre inválida en ${label}.`;
  }
  if (!algunoActivo) return "Activá al menos un día de la semana para recibir pedidos.";
  return null;
}

export function aplicarFranjaATodosLosDias(
  h: HorarioSemanalDomicilios,
  origen: DiaSemanaDomicilio
): HorarioSemanalDomicilios {
  const src = h[origen];
  const out = { ...h };
  for (const { key } of DIAS_SEMANA_DOMICILIOS_UI) {
    out[key] = { ...src };
  }
  return out;
}

export function legacyHorarioDesdeSemanal(h: HorarioSemanalDomicilios): { horaInicio: string; horaFin: string } {
  for (const { key } of DIAS_SEMANA_DOMICILIOS_UI) {
    const f = h[key];
    if (f.activo) {
      return {
        horaInicio: normalizarHoraConfig(f.horaInicio) ?? DEFAULT_HORA_INICIO,
        horaFin: normalizarHoraConfig(f.horaFin) ?? DEFAULT_HORA_FIN,
      };
    }
  }
  return { horaInicio: DEFAULT_HORA_INICIO, horaFin: DEFAULT_HORA_FIN };
}
