import { auth } from "@/lib/firebase";

export type ReenviarBienvenidaClubMillasResult =
  | {
      ok: true;
      correoEnviado: boolean;
      wmsSincronizado: boolean;
      correoError?: string;
      wmsError?: string;
    }
  | { ok: false; message: string };

export function emailValidoParaClubMillas(email: string | undefined): boolean {
  const e = (email ?? "").trim().toLowerCase();
  return Boolean(e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
}

export async function reenviarBienvenidaClubMillasCliente(
  clienteId: string
): Promise<ReenviarBienvenidaClubMillasResult> {
  const id = clienteId.trim();
  if (!id) return { ok: false, message: "Cliente no válido." };
  if (!auth?.currentUser) {
    return { ok: false, message: "Iniciá sesión de nuevo para enviar el correo." };
  }

  try {
    const token = await auth.currentUser.getIdToken();
    const res = await fetch("/api/pos_cliente_reenviar_bienvenida_club_millas", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ clienteId: id }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      message?: string;
      correoEnviado?: boolean;
      wmsSincronizado?: boolean;
      correoError?: string;
      wmsError?: string;
    };
    if (!res.ok || !data.ok) {
      return {
        ok: false,
        message: data.message ?? "No se pudo reenviar la clave del plan de millas.",
      };
    }
    return {
      ok: true,
      correoEnviado: Boolean(data.correoEnviado),
      wmsSincronizado: Boolean(data.wmsSincronizado),
      ...(data.correoError ? { correoError: data.correoError } : {}),
      ...(data.wmsError ? { wmsError: data.wmsError } : {}),
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Error de red al enviar el correo.",
    };
  }
}
