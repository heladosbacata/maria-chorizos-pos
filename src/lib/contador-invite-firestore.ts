import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { sendSignInLinkToEmail, type Auth } from "firebase/auth";
import { db } from "@/lib/firebase";

/** Colección: invitaciones cajero → contador (fallback si el WMS no expone las APIs). */
export const POS_CONTADOR_INVITACIONES_COLLECTION = "posContadorInvitaciones";

export interface ContadorInviteDoc {
  id: string;
  inviterUid: string;
  inviterEmail: string;
  inviteeEmail: string;
  puntoVenta: string;
  estado: "pendiente" | "aceptada" | "cancelada";
  createdAt?: unknown;
}

function normEmail(e: string): string {
  return e.trim().toLowerCase();
}

export async function crearInvitacionContadorFirestore(params: {
  inviterUid: string;
  inviterEmail: string;
  puntoVenta: string;
  inviteeEmail: string;
}): Promise<{ ok: boolean; id?: string; message?: string }> {
  if (!db) return { ok: false, message: "Firestore no está disponible." };
  const inviteeEmail = normEmail(params.inviteeEmail);
  if (!inviteeEmail) return { ok: false, message: "Correo inválido." };
  try {
    const ref = await addDoc(collection(db, POS_CONTADOR_INVITACIONES_COLLECTION), {
      inviterUid: params.inviterUid,
      inviterEmail: params.inviterEmail.trim(),
      inviteeEmail,
      puntoVenta: params.puntoVenta.trim(),
      estado: "pendiente",
      createdAt: serverTimestamp(),
    });
    return { ok: true, id: ref.id };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "No se pudo guardar la invitación.",
    };
  }
}

export async function listarInvitacionesContadorFirestore(
  inviterUid: string
): Promise<ContadorInviteDoc[]> {
  if (!db) return [];
  try {
    const q = query(
      collection(db, POS_CONTADOR_INVITACIONES_COLLECTION),
      where("inviterUid", "==", inviterUid)
    );
    const snap = await getDocs(q);
    const out: ContadorInviteDoc[] = [];
    snap.forEach((d) => {
      const x = d.data();
      out.push({
        id: d.id,
        inviterUid: String(x.inviterUid ?? ""),
        inviterEmail: String(x.inviterEmail ?? ""),
        inviteeEmail: String(x.inviteeEmail ?? ""),
        puntoVenta: String(x.puntoVenta ?? ""),
        estado: (x.estado as ContadorInviteDoc["estado"]) || "pendiente",
        createdAt: x.createdAt,
      });
    });
    out.sort((a, b) => {
      const ta =
        a.createdAt && typeof (a.createdAt as { seconds?: number }).seconds === "number"
          ? (a.createdAt as { seconds: number }).seconds
          : 0;
      const tb =
        b.createdAt && typeof (b.createdAt as { seconds?: number }).seconds === "number"
          ? (b.createdAt as { seconds: number }).seconds
          : 0;
      return tb - ta;
    });
    return out;
  } catch {
    return [];
  }
}

export async function buscarInvitacionPendientePorCorreo(
  inviteeEmail: string
): Promise<(ContadorInviteDoc & { firestoreId: string }) | null> {
  if (!db) return null;
  const email = normEmail(inviteeEmail);
  try {
    const q = query(
      collection(db, POS_CONTADOR_INVITACIONES_COLLECTION),
      where("inviteeEmail", "==", email),
      where("estado", "==", "pendiente"),
      limit(10)
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    let best: (ContadorInviteDoc & { firestoreId: string }) | null = null;
    let bestT = -1;
    snap.forEach((d) => {
      const x = d.data();
      const t =
        x.createdAt && typeof (x.createdAt as { seconds?: number }).seconds === "number"
          ? (x.createdAt as { seconds: number }).seconds
          : 0;
      if (t >= bestT) {
        bestT = t;
        best = {
          id: d.id,
          firestoreId: d.id,
          inviterUid: String(x.inviterUid ?? ""),
          inviterEmail: String(x.inviterEmail ?? ""),
          inviteeEmail: String(x.inviteeEmail ?? ""),
          puntoVenta: String(x.puntoVenta ?? ""),
          estado: "pendiente",
          createdAt: x.createdAt,
        };
      }
    });
    return best;
  } catch {
    return null;
  }
}

export async function marcarInvitacionAceptada(firestoreId: string): Promise<void> {
  if (!db) return;
  try {
    await updateDoc(doc(db, POS_CONTADOR_INVITACIONES_COLLECTION, firestoreId), {
      estado: "aceptada",
      aceptadaAt: serverTimestamp(),
    });
  } catch {
    // ignore
  }
}

/** El invitador anula una invitación pendiente (libera cupo para invitar otro correo). */
export async function cancelarInvitacionContadorFirestore(params: {
  firestoreId: string;
  inviterUid: string;
}): Promise<{ ok: boolean; message?: string }> {
  if (!db) return { ok: false, message: "Firestore no está disponible." };
  try {
    const ref = doc(db, POS_CONTADOR_INVITACIONES_COLLECTION, params.firestoreId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      return { ok: false, message: "Invitación no encontrada." };
    }
    const x = snap.data();
    if (String(x.inviterUid ?? "") !== params.inviterUid) {
      return { ok: false, message: "No tienes permiso para anular esta invitación." };
    }
    if ((x.estado as string) !== "pendiente") {
      return { ok: false, message: "Solo se pueden anular invitaciones pendientes." };
    }
    await updateDoc(ref, {
      estado: "cancelada",
      canceladaAt: serverTimestamp(),
    });
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "No se pudo anular la invitación.",
    };
  }
}

function mensajeErrorEnvioEnlace(e: unknown): string {
  const code =
    typeof e === "object" && e !== null && "code" in e
      ? String((e as { code?: string }).code)
      : "";
  if (code === "auth/operation-not-allowed") {
    return (
      "Firebase no permite aún el envío de enlaces por correo. En Firebase Console → Authentication → Sign-in method: " +
      "abre «Correo electrónico / contraseña», actívalo y marca «Enlace por correo (acceso sin contraseña)». " +
      "Guarda los cambios y vuelve a enviar la invitación."
    );
  }
  if (code === "auth/unauthorized-continue-uri") {
    return (
      "La URL del enlace no está en dominios autorizados. En Authentication → Settings → Authorized domains, " +
      "añade el host que usas (p. ej. localhost y tu dominio en producción)."
    );
  }
  if (e instanceof Error) return e.message;
  return "No se pudo enviar el correo.";
}

export async function enviarCorreoEnlaceContador(
  authInstance: Auth,
  inviteeEmail: string,
  continueUrl: string
): Promise<{ ok: boolean; message?: string }> {
  try {
    await sendSignInLinkToEmail(authInstance, normEmail(inviteeEmail), {
      url: continueUrl,
      handleCodeInApp: true,
    });
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: mensajeErrorEnvioEnlace(e),
    };
  }
}
