import type { NextApiRequest, NextApiResponse } from "next";
import { getFirestore } from "firebase-admin/firestore";
import { getCreadorFirestoreContext, getFirebaseAdminApp } from "@/lib/firebase-admin-server";
import { POS_CONTADOR_ROLE } from "@/lib/auth-roles";
import { PROMO_HALLOWEEN_CUPO_MAX } from "@/lib/promo-halloween-pos";
import { aplicarMovimientoCupoPromo, leerCupoPromoHalloweenAdmin } from "@/lib/promo-halloween-cupo-admin";

/**
 * Cupo de la promo Halloween por punto de venta.
 * GET: unidades que aún se pueden vender.
 * POST { accion: "consumir" | "devolver", ventaId, cantidad }: descuenta al cobrar o devuelve al anular.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ ok: false, message: "Method not allowed", disponibles: 0 });
  }

  const app = getFirebaseAdminApp();
  if (!app) {
    return res.status(503).json({
      ok: false,
      disponibles: 0,
      message: "FIREBASE_SERVICE_ACCOUNT_JSON no está configurada en el servidor.",
    });
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) {
    return res.status(401).json({ ok: false, disponibles: 0, message: "Falta Authorization Bearer." });
  }

  const ctx = await getCreadorFirestoreContext(app, token);
  if (!ctx.ok) {
    return res.status(401).json({ ok: false, disponibles: 0, message: ctx.message });
  }
  if (!ctx.puntoVenta) {
    return res.status(400).json({
      ok: false,
      disponibles: 0,
      message: "Tu perfil no tiene punto de venta.",
    });
  }

  const db = getFirestore(app);
  if (req.method === "GET") {
    const lectura = await leerCupoPromoHalloweenAdmin(db, ctx.puntoVenta);
    return res.status(200).json(lectura);
  }

  if (ctx.role === POS_CONTADOR_ROLE) {
    return res.status(403).json({
      ok: false,
      disponibles: 0,
      message: "Las cuentas de contador no pueden vender la promo.",
    });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const accion = body.accion === "devolver" ? "devolver" : body.accion === "consumir" ? "consumir" : "";
  const ventaId = typeof body.ventaId === "string" ? body.ventaId.trim() : "";
  const cantidad = Math.round(Number(body.cantidad));
  if (!accion || !ventaId || !(cantidad > 0) || cantidad > PROMO_HALLOWEEN_CUPO_MAX) {
    return res.status(400).json({
      ok: false,
      disponibles: 0,
      message: "Datos de la promo incompletos.",
    });
  }

  const resultado = await aplicarMovimientoCupoPromo(db, {
    puntoVenta: ctx.puntoVenta,
    ventaId,
    cantidad,
    accion,
  });
  return res.status(resultado.ok ? 200 : 409).json(resultado);
}
