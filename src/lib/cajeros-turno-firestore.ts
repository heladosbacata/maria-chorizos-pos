import {
  addDoc,
  collection,
  deleteField,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { CajeroFichaDatos } from "@/types/pos-perfil-cajero";
import { emptyCajeroFicha } from "@/types/pos-perfil-cajero";

export const POS_CAJEROS_TURNO_COLLECTION = "posCajerosTurno";

/** Valor de `cajeroTurnoId` cuando no hay cajeros en catálogo y se usa la sesión de login. */
export const CAJERO_TURNO_ID_SESION = "__sesion_pos__";

export interface CajeroTurnoDoc {
  id: string;
  puntoVenta: string;
  activo: boolean;
  ficha: CajeroFichaDatos;
  createdByUid?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

function fichaFromFirestore(raw: unknown): CajeroFichaDatos {
  if (!raw || typeof raw !== "object") return emptyCajeroFicha();
  return { ...emptyCajeroFicha(), ...(raw as Partial<CajeroFichaDatos>) };
}

export function nombreDisplayCajeroTurno(ficha: CajeroFichaDatos): string {
  const n = `${ficha.nombres ?? ""} ${ficha.apellidos ?? ""}`.trim();
  if (n) return n;
  const c = ficha.correo?.trim();
  if (c) return c;
  const d = ficha.numeroDocumento?.trim();
  if (d) return `Doc. ${d}`;
  return "Cajero sin nombre";
}

function docToCajeroTurno(d: QueryDocumentSnapshot): CajeroTurnoDoc {
  const x = d.data();
  return {
    id: d.id,
    puntoVenta: String(x.puntoVenta ?? ""),
    activo: x.activo !== false,
    ficha: fichaFromFirestore(x.ficha),
    createdAt: x.createdAt,
    updatedAt: x.updatedAt,
  };
}

export async function listarCajerosTurnoActivos(puntoVenta: string): Promise<CajeroTurnoDoc[]> {
  if (!db || !puntoVenta.trim()) return [];
  try {
    const q = query(
      collection(db, POS_CAJEROS_TURNO_COLLECTION),
      where("puntoVenta", "==", puntoVenta.trim()),
      where("activo", "==", true)
    );
    const snap = await getDocs(q);
    const out: CajeroTurnoDoc[] = [];
    snap.forEach((d) => out.push(docToCajeroTurno(d)));
    out.sort((a, b) => nombreDisplayCajeroTurno(a.ficha).localeCompare(nombreDisplayCajeroTurno(b.ficha), "es"));
    return out;
  } catch {
    return [];
  }
}

/** Administración: todos los registros del punto de venta (activos e inactivos). */
export async function listarCajerosTurnoPorPuntoVenta(puntoVenta: string): Promise<CajeroTurnoDoc[]> {
  if (!db || !puntoVenta.trim()) return [];
  try {
    const q = query(collection(db, POS_CAJEROS_TURNO_COLLECTION), where("puntoVenta", "==", puntoVenta.trim()));
    const snap = await getDocs(q);
    const out: CajeroTurnoDoc[] = [];
    snap.forEach((d) => out.push(docToCajeroTurno(d)));
    out.sort((a, b) => nombreDisplayCajeroTurno(a.ficha).localeCompare(nombreDisplayCajeroTurno(b.ficha), "es"));
    return out;
  } catch {
    return [];
  }
}

export async function crearCajeroTurnoFirestore(params: {
  puntoVenta: string;
  ficha: CajeroFichaDatos;
  createdByUid: string;
}): Promise<{ ok: boolean; id?: string; message?: string }> {
  if (!db) return { ok: false, message: "Firestore no está disponible." };
  const pv = params.puntoVenta.trim();
  if (!pv) return { ok: false, message: "Indica el punto de venta." };
  try {
    const ref = await addDoc(collection(db, POS_CAJEROS_TURNO_COLLECTION), {
      puntoVenta: pv,
      activo: true,
      ficha: { ...params.ficha },
      createdByUid: params.createdByUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return { ok: true, id: ref.id };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "No se pudo guardar el cajero.",
    };
  }
}

export async function actualizarCajeroTurnoFirestore(params: {
  firestoreId: string;
  ficha: CajeroFichaDatos;
}): Promise<{ ok: boolean; message?: string }> {
  if (!db) return { ok: false, message: "Firestore no está disponible." };
  try {
    const ref = doc(db, POS_CAJEROS_TURNO_COLLECTION, params.firestoreId);
    const patch: Record<string, unknown> = {
      ficha: { ...params.ficha },
      updatedAt: serverTimestamp(),
      uidUsuarioPos: deleteField(),
    };
    await updateDoc(ref, patch);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "No se pudo actualizar.",
    };
  }
}

export async function setCajeroTurnoActivoFirestore(
  firestoreId: string,
  activo: boolean
): Promise<{ ok: boolean; message?: string }> {
  if (!db) return { ok: false, message: "Firestore no está disponible." };
  try {
    await updateDoc(doc(db, POS_CAJEROS_TURNO_COLLECTION, firestoreId), {
      activo,
      updatedAt: serverTimestamp(),
    });
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "No se pudo cambiar el estado.",
    };
  }
}
