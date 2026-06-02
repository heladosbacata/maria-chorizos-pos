/**
 * PyG mensual del punto: lectura/escritura en WMS (Sheet + Firestore).
 */
import { getWmsPublicBaseUrl } from "@/lib/wms-public-base";
import type { PygGastosMensuales } from "@/lib/pyg-franquicia-storage";

export type PygGastosConFee = PygGastosMensuales & { feeMensual: number };

function base(): string {
  return getWmsPublicBaseUrl().replace(/\/$/, "");
}

export async function leerPygGastosWms(
  idToken: string,
  ym: string
): Promise<
  { ok: true; gastos: PygGastosMensuales; costoInsumos: number; feeMensual: number } | { ok: false; error: string }
> {
  try {
    const res = await fetch(`${base()}/api/pos/pyg-gastos?ym=${encodeURIComponent(ym)}`, {
      headers: { Authorization: `Bearer ${idToken}` },
      cache: "no-store",
    });
    const json = (await res.json()) as {
      ok?: boolean;
      gastos?: {
        arriendo?: number;
        personal?: number;
        servicios?: number;
        otros?: number;
        costoInsumos?: number;
        feeMensual?: number;
      };
      error?: string;
    };
    if (!json.ok || !json.gastos) {
      return { ok: false, error: json.error ?? "No se pudo leer PyG del WMS." };
    }
    const g = json.gastos;
    return {
      ok: true,
      gastos: {
        arriendo: Number(g.arriendo) || 0,
        personal: Number(g.personal) || 0,
        servicios: Number(g.servicios) || 0,
        otros: Number(g.otros) || 0,
      },
      costoInsumos: Number(g.costoInsumos) || 0,
      feeMensual: Number(g.feeMensual) || 100_000,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error de red." };
  }
}

export async function guardarPygGastosWms(
  idToken: string,
  ym: string,
  gastos: PygGastosConFee,
  puntoVenta: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${base()}/api/pos/pyg-gastos`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ym,
        puntoVenta,
        arriendo: gastos.arriendo,
        personal: gastos.personal,
        servicios: gastos.servicios,
        otros: gastos.otros,
        feeMensual: gastos.feeMensual,
      }),
    });
    const json = (await res.json()) as { ok?: boolean; error?: string };
    if (!json.ok) {
      return { ok: false, error: json.error ?? "No se pudo guardar PyG en el WMS." };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error de red." };
  }
}
