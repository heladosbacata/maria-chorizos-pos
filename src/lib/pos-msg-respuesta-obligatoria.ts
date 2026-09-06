/**
 * Respuesta obligatoria a mensajes admin WMS → caja.
 * El aviso se puede posponer 5 min, pero vuelve hasta que el cajero envíe una respuesta.
 */

export const POS_MSG_SNOOZE_MS = 5 * 60 * 1000;

export type PosMsgRespuestaEstado = {
  /** Último mensaje admin que activó la obligación (para no reabrir tras responder el mismo). */
  pendingAdminMsgId: string | null;
  snoozeUntilMs: number;
};

const STORAGE_CAJA = "pos_caja_msg_respuesta_v1";
const STORAGE_BROADCAST = "pos_broadcast_msg_respuesta_v1";

function leer(key: string): PosMsgRespuestaEstado {
  if (typeof window === "undefined") {
    return { pendingAdminMsgId: null, snoozeUntilMs: 0 };
  }
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return { pendingAdminMsgId: null, snoozeUntilMs: 0 };
    const parsed = JSON.parse(raw) as Partial<PosMsgRespuestaEstado>;
    return {
      pendingAdminMsgId:
        typeof parsed.pendingAdminMsgId === "string" && parsed.pendingAdminMsgId
          ? parsed.pendingAdminMsgId
          : null,
      snoozeUntilMs:
        typeof parsed.snoozeUntilMs === "number" && Number.isFinite(parsed.snoozeUntilMs)
          ? parsed.snoozeUntilMs
          : 0,
    };
  } catch {
    return { pendingAdminMsgId: null, snoozeUntilMs: 0 };
  }
}

function guardar(key: string, estado: PosMsgRespuestaEstado): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(key, JSON.stringify(estado));
  } catch {
    /* ignore quota */
  }
}

export function leerEstadoRespuestaCaja(): PosMsgRespuestaEstado {
  return leer(STORAGE_CAJA);
}

export function guardarEstadoRespuestaCaja(estado: PosMsgRespuestaEstado): void {
  guardar(STORAGE_CAJA, estado);
}

export function leerEstadoRespuestaBroadcast(): PosMsgRespuestaEstado {
  return leer(STORAGE_BROADCAST);
}

export function guardarEstadoRespuestaBroadcast(estado: PosMsgRespuestaEstado): void {
  guardar(STORAGE_BROADCAST, estado);
}

type MsgDir = { id: string; createdAtMs: number; direction: string };

/** Último mensaje del hilo; si es del admin, el cajero aún debe responder. */
export function ultimoMensajeAdminSinRespuesta<T extends MsgDir>(
  mensajes: T[],
  directionAdmin: string
): T | null {
  if (!mensajes.length) return null;
  let last: T | null = null;
  for (const m of mensajes) {
    if (!last || m.createdAtMs >= last.createdAtMs) last = m;
  }
  if (!last || last.direction !== directionAdmin) return null;
  return last;
}

export function estaEnSnooze(snoozeUntilMs: number, nowMs = Date.now()): boolean {
  return snoozeUntilMs > nowMs;
}

export function msRestantesSnooze(snoozeUntilMs: number, nowMs = Date.now()): number {
  return Math.max(0, snoozeUntilMs - nowMs);
}

export function formatCountdown(ms: number): string {
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

type BroadcastMsg = {
  id: string;
  createdAtMs: number;
  direction: string;
  senderUid: string;
  deleted?: boolean;
};

/**
 * Broadcast: el último mensaje de admin exige respuesta de ESTE punto
 * (otro local puede haber escrito; no cuenta como respuesta propia).
 */
export function ultimoAdminBroadcastSinRespuestaPropia<T extends BroadcastMsg>(
  mensajes: T[],
  currentUid: string | null | undefined
): T | null {
  const activos = mensajes.filter((m) => !m.deleted);
  let lastAdmin: T | null = null;
  for (const m of activos) {
    if (m.direction !== "admin") continue;
    if (!lastAdmin || m.createdAtMs >= lastAdmin.createdAtMs) lastAdmin = m;
  }
  if (!lastAdmin) return null;
  const uid = currentUid?.trim();
  if (!uid) return lastAdmin;
  const respondio = activos.some(
    (m) => m.direction === "pos" && m.senderUid === uid && m.createdAtMs > lastAdmin!.createdAtMs
  );
  return respondio ? null : lastAdmin;
}
