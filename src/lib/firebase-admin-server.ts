/**
 * Solo para rutas API de Node (pages/api). No importar desde componentes cliente.
 */
import { cert, getApps, initializeApp, type App, type ServiceAccount } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { POS_CONTADOR_ROLE } from "@/lib/auth-roles";

export function getFirebaseAdminApp(): App | null {
  if (typeof window !== "undefined") return null;
  if (getApps().length > 0) return getApps()[0]!;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as ServiceAccount;
    return initializeApp({ credential: cert(parsed) });
  } catch {
    return null;
  }
}

export type CreadorFirestoreContext =
  | { ok: true; uid: string; puntoVenta: string | null; role: string | null }
  | { ok: false; message: string };

/**
 * Valida el ID token y lee `users/{uid}` para acotar creación de cajeros al punto de venta del franquiciado.
 */
export async function getCreadorFirestoreContext(
  app: App,
  idToken: string
): Promise<CreadorFirestoreContext> {
  try {
    const auth = getAuth(app);
    const decoded = await auth.verifyIdToken(idToken);
    const uid = decoded.uid;
    const db = getFirestore(app);
    const snap = await db.collection("users").doc(uid).get();
    const data = snap.data();
    const puntoVenta =
      typeof data?.puntoVenta === "string" && data.puntoVenta.trim() ? data.puntoVenta.trim() : null;
    const role = typeof data?.role === "string" ? data.role : null;
    return { ok: true, uid, puntoVenta, role };
  } catch {
    return { ok: false, message: "Sesión inválida o token expirado. Vuelve a iniciar sesión." };
  }
}

/**
 * Crea usuario Auth + documento users/{uid} cuando el WMS no tiene POST /api/pos/usuarios/crear.
 * Exige Bearer ID token válido del proyecto (quien invoca ya está autenticado en el POS).
 */
export async function crearCajeroPosViaAdmin(params: {
  idToken: string;
  email: string;
  password: string;
  puntoVenta: string;
}): Promise<{ ok: true; uid: string; message: string } | { ok: false; message: string }> {
  const app = getFirebaseAdminApp();
  if (!app) {
    return {
      ok: false,
      message:
        "El WMS no tiene el endpoint o devolvió error. Para crear cajeros sin WMS, configura la variable de entorno FIREBASE_SERVICE_ACCOUNT_JSON con la cuenta de servicio del mismo proyecto Firebase (JSON en una sola línea).",
    };
  }
  const ctx = await getCreadorFirestoreContext(app, params.idToken);
  if (!ctx.ok) return { ok: false, message: ctx.message };
  if (ctx.role === POS_CONTADOR_ROLE) {
    return { ok: false, message: "Las cuentas de contador no pueden crear usuarios cajeros." };
  }
  try {
    const auth = getAuth(app);
    const userRecord = await auth.createUser({
      email: params.email,
      password: params.password,
      emailVerified: false,
      disabled: false,
    });
    const db = getFirestore(app);
    await db.collection("users").doc(userRecord.uid).set(
      {
        email: params.email,
        puntoVenta: params.puntoVenta.trim() || null,
        role: "pos",
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return {
      ok: true,
      uid: userRecord.uid,
      message:
        "Cajero creado en Firebase. Si usas WMS, implementa o corrige POST /api/pos/usuarios/crear y NEXT_PUBLIC_WMS_URL para mantener ambos sistemas alineados.",
    };
  } catch (e: unknown) {
    const code = typeof e === "object" && e !== null && "code" in e ? String((e as { code: string }).code) : "";
    if (code === "auth/email-already-exists") {
      return { ok: false, message: "Ese correo ya está registrado en Firebase." };
    }
    const msg = e instanceof Error ? e.message : "Error al crear el usuario.";
    return { ok: false, message: msg };
  }
}
