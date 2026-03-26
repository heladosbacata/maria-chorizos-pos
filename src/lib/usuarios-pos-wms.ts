export interface UsuarioPosRegistrado {
  email: string;
  /** UID Firebase del cajero (si el WMS lo envía) */
  uid?: string;
  puntoVenta: string;
  contrato: string;
  fechaInicio: string | null;
  fechaVencimiento: string | null;
  /** Si el WMS envía referencia de contrato */
  referenciaContrato?: string;
  /** Días restantes calculados en el WMS (opcional; si falta, se deriva de la fecha de vencimiento) */
  diasRestantes?: number | null;
  /** Campos extra del WMS (detalle) */
  raw?: Record<string, unknown>;
}

export interface UsuariosPosListarResult {
  ok: boolean;
  usuarios?: UsuarioPosRegistrado[];
  message?: string;
}

function str(obj: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return "";
}

function secondsFromFirestoreLike(v: unknown): number | null {
  if (v == null || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const raw = o.seconds ?? o._seconds;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function valorAFechaIso(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) {
    const ms = v < 1e12 ? v * 1000 : v;
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const sec = secondsFromFirestoreLike(v);
  if (sec != null) {
    const d = new Date(sec * 1000);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const s = typeof v === "string" ? v.trim() : String(v).trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    const year = Number(m[3]);
    const d = new Date(year, month - 1, day);
    if (!Number.isNaN(d.getTime()) && d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day) {
      const mm = String(month).padStart(2, "0");
      const dd = String(day).padStart(2, "0");
      return `${year}-${mm}-${dd}`;
    }
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function fechaIso(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const iso = valorAFechaIso(obj[k]);
    if (iso) return iso;
  }
  return null;
}

const NESTED_CONTRATO_KEYS = [
  "contrato",
  "contratoPos",
  "datosContrato",
  "contract",
  "contratoGeb",
  "metadata",
  "perfil",
  "perfilPos",
  "posUsuario",
  "datosUsuario",
];

/** Busca fechas en el objeto y en subobjetos típicos del WMS/Firestore. */
function fechaIsoConAnidados(obj: Record<string, unknown>, keys: string[]): string | null {
  const direct = fechaIso(obj, keys);
  if (direct) return direct;
  for (const nk of NESTED_CONTRATO_KEYS) {
    const inner = obj[nk];
    if (inner && typeof inner === "object" && inner !== null) {
      const nested = fechaIso(inner as Record<string, unknown>, keys);
      if (nested) return nested;
    }
  }
  return null;
}

function numEntero(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
    if (typeof v === "string" && v.trim() !== "") {
      const n = Number(v);
      if (Number.isFinite(n)) return Math.trunc(n);
    }
  }
  return null;
}

export function normalizarUsuarioPosRegistrado(item: unknown): UsuarioPosRegistrado | null {
  if (!item || typeof item !== "object") return null;
  const o = item as Record<string, unknown>;
  const email = str(o, ["email", "correo", "correoElectronico", "mail"]);
  if (!email) return null;
  const uid = str(o, ["uid", "userId", "firebaseUid"]);
  const puntoVenta = str(o, ["puntoVenta", "punto_venta", "puntoDeVenta", "nombrePuntoVenta"]) || "Sin punto";
  let contrato =
    str(o, [
      "contratoNombre",
      "tipoContrato",
      "planContrato",
      "nombreContrato",
    ]) || "";
  if (!contrato) {
    const c = o.contrato;
    if (typeof c === "string" && c.trim()) contrato = c.trim();
    else if (c && typeof c === "object") {
      const co = c as Record<string, unknown>;
      contrato =
        str(co, ["nombre", "nombreContrato", "plan", "descripcion", "tipo", "label"]) || "";
    }
  }
  if (!contrato) contrato = "Contrato POS GEB";
  const fechaInicio = fechaIsoConAnidados(o, [
    "fechaInicio",
    "contratoFechaInicio",
    "fecha_inicio",
    "inicioContrato",
    "contractStartDate",
    "fechaInicioContrato",
    "fechaContratoInicio",
    "inicio",
    "fechaAltaContrato",
    "fechaCreacionContrato",
    "createdAtContrato",
  ]);
  const fechaVencimiento = fechaIsoConAnidados(o, [
    "fechaVencimiento",
    "contratoFechaVencimiento",
    "fecha_vencimiento",
    "vencimiento",
    "contractEndDate",
    "fechaFinContrato",
    "fechaContratoVencimiento",
    "fin",
  ]);
  const referenciaContrato = str(o, [
    "referenciaContrato",
    "referencia",
    "numeroContrato",
    "noContrato",
    "codigoContrato",
    "refContrato",
  ]);
  const diasRestantes = numEntero(o, ["diasRestantes", "dias_restantes", "diasRestante"]);
  const out: UsuarioPosRegistrado = {
    email,
    puntoVenta,
    contrato,
    fechaInicio,
    fechaVencimiento,
    ...(uid ? { uid } : {}),
    ...(referenciaContrato ? { referenciaContrato } : {}),
    ...(diasRestantes != null ? { diasRestantes } : {}),
    raw: o,
  };
  return out;
}

/** Coincide por UID Firebase (si el WMS lo envía) o por correo de sesión (sin distinguir mayúsculas). */
export function buscarUsuarioPosRegistradoPorCorreo(
  usuarios: UsuarioPosRegistrado[],
  correoSesion: string | null | undefined,
  uidSesion?: string | null
): UsuarioPosRegistrado | null {
  if (uidSesion?.trim()) {
    const uid = uidSesion.trim();
    const byUid = usuarios.find((x) => x.uid && x.uid.trim() === uid);
    if (byUid) return byUid;
  }
  if (!correoSesion?.trim()) return null;
  const n = correoSesion.trim().toLowerCase();
  const u = usuarios.find((x) => x.email.trim().toLowerCase() === n);
  return u ?? null;
}

/**
 * Obtiene la fila del cajero actual en el WMS (misma fuente que la tabla «Usuarios POS registrados»).
 * Las fechas de contrato deben venir en esa fila (fechaInicio / fechaVencimiento o contratoFechaInicio /
 * contratoFechaVencimiento ISO, u otros alias en normalizarUsuarioPosRegistrado).
 */
export async function getContratoPosDesdeWmsPorCorreoSesion(
  correoSesion: string | null | undefined,
  idToken?: string | null,
  uidSesion?: string | null
): Promise<{ ok: boolean; usuario: UsuarioPosRegistrado | null; message?: string }> {
  const res = await getUsuariosPosRegistrados(idToken);
  if (!res.ok) {
    return { ok: false, usuario: null, message: res.message };
  }
  const usuario = buscarUsuarioPosRegistradoPorCorreo(
    res.usuarios ?? [],
    correoSesion,
    uidSesion
  );
  return { ok: true, usuario };
}

export async function getUsuariosPosRegistrados(idToken?: string | null): Promise<UsuariosPosListarResult> {
  const headers: HeadersInit = {};
  if (idToken) headers.Authorization = `Bearer ${idToken}`;

  try {
    const res = await fetch("/api/usuarios_pos_listar", { headers });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return { ok: false, message: data?.message || data?.error || `Error ${res.status}` };
    }

    if (data && data.ok === false) {
      return { ok: false, message: data.message ?? "No se pudo cargar la lista de usuarios." };
    }

    let rawList: unknown[] = [];
    const d = data as Record<string, unknown> | null | undefined;
    if (Array.isArray(d?.usuarios)) rawList = d.usuarios as unknown[];
    else if (Array.isArray(d?.items)) rawList = d.items as unknown[];
    else if (Array.isArray(d?.data)) rawList = d.data as unknown[];
    else if (Array.isArray(data)) rawList = data as unknown[];

    if (rawList.length === 0) {
      const one =
        d?.usuario ??
        d?.user ??
        d?.cajero ??
        d?.perfil ??
        d?.posUsuario ??
        (d?.data && typeof d.data === "object" && !Array.isArray(d.data) ? d.data : null);
      if (one && typeof one === "object" && !Array.isArray(one)) rawList = [one];
    }

    const usuarios: UsuarioPosRegistrado[] = [];
    for (const row of rawList) {
      const u = normalizarUsuarioPosRegistrado(row);
      if (u) usuarios.push(u);
    }

    return { ok: true, usuarios };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error de red";
    return { ok: false, message: msg };
  }
}

export function formatearFechaTabla(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso + "T12:00:00");
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
}

export function diasRestantesContrato(isoVencimiento: string | null): string {
  if (!isoVencimiento) return "—";
  const end = new Date(isoVencimiento + "T12:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  const diff = Math.ceil((end.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return "Vencido";
  return `${diff} días`;
}

/** Prioriza diasRestantes del WMS si viene informado; si no, calcula desde fecha de vencimiento. */
export function formatearDiasRestantesTabla(u: UsuarioPosRegistrado): string {
  if (u.diasRestantes != null && Number.isFinite(u.diasRestantes)) {
    if (u.diasRestantes < 0) return "Vencido";
    return `${u.diasRestantes} días`;
  }
  return diasRestantesContrato(u.fechaVencimiento);
}
