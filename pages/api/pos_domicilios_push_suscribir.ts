import type { NextApiRequest, NextApiResponse } from "next";
import { guardarSuscripcionPushCliente, type PushSubscriptionJsonCliente } from "@/lib/pos-domicilios-push-subscriptions";

function isWebPushDomiciliosConfigurado(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() && process.env.VAPID_PRIVATE_KEY?.trim());
}

type Body = {
  puntoVenta?: string;
  pedidoId?: string;
  subscription?: PushSubscriptionJsonCliente;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse<{ ok: boolean; message?: string }>) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }
  if (!isWebPushDomiciliosConfigurado()) {
    return res.status(503).json({ ok: false, message: "Las notificaciones push no están configuradas en el servidor." });
  }

  const body = (req.body && typeof req.body === "object" ? req.body : {}) as Body;
  const puntoVenta = typeof body.puntoVenta === "string" ? body.puntoVenta.trim() : "";
  const pedidoId = typeof body.pedidoId === "string" ? body.pedidoId.trim() : "";
  const subscription = body.subscription;

  if (!puntoVenta || !pedidoId || !subscription || typeof subscription !== "object") {
    return res.status(400).json({ ok: false, message: "puntoVenta, pedidoId y subscription son obligatorios." });
  }

  const r = await guardarSuscripcionPushCliente({ puntoVenta, pedidoId, subscription });
  if (!r.ok) {
    return res.status(400).json({ ok: false, message: r.message ?? "No se pudo guardar la suscripción." });
  }
  return res.status(200).json({ ok: true, message: "Avisos activados para este pedido." });
}
