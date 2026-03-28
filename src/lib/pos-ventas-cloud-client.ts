import type { MediosPagoVentaGuardados } from "@/lib/medios-pago-venta";
import type { LineaVentaGuardada, VentaGuardadaLocal } from "@/lib/pos-ventas-local-storage";

/** Cuerpo para POST `/api/pos_venta_cloud` (copia de la venta en el navegador). */
export type PosVentaCloudBody = {
  ventaLocalId: string;
  fechaYmd: string;
  isoTimestamp: string;
  puntoVenta: string;
  total: number;
  lineas: LineaVentaGuardada[];
  turnoSesionId?: string;
  cajeroTurnoId?: string;
  cajeroNombre?: string;
  pagoResumen?: string;
  mediosPago?: MediosPagoVentaGuardados;
  /** `true` si el WMS aceptó el reporte; `false` si quedó solo POS / red. */
  wmsSincronizado: boolean;
};

export async function registrarVentaPosCloud(
  idToken: string,
  body: PosVentaCloudBody
): Promise<{ ok: boolean; message?: string }> {
  const r = await fetch("/api/pos_venta_cloud", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(body),
  });
  const data = (await r.json().catch(() => ({}))) as { ok?: boolean; message?: string };
  if (!r.ok || !data.ok) {
    return { ok: false, message: data.message ?? `Error ${r.status}` };
  }
  return { ok: true };
}

export async function listarVentasPosCloud(idToken: string): Promise<VentaGuardadaLocal[]> {
  const r = await fetch("/api/pos_ventas_cloud", {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const data = (await r.json().catch(() => ({}))) as {
    ok?: boolean;
    ventas?: unknown;
    message?: string;
  };
  if (!r.ok || !data.ok || !Array.isArray(data.ventas)) {
    throw new Error(data.message ?? `Error ${r.status}`);
  }
  return data.ventas as VentaGuardadaLocal[];
}
