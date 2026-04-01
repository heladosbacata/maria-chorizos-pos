/**
 * Mensajes en vivo con administración: el navegador llama a rutas **del propio POS** (proxy server-side
 * al WMS) para evitar CORS y "Failed to fetch" al llamar directo a otro dominio.
 */
export type PosCajaMensajeCliente = {
  id: string;
  createdAtMs: number;
  direction: "admin_to_pos" | "pos_to_admin";
  read: boolean;
  text: string;
  senderUid: string;
};

const PATH_LISTAR = "/api/pos_caja_mensajes_listar";
const PATH_UNREAD = "/api/pos_caja_mensajes_unread";
const PATH_RESPONDER = "/api/pos_caja_mensajes_responder";
const PATH_MARCAR = "/api/pos_caja_mensajes_marcar_leido";

export async function wmsCajaMensajesListar(idToken: string): Promise<
  { ok: true; mensajes: PosCajaMensajeCliente[] } | { ok: false; error: string }
> {
  const t = idToken?.trim();
  if (!t) return { ok: false, error: "Sin sesión." };
  try {
    const res = await fetch(PATH_LISTAR, {
      method: "GET",
      cache: "no-store",
      headers: { Authorization: `Bearer ${t}`, Accept: "application/json" },
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      mensajes?: PosCajaMensajeCliente[];
      error?: string;
    };
    if (!res.ok || !data.ok || !Array.isArray(data.mensajes)) {
      return {
        ok: false,
        error: data.error || `Error ${res.status}`,
      };
    }
    return { ok: true, mensajes: data.mensajes };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Red" };
  }
}

export async function wmsCajaMensajesUnread(idToken: string): Promise<
  { ok: true; count: number } | { ok: false; error: string }
> {
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

export async function wmsCajaMensajesResponder(
  idToken: string,
  text: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const t = idToken?.trim();
  if (!t) return { ok: false, error: "Sin sesión." };
  try {
    const res = await fetch(PATH_RESPONDER, {
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

export async function wmsCajaMensajesMarcarLeido(idToken: string): Promise<void> {
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
      body: "{}",
    });
  } catch {
    /* ignore */
  }
}
