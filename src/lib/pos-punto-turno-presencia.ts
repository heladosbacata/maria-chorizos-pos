import { puntoVentaFirestoreClave } from "@/lib/pos-domicilios-pv-clave";
import { consultarTurnoCajaAbiertoWms } from "@/lib/wms-punto-turno-abierto";

/** Firestore: presencia de turno abierto vista por `/pedidos` (independiente del WMS). */
export const COL_PUNTO_TURNO_PRESENCIA = "pos_punto_turno_presencia";

/** Si el heartbeat es más viejo que esto, el punto se considera cerrado. */
export const PRESENCIA_TURNO_STALE_MS = 90_000;

/** Intervalo de heartbeat desde la caja. */
export const PRESENCIA_TURNO_HEARTBEAT_MS = 25_000;

export function docIdPresenciaTurno(puntoVenta: string): string {
  return puntoVentaFirestoreClave(puntoVenta) || "sin_pv";
}

export function presenciaTurnoVigente(updatedAtMs: number, nowMs = Date.now()): boolean {
  if (!Number.isFinite(updatedAtMs) || updatedAtMs <= 0) return false;
  return nowMs - updatedAtMs <= PRESENCIA_TURNO_STALE_MS;
}

/** Cliente: publica o limpia la presencia del punto (requiere sesión). */
export async function publicarPresenciaTurnoCaja(opts: {
  token: string;
  puntoVenta: string;
  abierto: boolean;
  turnoSesionId?: string;
}): Promise<{ ok: boolean; message?: string }> {
  const token = opts.token.trim();
  const puntoVenta = opts.puntoVenta.trim();
  if (!token || !puntoVenta) return { ok: false, message: "Falta token o punto de venta." };
  try {
    const res = await fetch("/api/pos_punto_turno_presencia", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        puntoVenta,
        abierto: opts.abierto === true,
        ...(opts.turnoSesionId?.trim() ? { turnoSesionId: opts.turnoSesionId.trim() } : {}),
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
    if (!res.ok || json.ok !== true) {
      return {
        ok: false,
        message: typeof json.message === "string" ? json.message : `Error ${res.status}`,
      };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Error de red" };
  }
}

/** Cliente: ¿el punto tiene turno abierto según presencia POS o WMS? */
export async function consultarTurnoCajaAbierto(puntoVenta: string): Promise<boolean> {
  const pv = puntoVenta.trim();
  if (!pv) return false;

  try {
    const res = await fetch(
      `/api/pos_punto_turno_abierto?${new URLSearchParams({ puntoVenta: pv }).toString()}`,
      { method: "GET", cache: "no-store" }
    );
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; abierto?: boolean };
    if (res.ok && json.ok === true && json.abierto === true) return true;
  } catch {
    /* seguir con WMS */
  }

  try {
    return await consultarTurnoCajaAbiertoWms(pv);
  } catch {
    return false;
  }
}
