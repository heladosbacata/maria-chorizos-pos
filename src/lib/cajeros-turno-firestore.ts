import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type DocumentSnapshot,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { getWmsPublicBaseUrl } from "@/lib/wms-public-base";
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

/** Solo dígitos, para comparar cédulas con o sin puntos o espacios. */
export function normalizarNumeroDocumentoCajero(doc: string): string {
  return doc.replace(/\D/g, "").trim();
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

function docToCajeroTurno(d: QueryDocumentSnapshot | DocumentSnapshot): CajeroTurnoDoc {
  const x = d.data();
  if (!x) {
    return {
      id: d.id,
      puntoVenta: "",
      activo: false,
      ficha: emptyCajeroFicha(),
    };
  }
  return {
    id: d.id,
    puntoVenta: String(x.puntoVenta ?? ""),
    activo: x.activo !== false,
    ficha: fichaFromFirestore(x.ficha),
    createdAt: x.createdAt,
    updatedAt: x.updatedAt,
  };
}

/** Lee un cajero del catálogo por id de documento en `posCajerosTurno`. */
export async function obtenerCajeroTurnoPorId(firestoreId: string): Promise<CajeroTurnoDoc | null> {
  const id = firestoreId.trim();
  if (!db || !id) return null;
  try {
    const snap = await getDoc(doc(db, POS_CAJEROS_TURNO_COLLECTION, id));
    if (!snap.exists()) return null;
    return docToCajeroTurno(snap);
  } catch {
    return null;
  }
}

export type BusquedaCajeroPorDocumentoResult =
  | { estado: "activo"; cajero: CajeroTurnoDoc }
  | { estado: "inactivo"; cajero: CajeroTurnoDoc }
  | { estado: "no_encontrado" };

/** Busca en el catálogo del punto de venta por número de documento (activo tiene prioridad). */
export async function buscarCajeroTurnoPorDocumento(
  puntoVenta: string,
  numeroDocumento: string
): Promise<BusquedaCajeroPorDocumentoResult> {
  const norm = normalizarNumeroDocumentoCajero(numeroDocumento);
  if (!norm) return { estado: "no_encontrado" };
  const todos = await listarCajerosTurnoPorPuntoVenta(puntoVenta);
  const coincidencias = todos.filter(
    (c) => normalizarNumeroDocumentoCajero(c.ficha.numeroDocumento ?? "") === norm
  );
  if (coincidencias.length === 0) return { estado: "no_encontrado" };
  const activo = coincidencias.find((c) => c.activo);
  if (activo) return { estado: "activo", cajero: activo };
  return { estado: "inactivo", cajero: coincidencias[0]! };
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

async function crearCajeroViaWmsApi(
  ficha: CajeroFichaDatos
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const user = auth?.currentUser;
  if (!user) return { ok: false, message: "Debes tener sesión iniciada." };
  const token = await user.getIdToken();
  const base = getWmsPublicBaseUrl().replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/api/pos/cajeros/crear`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ficha }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      id?: string;
      error?: string;
      message?: string;
    };
    if (res.ok && data.ok === true && typeof data.id === "string" && data.id.trim()) {
      return { ok: true, id: data.id.trim() };
    }
    const err =
      typeof data.error === "string" && data.error.trim()
        ? data.error.trim()
        : typeof data.message === "string" && data.message.trim()
          ? data.message.trim()
          : `Error del servidor (${res.status})`;
    return { ok: false, message: err };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Error de red al registrar el cajero.",
    };
  }
}

/** Misma ruta en el propio despliegue del POS (Admin SDK, sin CORS). */
async function crearCajeroViaPosApi(
  ficha: CajeroFichaDatos
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const user = auth?.currentUser;
  if (!user) return { ok: false, message: "Debes tener sesión iniciada." };
  const token = await user.getIdToken();
  try {
    const res = await fetch("/api/pos_cajeros_turno_crear", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ficha }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      id?: string;
      message?: string;
    };
    if (res.ok && data.ok === true && typeof data.id === "string" && data.id.trim()) {
      return { ok: true, id: data.id.trim() };
    }
    return { ok: false, message: data.message ?? `Error del servidor (${res.status})` };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Error al registrar el cajero en el servidor POS.",
    };
  }
}

export async function crearCajeroTurnoFirestore(params: {
  puntoVenta: string;
  ficha: CajeroFichaDatos;
  createdByUid: string;
}): Promise<{ ok: boolean; id?: string; message?: string }> {
  const pv = params.puntoVenta.trim();
  if (!pv) return { ok: false, message: "Indica el punto de venta." };

  const wms = await crearCajeroViaWmsApi(params.ficha);
  if (wms.ok) return { ok: true, id: wms.id };

  const local = await crearCajeroViaPosApi(params.ficha);
  if (local.ok) return { ok: true, id: local.id };

  if (!db) {
    return { ok: false, message: wms.message || local.message || "Firestore no está disponible." };
  }

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
    const sdkMsg = e instanceof Error ? e.message : "No se pudo guardar el cajero.";
    const hint = /permission|insufficient/i.test(sdkMsg)
      ? " Publica las reglas de Firestore actualizadas o usa el WMS con NEXT_PUBLIC_WMS_URL."
      : "";
    return {
      ok: false,
      message: `${wms.message || local.message || sdkMsg}${hint}`,
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

/** Elimina el registro del catálogo del punto (solo franquiciado; requiere regla `delete` en Firestore). */
export async function eliminarCajeroTurnoFirestore(
  firestoreId: string
): Promise<{ ok: boolean; message?: string }> {
  if (!db) return { ok: false, message: "Firestore no está disponible." };
  const id = firestoreId.trim();
  if (!id) return { ok: false, message: "Identificador de cajero inválido." };
  try {
    await deleteDoc(doc(db, POS_CAJEROS_TURNO_COLLECTION, id));
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "No se pudo eliminar el cajero.",
    };
  }
}
