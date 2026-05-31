/**
 * Resumen opcional que el WMS puede devolver al validar documento (plan de millas).
 */
export type PlanMillasClienteResumen = {
  nombre?: string;
  millas?: number;
  documento?: string;
  /** Id Firestore del socio en WMS (`club_de_millas_socios`). */
  socioId?: string;
};

function normalizarBodyJson(body: unknown): unknown {
  if (typeof body === "string") {
    try {
      return JSON.parse(body) as unknown;
    } catch {
      return body;
    }
  }
  return body;
}

function pickString(o: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

function parseNumeroDesdeString(raw: string): number | undefined {
  const t = raw.trim().replace(/\s/g, "");
  if (!t) return undefined;
  const soloDigitosYsep = /^[\d.,]+$/;
  if (!soloDigitosYsep.test(t)) return undefined;
  // Formato tipo 12.345 o 12.345,67 (CO): quitar puntos de miles, coma decimal
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) {
    const n = Number(t.replace(/\./g, "").replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  let n = Number(t.replace(",", "."));
  if (Number.isFinite(n)) return n;
  n = Number(t.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

function pickNumber(o: Record<string, unknown>, keys: readonly string[]): number | undefined {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
    if (typeof v === "bigint") return Number(v);
    if (typeof v === "string" && v.trim()) {
      const n = parseNumeroDesdeString(v);
      if (n !== undefined) return Math.trunc(n);
    }
  }
  return undefined;
}

function pushRecord(acc: Record<string, unknown>[], o: unknown) {
  if (o && typeof o === "object" && !Array.isArray(o)) acc.push(o as Record<string, unknown>);
}

const SUB_OBJETOS_CLIENTE = [
  "cliente",
  "afiliado",
  "socio",
  "miembro",
  "usuario",
  "clubDeMillas",
  "club_millas",
  "planMillas",
  "planDeMillas",
  "fidelizacion",
  "resumenSaldo",
  "saldoFidelizacion",
  "cuentaMillas",
  "programaMillas",
  "programaFidelizacion",
] as const;

/** Objetos candidatos: raíz, data/result/payload, cliente anidado, club de millas, etc. */
function flattenRegistrosWms(body: unknown): Record<string, unknown>[] {
  const raw = normalizarBodyJson(body);
  const root = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  const acc: Record<string, unknown>[] = [];
  if (!root) return acc;

  pushRecord(acc, root);
  for (const key of ["data", "result", "payload"] as const) {
    const inner = root[key];
    pushRecord(acc, inner);
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      const n = inner as Record<string, unknown>;
      for (const sub of SUB_OBJETOS_CLIENTE) {
        pushRecord(acc, n[sub]);
      }
    }
  }
  for (const sub of SUB_OBJETOS_CLIENTE) {
    pushRecord(acc, root[sub]);
  }

  // Varias rondas: saldo a veces viene en sub-objetos (p. ej. data.clubDeMillas.saldoMillas)
  for (let round = 0; round < 5; round++) {
    const len = acc.length;
    for (let i = 0; i < len; i++) {
      const o = acc[i]!;
      for (const sub of SUB_OBJETOS_CLIENTE) {
        pushRecord(acc, o[sub]);
      }
    }
    if (acc.length === len) break;
  }

  return acc;
}

const KEYS_NOMBRE = [
  "nombreCompleto",
  "nombreCliente",
  "nombre",
  "fullName",
  "razonSocial",
  "clienteNombre",
  "nombreAfiliado",
] as const;

const KEYS_MILLAS = [
  "millasAcumuladas",
  "millas",
  "millasTotales",
  "millasDisponibles",
  "totalMillas",
  "saldoMillas",
  "saldoEnMillas",
  "puntos",
  "puntosTotales",
  "totalPuntos",
  "puntosActuales",
  "puntosAcumulados",
  "puntosDisponibles",
  "saldoPuntos",
  "acumuladoPuntos",
  "puntosCliente",
  "puntosClub",
  "millasClub",
  "balanceMillas",
  "balancePuntos",
  "creditos",
  "creditosMillas",
  "valorPuntos",
  "cantidadMillas",
  "saldo",
  "saldoActual",
  "saldoFidelizacion",
  "acumulado",
  "puntosFidelizacion",
] as const;

const KEYS_DOC = ["documento", "numeroDocumento", "numeroIdentificacion", "cedula", "nit", "identificacion"] as const;

/** Solo ids del socio en club; no usar `id` genérico (puede ser id de venta/ticket). */
const KEYS_SOCIO_ID = ["socioId", "idSocio", "socio_id"] as const;

/**
 * Interpreta el JSON del WMS (estructuras habituales) y devuelve nombre / millas / documento si vienen en la respuesta.
 */
export function extraerResumenPlanMillasDesdeBodyWms(body: unknown, documentoConsulta: string): PlanMillasClienteResumen {
  const rows = flattenRegistrosWms(body);
  let nombre: string | undefined;
  let millas: number | undefined;
  let documento: string | undefined;
  let socioId: string | undefined;

  for (const o of rows) {
    if (!nombre) nombre = pickString(o, KEYS_NOMBRE);
    if (millas === undefined) millas = pickNumber(o, KEYS_MILLAS);
    if (!documento) documento = pickString(o, KEYS_DOC);
    if (!socioId) socioId = pickString(o, KEYS_SOCIO_ID);
  }

  const out: PlanMillasClienteResumen = {};
  if (nombre) out.nombre = nombre;
  if (millas !== undefined) out.millas = millas;
  if (socioId) out.socioId = socioId;
  if (documento) out.documento = documento;
  else if (documentoConsulta.trim()) out.documento = documentoConsulta.trim();

  return out;
}
