/**
 * Mensajes en vivo con administración (WMS) — mismas rutas CORS que turnos POS.
 */
import { getWmsPublicBaseUrl } from "@/lib/wms-public-base";

function baseRoot(): string {
  return getWmsPublicBaseUrl().replace(/\/$/, "");
}

export type PosCajaMensajeCliente = {
  id: string;
  createdAtMs: number;
  direction: "admin_to_pos" | "pos_to_admin";
  read: boolean;
  text: string;
  senderUid: string;
};

export async function wmsCajaMensajesListar(idToken: string): Promise<
  { ok: true; mensajes: PosCajaMensajeCliente[] } | { ok: false; error: string }
> {
  const t = idToken?.trim();
  if (!t) return { ok: false, error: "Sin sesión." };
  try {
    const res = await fetch(`${baseRoot()}/api/pos/caja-mensajes/listar`, {
      method: "GET",
      mode: "cors",
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
    const res = await fetch(`${baseRoot()}/api/pos/caja-mensajes/unread`, {
      method: "GET",
      mode: "cors",
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
    const res = await fetch(`${baseRoot()}/api/pos/caja-mensajes/responder`, {
      method: "POST",
      mode: "cors",
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
    await fetch(`${baseRoot()}/api/pos/caja-mensajes/marcar-leido`, {
      method: "POST",
      mode: "cors",
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
