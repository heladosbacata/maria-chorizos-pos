import type { BulkVentasPayload } from "@/types";
import { getWmsPublicBaseUrl } from "@/lib/wms-public-base";

export type EnvioEstado = "idle" | "enviando" | "exito" | "error";

export interface EnvioResultado {
  estado: EnvioEstado;
  mensaje?: string;
}

/** Errores típicos de `fetch` cuando no hay red, CORS, SSL o el servidor caído. */
export function esErrorRedVenta(mensaje: string | undefined): boolean {
  if (!mensaje) return false;
  const m = mensaje.toLowerCase();
  return (
    m.includes("failed to fetch") ||
    m.includes("fetch failed") ||
    m.includes("networkerror") ||
    m.includes("network request failed") ||
    m.includes("load failed") ||
    m.includes("connection refused") ||
    m.includes("aborted") ||
    m.includes("err_connection") ||
    m.includes("internet disconnected")
  );
}

export function mensajeErrorVentaParaUsuario(mensaje: string | undefined): string {
  if (esErrorRedVenta(mensaje)) {
    return [
      "La caja no pudo comunicarse con el sistema de la empresa (internet del local o sistema de oficina no disponible).",
      "",
      "Revisa el internet de la tienda. Si lo tienes y sigue igual, avisa a quien administra la tienda.",
    ].join("\n");
  }
  return mensaje?.trim() || "No se pudo completar el cobro. Vuelve a intentar o avisa a tu jefe.";
}

export async function enviarReporteVenta(
  payload: BulkVentasPayload
): Promise<EnvioResultado> {
  /** En el navegador: mismo origen del POS para evitar bloqueos CORS al WMS en otro dominio. */
  const url =
    typeof window !== "undefined"
      ? "/api/wms_ventas_bulk_guardar"
      : `${getWmsPublicBaseUrl()}/api/ventas/bulk-guardar`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Fase 2: Authorization: Bearer <ID_TOKEN>
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const mensaje =
        data?.message || data?.error || `Error ${res.status}: ${res.statusText}`;
      return { estado: "error", mensaje };
    }

    return {
      estado: "exito",
      mensaje: data?.message || "Reporte enviado correctamente",
    };
  } catch (err) {
    const mensaje =
      err instanceof Error ? err.message : "Error de conexión con el servidor";
    return { estado: "error", mensaje };
  }
}
