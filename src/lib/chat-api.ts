import type { ChatUsuario } from "@/types";

const WMS_URL = process.env.NEXT_PUBLIC_WMS_URL;

export interface ChatUsuariosResponse {
  ok: boolean;
  usuarios?: ChatUsuario[];
  message?: string;
}

/**
 * Obtiene la lista de contactos con los que el cajero puede chatear.
 * Backend WMS: GET /api/chat/usuarios con usuario POS devuelve solo
 * el franquiciado del mismo punto de venta + administradores del WMS.
 */
export async function getChatUsuarios(
  idToken: string
): Promise<ChatUsuariosResponse> {
  if (!WMS_URL) {
    return { ok: false, message: "NEXT_PUBLIC_WMS_URL no está configurada" };
  }

  const url = `${WMS_URL.replace(/\/$/, "")}/api/chat/usuarios`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return {
        ok: false,
        message: data?.message || data?.error || `Error ${res.status}`,
      };
    }

    return {
      ok: true,
      usuarios: Array.isArray(data.usuarios) ? data.usuarios : [],
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Error de conexión",
    };
  }
}
