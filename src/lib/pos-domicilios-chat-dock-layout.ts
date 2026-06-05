import {
  clampPosicionDockChat,
  leerLimitesZonaDockChat,
  posicionInicialDockChat,
} from "@/lib/pos-chat-dock-layout";

const STORAGE_KEY = "pos-domicilios-chat-dock-pos-v1";

export function posicionInicialDockDomiciliosChat(anchoDock: number, altoDock: number): { x: number; y: number } {
  const { minX, maxY } = leerLimitesZonaDockChat(anchoDock, altoDock);
  return clampPosicionDockChat(minX + 8, maxY, anchoDock, altoDock);
}

export { clampPosicionDockChat as clampPosicionDockDomiciliosChat };

export function guardarPosicionDockDomiciliosChat(pos: { x: number; y: number }): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pos));
  } catch {
    /* ignore */
  }
}

export function cargarPosicionDockDomiciliosChat(): { x: number; y: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as { x?: unknown; y?: unknown };
    if (typeof p.x === "number" && typeof p.y === "number" && Number.isFinite(p.x) && Number.isFinite(p.y)) {
      return { x: p.x, y: p.y };
    }
  } catch {
    /* ignore */
  }
  return null;
}
