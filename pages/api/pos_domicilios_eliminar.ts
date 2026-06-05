import type { NextApiRequest, NextApiResponse } from "next";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getFirebaseAdminApp } from "@/lib/firebase-admin-server";
import { eliminarPedidosRechazadosPersistente } from "@/lib/pos-domicilios-firestore-store";
import { CLAVE_ESPACIO_FRANQUICIADOS } from "@/lib/pos-domicilios-medios-transferencia";
import { puntoVentaFirestoreClave as normPv } from "@/lib/pos-domicilios-pv-clave";
import type { DomicilioEliminarRechazadoResponse } from "@/types/pos-domicilios";

async function leerPuntoVentaUsuario(app: NonNullable<ReturnType<typeof getFirebaseAdminApp>>, uid: string): Promise<string | null> {
  const db = getFirestore(app);
  const snap = await db.collection("users").doc(uid).get();
  const raw = snap.data()?.puntoVenta;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<DomicilioEliminarRechazadoResponse>) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  const app = getFirebaseAdminApp();
  if (!app) {
    return res.status(503).json({ ok: false, message: "Firebase Admin no configurado." });
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) {
    return res.status(401).json({ ok: false, message: "Falta Authorization Bearer (sesión del cajero)." });
  }

  let uid: string;
  try {
    const decoded = await getAuth(app).verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return res.status(401).json({ ok: false, message: "Sesión inválida o token expirado." });
  }

  const body = (typeof req.body === "object" && req.body !== null ? req.body : {}) as Record<string, unknown>;
  const puntoVenta = typeof body.puntoVenta === "string" ? body.puntoVenta.trim() : "";
  const clave = typeof body.claveEspacioFranquiciados === "string" ? body.claveEspacioFranquiciados.trim() : "";
  const limpiarTodos = body.limpiarTodosRechazados === true;
  const pedidoId = typeof body.pedidoId === "string" ? body.pedidoId.trim() : "";

  if (!puntoVenta) {
    return res.status(400).json({ ok: false, message: "puntoVenta es obligatorio." });
  }
  if (clave !== CLAVE_ESPACIO_FRANQUICIADOS) {
    return res.status(403).json({ ok: false, message: "Clave incorrecta. Usá la de Espacio para franquiciados." });
  }
  if (!limpiarTodos && !pedidoId) {
    return res.status(400).json({ ok: false, message: "Indicá pedidoId o limpiarTodosRechazados." });
  }

  const pvUsuario = await leerPuntoVentaUsuario(app, uid);
  if (!pvUsuario) {
    return res.status(403).json({ ok: false, message: "Tu usuario no tiene punto de venta asignado." });
  }
  if (normPv(pvUsuario) !== normPv(puntoVenta)) {
    return res.status(403).json({ ok: false, message: "No podés eliminar pedidos de otro punto de venta." });
  }

  try {
    const eliminados = await eliminarPedidosRechazadosPersistente({
      puntoVenta,
      pedidoId: limpiarTodos ? undefined : pedidoId,
      limpiarTodos,
    });
    if (eliminados === 0) {
      return res.status(404).json({ ok: false, message: "No se encontró pedido rechazado para eliminar." });
    }
    return res.status(200).json({
      ok: true,
      eliminados,
      message: limpiarTodos
        ? `Se eliminaron ${eliminados} pedido(s) rechazado(s) del historial.`
        : `Pedido ${pedidoId} eliminado del historial.`,
    });
  } catch (e) {
    console.error("[pos_domicilios_eliminar]", e);
    return res.status(500).json({ ok: false, message: "Error interno al eliminar pedido(s)." });
  }
}
