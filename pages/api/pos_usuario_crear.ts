import type { NextApiRequest, NextApiResponse } from "next";
import { POS_CONTADOR_ROLE } from "@/lib/auth-roles";
import {
  crearCajeroPosViaAdmin,
  getCreadorFirestoreContext,
  getFirebaseAdminApp,
} from "@/lib/firebase-admin-server";
import { getWmsPublicBaseUrl } from "@/lib/wms-public-base";

function bearerToken(req: NextApiRequest): string | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  const t = auth.slice(7).trim();
  return t.length ? t : null;
}

/**
 * Alta de cajero POS: el punto de venta lo marca el franquiciado (Firestore users/{uid}.puntoVenta)
 * cuando hay cuenta de servicio; si no, se usa el valor enviado desde el POS (mismo que muestra la UI).
 *
 * WMS: POST /api/pos/usuarios/crear — si 404 o sin conexión, fallback Firebase Admin.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  const body = req.body as { email?: string; password?: string; puntoVenta?: string } | undefined;
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const puntoVentaBody = typeof body?.puntoVenta === "string" ? body.puntoVenta.trim() : "";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ ok: false, message: "Correo electrónico inválido." });
  }
  if (!password || password.length < 8) {
    return res.status(400).json({ ok: false, message: "La contraseña debe tener al menos 8 caracteres." });
  }

  const idToken = bearerToken(req);
  if (!idToken) {
    return res.status(200).json({
      ok: false,
      message: "Debes tener la sesión iniciada en el POS para crear cajeros.",
    });
  }

  const adminApp = getFirebaseAdminApp();
  let puntoVentaEfectivo = puntoVentaBody;

  if (adminApp) {
    const ctx = await getCreadorFirestoreContext(adminApp, idToken);
    if (!ctx.ok) {
      return res.status(200).json({ ok: false, message: ctx.message });
    }
    if (ctx.role === POS_CONTADOR_ROLE) {
      return res.status(200).json({
        ok: false,
        message: "Las cuentas de contador no pueden crear usuarios cajeros.",
      });
    }
    if (ctx.puntoVenta) {
      puntoVentaEfectivo = ctx.puntoVenta;
    } else if (!puntoVentaEfectivo) {
      return res.status(200).json({
        ok: false,
        message:
          "Tu cuenta no tiene punto de venta en Firestore. El WMS debe crear el usuario franquiciado con users/{uid}.puntoVenta asignado. Si acabas de actualizar el WMS, cierra sesión y vuelve a entrar.",
      });
    }
  } else if (!puntoVentaEfectivo) {
    return res.status(200).json({
      ok: false,
      message:
        "Indica el punto de venta en pantalla o configura FIREBASE_SERVICE_ACCOUNT_JSON en el servidor del POS para tomar automáticamente el punto del franquiciado.",
    });
  }

  const base = getWmsPublicBaseUrl();
  const url = `${base}/api/pos/usuarios/crear`;
  const auth = req.headers.authorization;
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (auth) headers.Authorization = auth;

  const wmsHint = ` URL del WMS: ${base}. Ruta POST /api/pos/usuarios/crear o usa FIREBASE_SERVICE_ACCOUNT_JSON como respaldo.`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        email,
        password,
        ...(puntoVentaEfectivo ? { puntoVenta: puntoVentaEfectivo } : {}),
      }),
    });
    const data = await response.json().catch(() => ({}));

    if (response.ok) {
      return res.status(200).json(data);
    }

    const wmsMsg = (data?.message || data?.error || `Error ${response.status}`) as string;

    if (response.status === 404) {
      const fb = await crearCajeroPosViaAdmin({
        idToken,
        email,
        password,
        puntoVenta: puntoVentaEfectivo,
      });
      if (fb.ok) {
        return res.status(200).json({ ok: true, message: fb.message, uid: fb.uid, origen: "firebase" });
      }
      return res.status(200).json({
        ok: false,
        message: `${wmsMsg} (WMS 404). ${fb.message}`,
      });
    }

    return res.status(200).json({
      ok: false,
      message: wmsMsg + wmsHint,
    });
  } catch (err) {
    const code = err instanceof Error && "code" in err ? String((err as NodeJS.ErrnoException).code) : "";
    const isNet =
      code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "ETIMEDOUT" || err instanceof TypeError;
    const netMsg =
      code === "ECONNREFUSED" || code === "ENOTFOUND"
        ? "No se pudo conectar con el WMS."
        : err instanceof Error
          ? err.message
          : "Error al conectar con el WMS";

    if (isNet) {
      const fb = await crearCajeroPosViaAdmin({
        idToken,
        email,
        password,
        puntoVenta: puntoVentaEfectivo,
      });
      if (fb.ok) {
        return res.status(200).json({ ok: true, message: fb.message, uid: fb.uid, origen: "firebase" });
      }
      return res.status(200).json({
        ok: false,
        message: `${netMsg} ${fb.message}`,
      });
    }

    return res.status(200).json({
      ok: false,
      message: netMsg + wmsHint,
    });
  }
}
