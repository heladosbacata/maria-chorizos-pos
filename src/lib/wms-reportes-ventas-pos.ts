import { getWmsPublicBaseUrl } from "@/lib/wms-public-base";

export type WmsVentaDiaPos = {
  fecha: string;
  totalVentas: number;
  totalComprobantes: number;
};

export type WmsReporteVentasPos = {
  ok: true;
  puntoVenta: string;
  desde: string;
  hasta: string;
  resumen: {
    totalComprobantes: number;
    totalVentas: number;
    diasConsultados?: number;
    diasConResumen?: number;
    diasSinResumen?: number;
    fuente?: "pos_ventas_resumen_diario";
    detalleLimitadoPorCostos?: boolean;
  };
  ventasPorDia: WmsVentaDiaPos[];
  fuente?: "pos_ventas_resumen_diario";
  detalleLimitadoPorCostos?: boolean;
};

export async function listarReporteVentasPosWms(
  idToken: string,
  filtros: { desde: string; hasta: string }
): Promise<WmsReporteVentasPos> {
  const t = idToken.trim();
  if (!t) throw new Error("Sin sesión para consultar ventas en WMS.");

  const base = getWmsPublicBaseUrl().replace(/\/$/, "");
  const qs = new URLSearchParams({ desde: filtros.desde, hasta: filtros.hasta });
  const res = await fetch(`${base}/api/pos/reportes-ventas?${qs.toString()}`, {
    method: "GET",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${t}`,
      Accept: "application/json",
    },
  });

  const data = (await res.json().catch(() => ({}))) as Partial<WmsReporteVentasPos> & {
    ok?: boolean;
    error?: string;
  };
  if (!res.ok || data.ok !== true || !Array.isArray(data.ventasPorDia)) {
    throw new Error(data.error ?? `No se pudo consultar ventas WMS (${res.status}).`);
  }
  return data as WmsReporteVentasPos;
}
