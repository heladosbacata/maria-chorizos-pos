import type { NextApiRequest, NextApiResponse } from "next";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getFirebaseAdminApp, getCreadorFirestoreContext } from "@/lib/firebase-admin-server";
import { POS_CONTADOR_ROLE } from "@/lib/auth-roles";
import {
  construirCorreoComprobantePos,
  emailComprobanteValido,
  type LineaComprobanteCorreo,
} from "@/lib/comprobante-correo-pos";
import { enviarCorreoTransaccionalPos } from "@/lib/email-pos-transaccional";

const COLLECTION = "posVentasCloud";
const MAX_LINEAS = 200;

function isLinea(x: unknown): x is LineaComprobanteCorreo {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.descripcion === "string" &&
    typeof o.cantidad === "number" &&
    Number.isFinite(o.cantidad) &&
    typeof o.precioUnitario === "number" &&
    Number.isFinite(o.precioUnitario)
  );
}

/**
 * POST: envía por correo el resumen de un comprobante POS (factura FE, recibo, cotización o remisión).
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
        "Firebase Admin no configurado (FIREBASE_SERVICE_ACCOUNT_JSON). Sin esto no se valida la sesión para enviar correo.",
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
    return res.status(403).json({ ok: false, message: "Las cuentas de contador no envían comprobantes desde este endpoint." });
  }
  if (!ctx.puntoVenta) {
    return res.status(400).json({
      ok: false,
      message: "Tu perfil no tiene punto de venta configurado.",
    });
  }

  const b = req.body as Record<string, unknown>;
  const to = typeof b?.to === "string" ? b.to.trim() : "";
  if (!emailComprobanteValido(to)) {
    return res.status(400).json({ ok: false, message: "Correo del destinatario inválido." });
  }

  const puntoVenta = typeof b?.puntoVenta === "string" ? b.puntoVenta.trim() : "";
  if (puntoVenta !== ctx.puntoVenta) {
    return res.status(403).json({ ok: false, message: "El punto de venta no coincide con tu perfil." });
  }

  const comprobante = typeof b?.comprobante === "string" ? b.comprobante.trim().slice(0, 80) : "";
  const tipoLabel = typeof b?.tipoLabel === "string" ? b.tipoLabel.trim().slice(0, 120) : "";
  const fechaIso = typeof b?.fechaIso === "string" ? b.fechaIso.trim() : "";
  if (!comprobante || !tipoLabel || !fechaIso || Number.isNaN(Date.parse(fechaIso))) {
    return res.status(400).json({ ok: false, message: "Faltan datos del comprobante (comprobante, tipoLabel, fechaIso)." });
  }

  const total = typeof b?.total === "number" ? b.total : NaN;
  if (!Number.isFinite(total) || total < 0 || total > 5e9) {
    return res.status(400).json({ ok: false, message: "total inválido." });
  }

  const lineas = Array.isArray(b?.lineas) ? b.lineas : null;
  if (!lineas || lineas.length === 0 || lineas.length > MAX_LINEAS || !lineas.every(isLinea)) {
    return res.status(400).json({ ok: false, message: "lineas inválidas." });
  }

  const ventaLocalId = typeof b?.ventaLocalId === "string" ? b.ventaLocalId.trim() : "";
  if (ventaLocalId && (ventaLocalId.length < 8 || ventaLocalId.length > 120)) {
    return res.status(400).json({ ok: false, message: "ventaLocalId inválido." });
  }

  const clienteNombre = typeof b?.clienteNombre === "string" ? b.clienteNombre.trim().slice(0, 200) : undefined;
  const clienteNit = typeof b?.clienteNit === "string" ? b.clienteNit.trim().slice(0, 40) : undefined;
  const mensaje = typeof b?.mensaje === "string" ? b.mensaje.trim().slice(0, 2000) : undefined;

  let facturaElectronica: { numero?: string; cufe?: string } | undefined;
  if (b?.facturaElectronica && typeof b.facturaElectronica === "object") {
    const fe = b.facturaElectronica as Record<string, unknown>;
    const numero = typeof fe.numero === "string" ? fe.numero.trim().slice(0, 80) : undefined;
    const cufe = typeof fe.cufe === "string" ? fe.cufe.trim().slice(0, 200) : undefined;
    if (numero || cufe) facturaElectronica = { ...(numero ? { numero } : {}), ...(cufe ? { cufe } : {}) };
  }

  if (ventaLocalId) {
    const db = getFirestore(app);
    const snap = await db.collection(COLLECTION).doc(ventaLocalId).get();
    if (snap.exists) {
      const data = snap.data();
      const pvDoc = typeof data?.puntoVenta === "string" ? data.puntoVenta.trim() : "";
      if (pvDoc !== ctx.puntoVenta) {
        return res.status(403).json({ ok: false, message: "El comprobante no pertenece a tu punto de venta." });
      }
    }
  }

  const { subject, text, html } = construirCorreoComprobantePos({
    comprobante,
    tipoLabel,
    total: Math.round(total * 100) / 100,
    fechaIso,
    puntoVenta,
    lineas,
    clienteNombre,
    clienteNit,
    facturaElectronica,
    mensaje,
  });

  const envio = await enviarCorreoTransaccionalPos({ to, subject, text, html });
  if (!envio.ok) {
    return res.status(502).json({ ok: false, message: envio.error });
  }

  const enviadoAt = new Date().toISOString();

  if (ventaLocalId) {
    try {
      const db = getFirestore(app);
      const patch: Record<string, unknown> = {
        comprobanteEmailEnviadoAt: enviadoAt,
        comprobanteEmailDestino: to,
        serverComprobanteEmailAt: FieldValue.serverTimestamp(),
      };
      if (clienteNombre) patch.clienteNombreVenta = clienteNombre;
      if (clienteNit) patch.clienteNitVenta = clienteNit;
      if (facturaElectronica?.numero) patch.facturaElectronicaNumero = facturaElectronica.numero;
      if (facturaElectronica?.cufe) patch.facturaElectronicaCufe = facturaElectronica.cufe;
      await db.collection(COLLECTION).doc(ventaLocalId).set(patch, { merge: true });
    } catch (e) {
      console.error("pos_comprobante_enviar_correo: no se pudo persistir en Firestore", e);
    }
  }

  return res.status(200).json({ ok: true, via: envio.via, enviadoAt, destino: to });
}
