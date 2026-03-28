import type { ChatUsuario } from "@/types";
import { getWmsPublicBaseUrl } from "@/lib/wms-public-base";

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
  const url = `${getWmsPublicBaseUrl()}/api/chat/usuarios`;

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
