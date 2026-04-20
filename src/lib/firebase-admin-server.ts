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

const ROLES_PROVISION_WMS = new Set(["pos", "pos_contador"]);

export type ProvisionUsuarioWmsResult =
  | { ok: true; uid: string; created: boolean; message: string }
  | { ok: false; message: string };

/**
 * Crea o actualiza usuario POS en Firebase (Auth + `users/{uid}`) cuando el WMS notifica un alta o cambio.
 * Lo invoca la ruta `/api/wms_provision_usuario` con un secreto compartido; no usa token del cajero.
 */
export async function provisionUsuarioPosDesdeWms(params: {
  email: string;
  /** Obligatoria si el correo no existe en Auth (usuario nuevo). */
  password?: string;
  puntoVenta: string;
  /** `pos` (defecto) o `pos_contador`. */
  role?: string;
  /** Si se envía, actualiza el flag `disabled` en Auth (`false` = habilitado). */
  disabled?: boolean;
  displayName?: string;
}): Promise<ProvisionUsuarioWmsResult> {
  const app = getFirebaseAdminApp();
  if (!app) {
    return { ok: false, message: "Firebase Admin no configurado (FIREBASE_SERVICE_ACCOUNT_JSON)." };
  }

  const email = params.email.trim().toLowerCase();
  const pv = params.puntoVenta.trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, message: "Correo electrónico inválido." };
  }
  if (!pv) {
    return { ok: false, message: "puntoVenta es obligatorio." };
  }

  const roleRaw = params.role?.trim();
  const role = roleRaw && ROLES_PROVISION_WMS.has(roleRaw) ? roleRaw : "pos";

  const auth = getAuth(app);
  const db = getFirestore(app);

  let existing: Awaited<ReturnType<typeof auth.getUser>> | null = null;
  try {
    existing = await auth.getUserByEmail(email);
  } catch (e: unknown) {
    const code = typeof e === "object" && e !== null && "code" in e ? String((e as { code: string }).code) : "";
    if (code !== "auth/user-not-found") {
      const msg = e instanceof Error ? e.message : "Error al consultar Auth.";
      return { ok: false, message: msg };
    }
  }

  try {
    let uid: string;
    let created = false;

    if (!existing) {
      const pwd = params.password ?? "";
      if (pwd.length < 8) {
        return {
          ok: false,
          message:
            "Contraseña obligatoria (mínimo 8 caracteres) para crear un usuario que aún no existe en Firebase Auth.",
        };
      }
      const disabledCreate = params.disabled === true;
      const rec = await auth.createUser({
        email,
        password: pwd,
        emailVerified: false,
        disabled: disabledCreate,
        ...(params.displayName?.trim() ? { displayName: params.displayName.trim() } : {}),
      });
      uid = rec.uid;
      created = true;
    } else {
      uid = existing.uid;
      const patch: { disabled?: boolean; password?: string; displayName?: string } = {};
      let passwordChanged = false;
      if (typeof params.disabled === "boolean") {
        patch.disabled = params.disabled;
      }
      if (params.password && params.password.length >= 8) {
        patch.password = params.password;
        passwordChanged = true;
      }
      if (params.displayName?.trim()) {
        patch.displayName = params.displayName.trim();
      }
      if (Object.keys(patch).length > 0) {
        await auth.updateUser(uid, patch);
        if (passwordChanged) {
          await auth.revokeRefreshTokens(uid);
          const refreshed = await auth.getUser(uid);
          const sessionRevokedAtMs = Date.parse(refreshed.tokensValidAfterTime);
          await db.collection("users").doc(uid).set(
            {
              sessionRevokedAtMs: Number.isFinite(sessionRevokedAtMs) ? sessionRevokedAtMs : Date.now(),
              sessionRevokedReason: "password_changed",
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
        }
      }
    }

    await db.collection("users").doc(uid).set(
      {
        email,
        puntoVenta: pv,
        role,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return {
      ok: true,
      uid,
      created,
      message: created
        ? "Usuario creado en Firebase Auth y documento users/{uid}."
        : "Usuario actualizado en Firebase (Auth y/o Firestore).",
    };
  } catch (e: unknown) {
    const code = typeof e === "object" && e !== null && "code" in e ? String((e as { code: string }).code) : "";
    if (code === "auth/email-already-exists") {
      return { ok: false, message: "Ese correo ya está registrado en Firebase Auth." };
    }
    const msg = e instanceof Error ? e.message : "Error al provisionar usuario.";
    return { ok: false, message: msg };
  }
}
