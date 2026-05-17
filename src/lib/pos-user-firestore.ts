import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { POS_CONTADOR_ROLE } from "@/lib/auth-roles";
import type { CajeroFichaDatos } from "@/types/pos-perfil-cajero";
import { emptyCajeroFicha } from "@/types/pos-perfil-cajero";
import type { PosPerfilOrganizacionDatos } from "@/types/pos-perfil-organizacion";
import { mergePosPerfilOrganizacion } from "@/types/pos-perfil-organizacion";
import { db } from "@/lib/firebase";

const USERS = "users";

/** Campo en `users/{uid}` con el JSON del perfil del cajero (sin foto; la foto sigue en localStorage). */
export const POS_PERFIL_CAJERO_FIELD = "posPerfilCajero";

/** Campo en `users/{uid}` con el JSON «Datos de la empresa» (perfil de organización). */
export const POS_PERFIL_ORGANIZACION_FIELD = "posPerfilOrganizacion";

/**
 * Crea o actualiza el documento del usuario POS en Firestore (punto de venta, rol).
 * Mismo esquema que usa el WMS para cajeros (`role: pos`, `puntoVenta`).
 */
export async function persistPuntoVentaUsuario(params: {
  uid: string;
  email: string | null;
  puntoVenta: string;
}): Promise<{ ok: boolean; message?: string }> {
  if (!db) return { ok: false, message: "Firestore no está disponible." };
  try {
    const snap = await getDoc(doc(db, USERS, params.uid));
    const rolActual = snap.data()?.role as string | undefined;
    if (rolActual === POS_CONTADOR_ROLE) {
      return {
        ok: false,
        message: "Las cuentas de contador no pueden cambiar el punto de venta desde aquí.",
      };
    }
    await setDoc(
      doc(db, USERS, params.uid),
      {
        puntoVenta: params.puntoVenta.trim(),
        email: params.email ?? null,
        role: "pos",
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No se pudo guardar el punto de venta.";
    return { ok: false, message: msg };
  }
}

/** Contador invitado: mismo `puntoVenta` que el cajero que invitó; rol distinto para el WMS / informes. */
export async function persistContadorDesdeInvitacion(params: {
  uid: string;
  email: string | null;
  puntoVenta: string;
  invitadoPorUid: string;
}): Promise<{ ok: boolean; message?: string }> {
  if (!db) return { ok: false, message: "Firestore no está disponible." };
  try {
    await setDoc(
      doc(db, USERS, params.uid),
      {
        puntoVenta: params.puntoVenta.trim(),
        email: params.email ?? null,
        role: "pos_contador",
        invitadoPorUid: params.invitadoPorUid,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No se pudo guardar el perfil del contador.";
    return { ok: false, message: msg };
  }
}

/** Guarda la ficha del cajero en `users/{uid}.posPerfilCajero`. */
export async function persistPosPerfilCajero(uid: string, datos: CajeroFichaDatos): Promise<{ ok: boolean; message?: string }> {
  if (!db) return { ok: false, message: "Firestore no está disponible." };
  try {
    await setDoc(
      doc(db, USERS, uid),
      {
        [POS_PERFIL_CAJERO_FIELD]: { ...datos },
        posPerfilCajeroUpdatedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No se pudo guardar el perfil.";
    return { ok: false, message: msg };
  }
}

/** Guarda «Datos de la empresa» en `users/{uid}.posPerfilOrganizacion`. */
export async function persistPosPerfilOrganizacion(
  uid: string,
  datos: PosPerfilOrganizacionDatos
): Promise<{ ok: boolean; message?: string }> {
  if (!db) return { ok: false, message: "Firestore no está disponible." };
  try {
    await setDoc(
      doc(db, USERS, uid),
      {
        [POS_PERFIL_ORGANIZACION_FIELD]: { ...datos },
        posPerfilOrganizacionUpdatedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No se pudo guardar el perfil de la organización.";
    return { ok: false, message: msg };
  }
}

/** Lee el perfil de organización guardado (si existe). */
export async function loadPosPerfilOrganizacionFromFirestore(uid: string): Promise<PosPerfilOrganizacionDatos | null> {
  if (!db) return null;
  try {
    const snap = await getDoc(doc(db, USERS, uid));
    const raw = snap.data()?.[POS_PERFIL_ORGANIZACION_FIELD];
    if (!raw || typeof raw !== "object") return null;
    return mergePosPerfilOrganizacion(raw);
  } catch {
    return null;
  }
}

/** Lee la ficha guardada en Firestore (si existe). */
export async function loadPosPerfilCajeroFromFirestore(uid: string): Promise<CajeroFichaDatos | null> {
  if (!db) return null;
  try {
    const snap = await getDoc(doc(db, USERS, uid));
    const raw = snap.data()?.[POS_PERFIL_CAJERO_FIELD];
    if (!raw || typeof raw !== "object") return null;
    return { ...emptyCajeroFicha(), ...(raw as Partial<CajeroFichaDatos>) };
  } catch {
    return null;
  }
}
