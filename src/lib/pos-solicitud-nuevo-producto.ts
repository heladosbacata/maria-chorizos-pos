import type { SolicitarNuevoProductoRequest, SolicitarNuevoProductoResponse } from "@/types";
import { getWmsPublicBaseUrl } from "@/lib/wms-public-base";

function errorLegible(data: unknown, status: number): string {
  if (data && typeof data === "object") {
    const o = data as { message?: unknown; error?: unknown };
    if (typeof o.message === "string" && o.message.trim()) return o.message;
    if (typeof o.error === "string" && o.error.trim()) return o.error;
  }
  if (status === 404) {
    return "El endpoint de solicitud de nuevos productos no está habilitado en WMS.";
  }
  return `No se pudo enviar la solicitud (HTTP ${status}).`;
}

export async function solicitarNuevoProductoPos(
  payload: SolicitarNuevoProductoRequest,
  idToken: string
): Promise<SolicitarNuevoProductoResponse> {
  if (!idToken.trim()) return { ok: false, message: "Tu sesión expiró. Inicia sesión nuevamente." };
  if (!payload.nombreProducto.trim()) return { ok: false, message: "El nombre del producto es obligatorio." };
  if (!payload.categoria.trim()) return { ok: false, message: "La categoría es obligatoria." };
  if (!payload.unidad.trim()) return { ok: false, message: "La unidad es obligatoria." };
  if (!payload.descripcion.trim()) return { ok: false, message: "La descripción es obligatoria." };
  if (!payload.justificacion.trim()) return { ok: false, message: "La justificación es obligatoria." };
  if (!Number.isFinite(payload.precioSugerido) || payload.precioSugerido <= 0) {
    return { ok: false, message: "El precio sugerido debe ser mayor a cero." };
  }

  const url = `${getWmsPublicBaseUrl()}/api/pos/productos/solicitar-creacion`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(payload),
    });
    const data = (await res.json().catch(() => null)) as unknown;
    if (!res.ok) return { ok: false, message: errorLegible(data, res.status) };
    if (!data || typeof data !== "object") {
      return { ok: false, message: "Respuesta inválida al solicitar creación de producto." };
    }
    const d = data as { ok?: unknown; idSolicitud?: unknown; message?: unknown };
    return {
      ok: d.ok === true,
      idSolicitud: typeof d.idSolicitud === "string" ? d.idSolicitud : undefined,
      message:
        typeof d.message === "string"
          ? d.message
          : d.ok === true
            ? "Solicitud enviada correctamente."
            : "No se pudo enviar la solicitud.",
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Error de red al enviar la solicitud.",
    };
  }
}
