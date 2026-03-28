/** Foto del cajero en sidebar (data URL en localStorage) */
export const POS_CAJERO_FOTO_STORAGE_KEY = "pos-cajero-foto";

/** JSON con datos del formulario «Perfil del cajero» (sesión o cajero genérico) */
export const POS_CAJERO_FICHA_STORAGE_KEY = "pos-cajero-ficha-v1";

const CAJERO_TURNO_FOTO_PREFIX = "pos-cajero-foto:cajero-turno:";
const CAJERO_TURNO_FICHA_PREFIX = "pos-cajero-ficha-v1:cajero-turno:";

/** Clave localStorage para la ficha del cajero del catálogo (turno). */
export function posCajeroFichaLocalKeyCajeroTurno(cajeroTurnoFirestoreId: string): string {
  return `${CAJERO_TURNO_FICHA_PREFIX}${cajeroTurnoFirestoreId.trim()}`;
}

/** Una clave por usuario: el SSR de Next no puede leer localStorage en el estado inicial; se hidrata en useEffect. */
export function posCajeroFotoStorageKey(uid: string | null | undefined): string {
  const u = uid?.trim();
  return u ? `${POS_CAJERO_FOTO_STORAGE_KEY}:${u}` : POS_CAJERO_FOTO_STORAGE_KEY;
}

/**
 * Foto en localStorage. Si `cajeroTurnoFirestoreId` está definido, es la del cajero del catálogo en turno;
 * si no, la de la sesión Firebase (`uid`).
 */
export function readCajeroFotoDataUrl(
  uid: string | null | undefined,
  cajeroTurnoFirestoreId?: string | null
): string | null {
  if (typeof window === "undefined") return null;
  try {
    const cid = cajeroTurnoFirestoreId?.trim();
    if (cid) {
      return localStorage.getItem(`${CAJERO_TURNO_FOTO_PREFIX}${cid}`);
    }
    const k = posCajeroFotoStorageKey(uid);
    let v = localStorage.getItem(k);
    if (!v && uid) {
      const legacy = localStorage.getItem(POS_CAJERO_FOTO_STORAGE_KEY);
      if (legacy) {
        localStorage.setItem(k, legacy);
        v = legacy;
      }
    }
    return v;
  } catch {
    return null;
  }
}

/** @returns false si localStorage falla (cuota, modo privado, bloqueado). */
export function writeCajeroFotoDataUrl(
  uid: string | null | undefined,
  dataUrl: string | null,
  cajeroTurnoFirestoreId?: string | null
): boolean {
  if (typeof window === "undefined") return false;
  try {
    const cid = cajeroTurnoFirestoreId?.trim();
    const k = cid ? `${CAJERO_TURNO_FOTO_PREFIX}${cid}` : posCajeroFotoStorageKey(uid);
    if (dataUrl) localStorage.setItem(k, dataUrl);
    else localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

const MAX_FOTO_LADO_PX = 720;
const JPEG_CALIDAD = 0.85;

/**
 * Reduce tamaño de la foto para caber en localStorage (data URL de cámara suelen superar el límite ~5MB).
 */
export function comprimirDataUrlFotoCajero(dataUrl: string): Promise<string> {
  if (typeof window === "undefined") return Promise.resolve(dataUrl);
  if (!dataUrl.startsWith("data:image/")) return Promise.resolve(dataUrl);

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const maxSide = Math.max(img.naturalWidth, img.naturalHeight);
        const scale = maxSide > MAX_FOTO_LADO_PX ? MAX_FOTO_LADO_PX / maxSide : 1;
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const jpeg = canvas.toDataURL("image/jpeg", JPEG_CALIDAD);
        resolve(jpeg.length < dataUrl.length ? jpeg : dataUrl);
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}
