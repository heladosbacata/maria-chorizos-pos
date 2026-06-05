import { getWmsPublicBaseUrl } from "@/lib/wms-public-base";

/** Consulta al WMS si el punto tiene turno de caja abierto (pos_turno_activo). */
export async function consultarTurnoCajaAbiertoWms(puntoVenta: string): Promise<boolean> {
  const pv = puntoVenta.trim();
  if (!pv) return false;
  const base = getWmsPublicBaseUrl().replace(/\/$/, "");
  const url = `${base}/api/public/punto-turno-abierto?${new URLSearchParams({ puntoVenta: pv })}`;
  const res = await fetch(url, { method: "GET", cache: "no-store" });
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; abierto?: boolean };
  if (!res.ok || !json.ok) return false;
  return json.abierto === true;
}
