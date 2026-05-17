import type { SolicitarCambioPrecioRequest, SolicitarCambioPrecioResponse } from "@/types";
import { getWmsPublicBaseUrl } from "@/lib/wms-public-base";

function normalizarMensajeError(data: unknown, status: number): string {
  if (data && typeof data === "object") {
    const maybe = data as { message?: unknown; error?: unknown };
    if (typeof maybe.message === "string" && maybe.message.trim()) return maybe.message;
    if (typeof maybe.error === "string" && maybe.error.trim()) return maybe.error;
  }
  return `No se pudo enviar la solicitud (HTTP ${status}).`;
}

export async function solicitarCambioPrecioProductoPos(
  payload: SolicitarCambioPrecioRequest,
  idToken: string
): Promise<SolicitarCambioPrecioResponse> {
  const skuBarcode = payload.skuBarcode.trim();
  const motivo = payload.motivo.trim();
  const precioSolicitado = Number(payload.precioSolicitado);
  const descripcion = payload.descripcion?.trim();

  if (!idToken.trim()) return { ok: false, message: "Tu sesión expiró. Inicia sesión nuevamente." };
  if (!skuBarcode) return { ok: false, message: "SKU inválido para la solicitud." };
  if (!Number.isFinite(precioSolicitado) || precioSolicitado <= 0) {
    return { ok: false, message: "El precio solicitado debe ser mayor a cero." };
  }
  if (!motivo) return { ok: false, message: "El motivo es obligatorio." };

  const url = `${getWmsPublicBaseUrl()}/api/pos/productos/solicitar-cambio-precio`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        skuBarcode,
        precioSolicitado,
        motivo,
        ...(descripcion ? { descripcion } : {}),
      } satisfies SolicitarCambioPrecioRequest),
    });
    const data = (await res.json().catch(() => null)) as unknown;
    if (!res.ok) return { ok: false, message: normalizarMensajeError(data, res.status) };
    if (!data || typeof data !== "object") {
      return { ok: false, message: "Respuesta inválida al solicitar cambio de precio." };
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
