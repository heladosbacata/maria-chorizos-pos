/** Foto del cajero en sidebar (data URL en localStorage) */
export const POS_CAJERO_FOTO_STORAGE_KEY = "pos-cajero-foto";

/** JSON con datos del formulario «Perfil del cajero» */
export const POS_CAJERO_FICHA_STORAGE_KEY = "pos-cajero-ficha-v1";

/** Una clave por usuario: el SSR de Next no puede leer localStorage en el estado inicial; se hidrata en useEffect. */
export function posCajeroFotoStorageKey(uid: string | null | undefined): string {
  const u = uid?.trim();
  return u ? `${POS_CAJERO_FOTO_STORAGE_KEY}:${u}` : POS_CAJERO_FOTO_STORAGE_KEY;
}

export function readCajeroFotoDataUrl(uid: string | null | undefined): string | null {
  if (typeof window === "undefined") return null;
  try {
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

export function writeCajeroFotoDataUrl(uid: string | null | undefined, dataUrl: string | null): void {
  if (typeof window === "undefined") return;
  try {
    const k = posCajeroFotoStorageKey(uid);
    if (dataUrl) localStorage.setItem(k, dataUrl);
    else localStorage.removeItem(k);
  } catch {
    /* quota o almacenamiento desactivado */
  }
}
