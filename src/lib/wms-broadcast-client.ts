/**
 * Chat grupal temporal WMS ↔ todos los POS (proxy en /pages/api/pos_broadcast_*).
 */

export type PosBroadcastMensajeCliente = {
  id: string;
  sessionId: string;
  createdAtMs: number;
  direction: "admin" | "pos";
  text: string;
  senderUid: string;
  deleted: boolean;
  puntoEtiqueta?: string;
};

export type PosBroadcastSesionCliente = { id: string; titulo: string; createdAtMs: number };

const PATH_ESTADO = "/api/pos_broadcast_estado";
const PATH_MENSAJES = "/api/pos_broadcast_mensajes";
const PATH_UNREAD = "/api/pos_broadcast_unread";
const PATH_MARCAR = "/api/pos_broadcast_marcar_leido";
const PATH_ENVIAR = "/api/pos_broadcast_enviar";

export async function wmsBroadcastEstado(
  idToken: string
): Promise<{ ok: true; sesion: PosBroadcastSesionCliente | null } | { ok: false; error: string }> {
  const t = idToken?.trim();
  if (!t) return { ok: false, error: "Sin sesión." };
  try {
    const res = await fetch(PATH_ESTADO, {
      method: "GET",
      cache: "no-store",
      headers: { Authorization: `Bearer ${t}`, Accept: "application/json" },
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      sesion?: PosBroadcastSesionCliente | null;
      error?: string;
    };
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || `Error ${res.status}` };
    }
    return { ok: true, sesion: data.sesion ?? null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Red" };
  }
}

export async function wmsBroadcastMensajes(
  idToken: string
): Promise<
  { ok: true; sessionId: string | null; mensajes: PosBroadcastMensajeCliente[] } | { ok: false; error: string }
> {
  const t = idToken?.trim();
  if (!t) return { ok: false, error: "Sin sesión." };
  try {
    const res = await fetch(PATH_MENSAJES, {
      method: "GET",
      cache: "no-store",
      headers: { Authorization: `Bearer ${t}`, Accept: "application/json" },
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      sessionId?: string | null;
      mensajes?: PosBroadcastMensajeCliente[];
      error?: string;
    };
    if (!res.ok || !data.ok || !Array.isArray(data.mensajes)) {
      return { ok: false, error: data.error || `Error ${res.status}` };
    }
    return { ok: true, sessionId: data.sessionId ?? null, mensajes: data.mensajes };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Red" };
  }
}

export async function wmsBroadcastUnread(
  idToken: string
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const t = idToken?.trim();
  if (!t) return { ok: false, error: "Sin sesión." };
  try {
    const res = await fetch(PATH_UNREAD, {
      method: "GET",
      cache: "no-store",
      headers: { Authorization: `Bearer ${t}`, Accept: "application/json" },
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; count?: number; error?: string };
    if (!res.ok || !data.ok || typeof data.count !== "number") {
      return { ok: false, error: data.error || `Error ${res.status}` };
    }
    return { ok: true, count: data.count };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Red" };
  }
}

export async function wmsBroadcastMarcarLeido(
  idToken: string,
  opts?: { sessionId?: string; lastSeenAtMs?: number }
): Promise<void> {
  const t = idToken?.trim();
  if (!t) return;
  try {
    await fetch(PATH_MARCAR, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${t}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(opts ?? {}),
    });
  } catch {
    /* ignore */
  }
}

export async function wmsBroadcastEnviar(
  idToken: string,
  text: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const t = idToken?.trim();
  if (!t) return { ok: false, error: "Sin sesión." };
  try {
    const res = await fetch(PATH_ENVIAR, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${t}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ text }),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || `Error ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Red" };
  }
}
