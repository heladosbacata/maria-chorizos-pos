export interface InvitacionContadorItem {
  email: string;
  estado?: string;
  createdAt?: string;
}

export interface ContadorInvitacionesNormalizado {
  ok: boolean;
  cupoMax: number;
  usados: number;
  invitaciones: InvitacionContadorItem[];
  message?: string;
}

function num(v: unknown, fallback: number): number {
  if (typeof v === "number" && Number.isFinite(v) && v >= 0) return Math.floor(v);
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  }
  return fallback;
}

const ESTADOS_NO_OCUPAN_CUPO = new Set(["cancelada", "cancelled", "rechazada", "rejected", "expirada", "expired"]);

function invitacionOcupaCupo(i: InvitacionContadorItem): boolean {
  const e = (i.estado || "").toLowerCase().trim();
  if (!e) return true;
  return !ESTADOS_NO_OCUPAN_CUPO.has(e);
}

export function normalizarInvitacionesContador(data: Record<string, unknown>): ContadorInvitacionesNormalizado {
  const ok = data.ok !== false;
  const cupoMax = num(data.cupoMax, num(data.cupo, num(data.maxInvitaciones, 1))) || 1;

  const rawList = data.invitaciones ?? data.data ?? data.items;
  const invitaciones: InvitacionContadorItem[] = [];
  if (Array.isArray(rawList)) {
    for (const row of rawList) {
      if (!row || typeof row !== "object") continue;
      const o = row as Record<string, unknown>;
      const email = typeof o.email === "string" ? o.email.trim() : typeof o.correo === "string" ? o.correo.trim() : "";
      if (!email) continue;
      invitaciones.push({
        email,
        estado: typeof o.estado === "string" ? o.estado : typeof o.status === "string" ? o.status : undefined,
        createdAt:
          typeof o.createdAt === "string"
            ? o.createdAt
            : typeof o.fecha === "string"
              ? o.fecha
              : undefined,
      });
    }
  }

  let usados = num(data.usados, NaN);
  if (Number.isNaN(usados)) usados = num(data.activos, NaN);
  if (Number.isNaN(usados)) usados = num(data.slotsOcupados, NaN);
  if (Number.isNaN(usados)) {
    usados = invitaciones.filter(invitacionOcupaCupo).length;
  }

  const message = typeof data.message === "string" ? data.message : undefined;
  return {
    ok,
    cupoMax: Math.max(1, cupoMax),
    usados: Math.min(Math.max(0, usados), Math.max(1, cupoMax)),
    invitaciones,
    message,
  };
}

export async function getContadorInvitaciones(idToken?: string | null): Promise<ContadorInvitacionesNormalizado> {
  const headers: HeadersInit = {};
  if (idToken) headers.Authorization = `Bearer ${idToken}`;
  try {
    const res = await fetch("/api/pos_contador", { headers });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return {
        ok: false,
        cupoMax: 1,
        usados: 0,
        invitaciones: [],
        message: (data.message as string) || (data.error as string) || `Error ${res.status}`,
      };
    }
    const n = normalizarInvitacionesContador(data);
    if (data.ok === false) {
      return { ...n, ok: false, message: n.message || (data.message as string) || "No se pudo cargar invitaciones." };
    }
    return n;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error de red";
    return { ok: false, cupoMax: 1, usados: 0, invitaciones: [], message: msg };
  }
}

export async function postInvitarContador(
  email: string,
  idToken?: string | null
): Promise<{ ok: boolean; message?: string }> {
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (idToken) headers.Authorization = `Bearer ${idToken}`;
  try {
    const res = await fetch("/api/pos_contador", {
      method: "POST",
      headers,
      body: JSON.stringify({ email: email.trim() }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return {
        ok: false,
        message: (data.message as string) || (data.error as string) || `Error ${res.status}`,
      };
    }
    if (data.ok === false) {
      return { ok: false, message: (data.message as string) || "No se pudo enviar la invitación." };
    }
    return { ok: true, message: typeof data.message === "string" ? data.message : undefined };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Error de red" };
  }
}
