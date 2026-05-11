/**
 * Resumen opcional que el WMS puede devolver al validar documento (plan de millas).
 */
export type PlanMillasClienteResumen = {
  nombre?: string;
  millas?: number;
  documento?: string;
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

function pickNumber(o: Record<string, unknown>, keys: readonly string[]): number | undefined {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
    if (typeof v === "string" && v.trim()) {
      const n = Number(v.replace(/\s/g, "").replace(",", "."));
      if (Number.isFinite(n)) return Math.trunc(n);
    }
  }
  return undefined;
}

function pushRecord(acc: Record<string, unknown>[], o: unknown) {
  if (o && typeof o === "object" && !Array.isArray(o)) acc.push(o as Record<string, unknown>);
}

/** Objetos candidatos: raíz, data/result/payload, cliente anidado, etc. */
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
      for (const sub of ["cliente", "afiliado", "socio", "miembro", "usuario"] as const) {
        pushRecord(acc, n[sub]);
      }
    }
  }
  for (const sub of ["cliente", "afiliado", "socio", "miembro", "usuario"] as const) {
    pushRecord(acc, root[sub]);
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
  "millas",
  "saldoMillas",
  "puntos",
  "saldoPuntos",
  "puntosDisponibles",
  "puntosAcumulados",
  "balanceMillas",
  "totalMillas",
] as const;

const KEYS_DOC = ["documento", "numeroDocumento", "numeroIdentificacion", "cedula", "nit", "identificacion"] as const;

/**
 * Interpreta el JSON del WMS (estructuras habituales) y devuelve nombre / millas / documento si vienen en la respuesta.
 */
export function extraerResumenPlanMillasDesdeBodyWms(body: unknown, documentoConsulta: string): PlanMillasClienteResumen {
  const rows = flattenRegistrosWms(body);
  let nombre: string | undefined;
  let millas: number | undefined;
  let documento: string | undefined;

  for (const o of rows) {
    if (!nombre) nombre = pickString(o, KEYS_NOMBRE);
    if (millas === undefined) millas = pickNumber(o, KEYS_MILLAS);
    if (!documento) documento = pickString(o, KEYS_DOC);
  }

  const out: PlanMillasClienteResumen = {};
  if (nombre) out.nombre = nombre;
  if (millas !== undefined) out.millas = millas;
  if (documento) out.documento = documento;
  else if (documentoConsulta.trim()) out.documento = documentoConsulta.trim();

  return out;
}
