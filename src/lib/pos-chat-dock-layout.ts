/** Zona segura del dock de chats: fuera del sidebar izquierdo y del panel «Cuenta a cobrar». */

const STORAGE_KEY = "pos-chat-dock-pos-v1";
const MARGEN = 12;

export type LimitesDockChat = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

export function leerLimitesZonaDockChat(
  anchoDock: number,
  altoDock: number
): LimitesDockChat {
  if (typeof window === "undefined") {
    return { minX: MARGEN, maxX: MARGEN, minY: MARGEN, maxY: MARGEN };
  }

  let minX = MARGEN;
  let maxX = Math.max(minX, window.innerWidth - anchoDock - MARGEN);
  const minY = MARGEN;
  const maxY = Math.max(minY, window.innerHeight - altoDock - MARGEN);

  const sidebar = document.querySelector('[data-pos-tutorial="sidebar"]');
  if (sidebar) {
    const r = sidebar.getBoundingClientRect();
    if (r.width > 8 && r.height > 8) {
      minX = Math.max(minX, Math.round(r.right + MARGEN));
    }
  }

  const cuenta = document.querySelector('[data-pos-tutorial="cuenta-cobrar"]');
  const panelDerecho =
    cuenta &&
    window.matchMedia("(min-width: 1024px)").matches &&
    !cuenta.classList.contains("hidden");
  if (panelDerecho) {
    const r = cuenta.getBoundingClientRect();
    if (r.width > 80 && r.left > window.innerWidth * 0.45) {
      maxX = Math.min(maxX, Math.round(r.left - anchoDock - MARGEN));
    }
  }

  if (maxX < minX) maxX = minX;

  return { minX, maxX, minY, maxY };
}

export function clampPosicionDockChat(
  x: number,
  y: number,
  anchoDock: number,
  altoDock: number
): { x: number; y: number } {
  const { minX, maxX, minY, maxY } = leerLimitesZonaDockChat(anchoDock, altoDock);
  return {
    x: Math.min(Math.max(minX, x), maxX),
    y: Math.min(Math.max(minY, y), maxY),
  };
}

/** Esquina inferior de la franja central (no tapa catálogo ni cuenta). */
export function posicionInicialDockChat(anchoDock: number, altoDock: number): { x: number; y: number } {
  const { minX, maxX, minY, maxY } = leerLimitesZonaDockChat(anchoDock, altoDock);
  const x = Math.max(minX, maxX - 8);
  const y = maxY;
  return clampPosicionDockChat(x, y, anchoDock, altoDock);
}

export function guardarPosicionDockChat(pos: { x: number; y: number }): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pos));
  } catch {
    /* ignore */
  }
}

export function cargarPosicionDockChat(): { x: number; y: number } | null {
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
