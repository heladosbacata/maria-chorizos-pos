import { timingSafeEqual } from "crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import { getFirebaseAdminApp, provisionUsuarioPosDesdeWms } from "@/lib/firebase-admin-server";

/**
 * Provisionado WMS → Firebase (server-to-server).
 *
 * Cuando en el WMS das de alta o modificas un usuario POS, el WMS debe llamar a este endpoint
 * para crear o actualizar la misma cuenta en Firebase Auth y en `users/{uid}` (punto de venta, rol).
 *
 * Autenticación: header `Authorization: Bearer <POS_WMS_PROVISION_SECRET>` (mismo valor en Vercel WMS y POS).
 *
 * Cuerpo JSON (POST):
 * - `email` (obligatorio)
 * - `puntoVenta` (obligatorio)
 * - `password` (obligatorio si el correo aún no existe en Firebase)
 * - `role` (opcional): `pos` | `pos_contador` (defecto `pos`)
 * - `disabled` (opcional): `false` para habilitar, `true` para suspender el login
 * - `displayName` (opcional)
 *
 * Ejemplo (desde el WMS, tras crear el cajero en tu base):
 * curl -X POST "https://<tu-pos>.vercel.app/api/wms_provision_usuario" \
 *   -H "Authorization: Bearer $POS_WMS_PROVISION_SECRET" \
 *   -H "Content-Type: application/json" \
 *   -d '{"email":"cajero@ejemplo.com","password":"********","puntoVenta":"PV-01","disabled":false}'
 */
function bearerSecretMatches(expected: string, authHeader: string | undefined): boolean {
  if (!authHeader?.startsWith("Bearer ")) return false;
  const got = authHeader.slice(7).trim();
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(got, "utf8");
  if (a.length !== b.length || a.length === 0) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  const expected = process.env.POS_WMS_PROVISION_SECRET?.trim();
  if (!expected || expected.length < 16) {
    return res.status(503).json({
      ok: false,
      message:
        "Provisionado WMS→Firebase no configurado. En Vercel del POS define POS_WMS_PROVISION_SECRET (mín. 16 caracteres) y FIREBASE_SERVICE_ACCOUNT_JSON.",
    });
  }

  if (!bearerSecretMatches(expected, req.headers.authorization)) {
    return res.status(401).json({ ok: false, message: "No autorizado." });
  }

  if (!getFirebaseAdminApp()) {
    return res.status(503).json({
      ok: false,
      message: "Falta FIREBASE_SERVICE_ACCOUNT_JSON en el servidor del POS.",
    });
  }

  const b = req.body as Record<string, unknown>;
  const email = typeof b?.email === "string" ? b.email : "";
  const password = typeof b?.password === "string" ? b.password : undefined;
  const puntoVenta = typeof b?.puntoVenta === "string" ? b.puntoVenta.trim() : "";
  const role = typeof b?.role === "string" ? b.role : undefined;
  const displayName = typeof b?.displayName === "string" ? b.displayName : undefined;
  const disabled = typeof b?.disabled === "boolean" ? b.disabled : undefined;

  const r = await provisionUsuarioPosDesdeWms({
    email,
    ...(password !== undefined ? { password } : {}),
    puntoVenta,
    ...(role !== undefined ? { role } : {}),
    ...(displayName !== undefined ? { displayName } : {}),
    ...(disabled !== undefined ? { disabled } : {}),
  });

  if (!r.ok) {
    return res.status(400).json({ ok: false, message: r.message });
  }

  return res.status(200).json({
    ok: true,
    uid: r.uid,
    created: r.created,
    message: r.message,
  });
}
