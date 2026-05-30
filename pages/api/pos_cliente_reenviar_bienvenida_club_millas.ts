import type { NextApiRequest, NextApiResponse } from "next";
import { getFirestore } from "firebase-admin/firestore";
import { getFirebaseAdminApp, getCreadorFirestoreContext } from "@/lib/firebase-admin-server";
import { POS_CONTADOR_ROLE } from "@/lib/auth-roles";
import {
  aplicarBienvenidaClubMillasACliente,
  type ClientePosFirestoreLike,
} from "@/lib/pos-cliente-club-millas-bienvenida";

type Ok = {
  ok: true;
  pin: string;
  correoEnviado: boolean;
  wmsSincronizado: boolean;
  correoError?: string;
  wmsError?: string;
};
type Err = { ok: false; message: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<Ok | Err>) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  const app = getFirebaseAdminApp();
  if (!app) {
    return res.status(503).json({ ok: false, message: "FIREBASE_SERVICE_ACCOUNT_JSON no configurada." });
  }

  const token = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7).trim()
    : "";
  if (!token) {
    return res.status(401).json({ ok: false, message: "Falta Authorization Bearer." });
  }

  const ctx = await getCreadorFirestoreContext(app, token);
  if (!ctx.ok) {
    return res.status(401).json({ ok: false, message: ctx.message });
  }
  if (ctx.role === POS_CONTADOR_ROLE) {
    return res.status(403).json({ ok: false, message: "Las cuentas de contador no pueden reenviar bienvenida." });
  }

  const clienteId = typeof (req.body as { clienteId?: unknown })?.clienteId === "string"
    ? (req.body as { clienteId: string }).clienteId.trim()
    : "";
  if (!clienteId) {
    return res.status(400).json({ ok: false, message: "Indica clienteId." });
  }

  try {
    const db = getFirestore(app);
    const ref = db.collection("posClientes").doc(clienteId);
    const snap = await ref.get();
    if (!snap.exists) {
      return res.status(404).json({ ok: false, message: "Cliente no encontrado." });
    }
    const data = snap.data() as ClientePosFirestoreLike;
    if (ctx.puntoVenta && data.puntoVenta?.trim() && data.puntoVenta.trim() !== ctx.puntoVenta) {
      return res.status(403).json({ ok: false, message: "Este cliente pertenece a otro punto de venta." });
    }

    const r = await aplicarBienvenidaClubMillasACliente(ref, data);
    if (!r.ok) {
      return res.status(400).json({ ok: false, message: r.error });
    }

    return res.status(200).json({
      ok: true,
      pin: r.pin,
      correoEnviado: r.correoEnviado,
      wmsSincronizado: r.wmsSincronizado,
      ...(r.correoError ? { correoError: r.correoError } : {}),
      ...(r.wmsError ? { wmsError: r.wmsError } : {}),
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      message: e instanceof Error ? e.message : "No se pudo reenviar la bienvenida.",
    });
  }
}
