import type { BulkVentasPayload } from "@/types";

const WMS_URL = process.env.NEXT_PUBLIC_WMS_URL;

export type EnvioEstado = "idle" | "enviando" | "exito" | "error";

export interface EnvioResultado {
  estado: EnvioEstado;
  mensaje?: string;
}

export async function enviarReporteVenta(
  payload: BulkVentasPayload
): Promise<EnvioResultado> {
  if (!WMS_URL) {
    return { estado: "error", mensaje: "NEXT_PUBLIC_WMS_URL no está configurada" };
  }

  const url = `${WMS_URL.replace(/\/$/, "")}/api/ventas/bulk-guardar`;

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
