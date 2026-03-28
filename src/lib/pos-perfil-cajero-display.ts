import { POS_CAJERO_FICHA_STORAGE_KEY } from "@/constants/perfil-pos";
import type { CajeroFichaDatos } from "@/types/pos-perfil-cajero";

/** Evento al guardar el perfil del cajero (misma pestaña) para refrescar etiquetas en otros paneles. */
export const EVENTO_PERFIL_CAJERO_GUARDADO = "pos-perfil-cajero-guardado";

export function nombreCompletoDesdeFicha(datos: Partial<CajeroFichaDatos> | null | undefined): string | null {
  if (!datos) return null;
  const n = `${datos.nombres ?? ""} ${datos.apellidos ?? ""}`.trim();
  return n.length > 0 ? n : null;
}

/** Lee la ficha guardada en localStorage (mismo origen que el formulario de perfil). */
export function leerNombrePerfilCajeroDesdeLocal(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(POS_CAJERO_FICHA_STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<CajeroFichaDatos>;
    return nombreCompletoDesdeFicha(p);
  } catch {
    return null;
  }
}

export function etiquetaCuentaParaGuardado(opts: {
  nombrePerfil: string | null;
  emailSesion: string | null;
  uid: string;
}): string {
  if (opts.nombrePerfil) return opts.nombrePerfil;
  const em = opts.emailSesion?.trim();
  if (em) return em;
  return `Usuario ${opts.uid.slice(0, 8)}…`;
}
