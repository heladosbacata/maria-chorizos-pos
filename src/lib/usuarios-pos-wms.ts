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

function valorAFechaIso(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "object" && v !== null && "_seconds" in v && typeof (v as { _seconds: unknown })._seconds === "number") {
    const d = new Date((v as { _seconds: number })._seconds * 1000);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const s = typeof v === "string" ? v : String(v);
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
  const contrato =
    str(o, [
      "contratoNombre",
      "contrato",
      "tipoContrato",
      "planContrato",
      "nombreContrato",
    ]) || "Contrato POS GEB";
  const fechaInicio = fechaIso(o, [
    "fechaInicio",
    "contratoFechaInicio",
    "fecha_inicio",
    "inicioContrato",
    "contractStartDate",
    "fechaInicioContrato",
    "inicio",
  ]);
  const fechaVencimiento = fechaIso(o, [
    "fechaVencimiento",
    "contratoFechaVencimiento",
    "fecha_vencimiento",
    "vencimiento",
    "contractEndDate",
    "fechaFinContrato",
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

/** Coincide correo de sesión con una fila de la lista WMS (sin distinguir mayúsculas). */
export function buscarUsuarioPosRegistradoPorCorreo(
  usuarios: UsuarioPosRegistrado[],
  correoSesion: string | null | undefined
): UsuarioPosRegistrado | null {
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
  idToken?: string | null
): Promise<{ ok: boolean; usuario: UsuarioPosRegistrado | null; message?: string }> {
  const res = await getUsuariosPosRegistrados(idToken);
  if (!res.ok) {
    return { ok: false, usuario: null, message: res.message };
  }
  const usuario = buscarUsuarioPosRegistradoPorCorreo(res.usuarios ?? [], correoSesion);
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

    const rawList =
      data?.usuarios ??
      data?.data ??
      data?.items ??
      (Array.isArray(data) ? data : []);

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
