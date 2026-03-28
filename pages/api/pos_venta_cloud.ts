import type { NextApiRequest, NextApiResponse } from "next";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getFirebaseAdminApp, getCreadorFirestoreContext } from "@/lib/firebase-admin-server";
import { POS_CONTADOR_ROLE } from "@/lib/auth-roles";

const COLLECTION = "posVentasCloud";
const MAX_LINEAS = 200;

function isLinea(x: unknown): boolean {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.lineId === "string" &&
    typeof o.sku === "string" &&
    typeof o.descripcion === "string" &&
    typeof o.cantidad === "number" &&
    Number.isFinite(o.cantidad) &&
    typeof o.precioUnitario === "number" &&
    Number.isFinite(o.precioUnitario)
  );
}

/**
 * Guarda una venta con detalle en Firestore (proyecto del POS en Vercel).
 * Requiere `FIREBASE_SERVICE_ACCOUNT_JSON` en el servidor.
 *
 * El franquiciado y los cajeros del mismo punto de venta consultan con GET `/api/pos_ventas_cloud`.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  const app = getFirebaseAdminApp();
  if (!app) {
    return res.status(503).json({
      ok: false,
      message:
        "Almacenamiento en nube no configurado. En Vercel agrega FIREBASE_SERVICE_ACCOUNT_JSON (mismo proyecto Firebase que el POS).",
    });
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) {
    return res.status(401).json({ ok: false, message: "Falta Authorization Bearer." });
  }

  const ctx = await getCreadorFirestoreContext(app, token);
  if (!ctx.ok) {
    return res.status(401).json({ ok: false, message: ctx.message });
  }
  if (ctx.role === POS_CONTADOR_ROLE) {
    return res.status(403).json({ ok: false, message: "Las cuentas de contador no registran ventas en nube desde este endpoint." });
  }
  if (!ctx.puntoVenta) {
    return res.status(400).json({
      ok: false,
      message: "Tu perfil no tiene punto de venta. Configúralo antes de sincronizar ventas.",
    });
  }

  const b = req.body as Record<string, unknown>;
  const ventaLocalId = typeof b?.ventaLocalId === "string" ? b.ventaLocalId.trim() : "";
  if (ventaLocalId.length < 8 || ventaLocalId.length > 120) {
    return res.status(400).json({ ok: false, message: "ventaLocalId inválido." });
  }

  const puntoVenta = typeof b?.puntoVenta === "string" ? b.puntoVenta.trim() : "";
  if (puntoVenta !== ctx.puntoVenta) {
    return res.status(403).json({
      ok: false,
      message: "El punto de venta del ticket no coincide con tu perfil.",
    });
  }

  const fechaYmd = typeof b?.fechaYmd === "string" ? b.fechaYmd.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaYmd)) {
    return res.status(400).json({ ok: false, message: "fechaYmd inválida." });
  }

  const isoTimestamp = typeof b?.isoTimestamp === "string" ? b.isoTimestamp.trim() : "";
  if (!isoTimestamp || Number.isNaN(Date.parse(isoTimestamp))) {
    return res.status(400).json({ ok: false, message: "isoTimestamp inválido." });
  }

  const total = typeof b?.total === "number" ? b.total : NaN;
  if (!Number.isFinite(total) || total <= 0 || total > 5e9) {
    return res.status(400).json({ ok: false, message: "total inválido." });
  }

  const lineas = Array.isArray(b?.lineas) ? b.lineas : null;
  if (!lineas || lineas.length === 0 || lineas.length > MAX_LINEAS || !lineas.every(isLinea)) {
    return res.status(400).json({ ok: false, message: "lineas inválidas o demasiadas." });
  }

  const wmsSincronizado = b?.wmsSincronizado === true;

  const doc: Record<string, unknown> = {
    ventaLocalId,
    uidRegistro: ctx.uid,
    puntoVenta,
    fechaYmd,
    isoTimestamp,
    total: Math.round(total * 100) / 100,
    lineas,
    wmsSincronizado,
    serverCreatedAt: FieldValue.serverTimestamp(),
  };

  if (typeof b?.turnoSesionId === "string" && b.turnoSesionId.trim()) {
    doc.turnoSesionId = b.turnoSesionId.trim().slice(0, 120);
  }
  if (typeof b?.cajeroTurnoId === "string" && b.cajeroTurnoId.trim()) {
    doc.cajeroTurnoId = b.cajeroTurnoId.trim().slice(0, 120);
  }
  if (typeof b?.cajeroNombre === "string" && b.cajeroNombre.trim()) {
    doc.cajeroNombre = b.cajeroNombre.trim().slice(0, 200);
  }
  if (typeof b?.pagoResumen === "string" && b.pagoResumen.trim()) {
    doc.pagoResumen = b.pagoResumen.trim().slice(0, 4000);
  }
  if (b?.mediosPago && typeof b.mediosPago === "object") {
    doc.mediosPago = b.mediosPago;
  }

  try {
    const db = getFirestore(app);
    await db.collection(COLLECTION).doc(ventaLocalId).set(doc, { merge: true });
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("pos_venta_cloud", e);
    return res.status(500).json({ ok: false, message: "No se pudo guardar la venta en Firestore." });
  }
}
