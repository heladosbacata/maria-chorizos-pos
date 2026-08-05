import type { NextApiRequest, NextApiResponse } from "next";
import { marcarPedidoDomicilioFacturacionPersistente } from "@/lib/pos-domicilios-firestore-store";
import { pedidoIdChatClave } from "@/lib/pos-domicilios-pv-clave";

type Body = {
  puntoVenta?: string;
  pedidoId?: string;
  facturaVentaLocalId?: string;
  enviadoAFacturacionEnIso?: string;
  facturaElectronicaCufe?: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ ok: boolean; message?: string; pedido?: unknown }>
) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }
  const body = (req.body && typeof req.body === "object" ? req.body : {}) as Body;
  const puntoVenta = typeof body.puntoVenta === "string" ? body.puntoVenta.trim() : "";
  const pedidoId = pedidoIdChatClave(typeof body.pedidoId === "string" ? body.pedidoId : "");
  const facturaVentaLocalId =
    typeof body.facturaVentaLocalId === "string" ? body.facturaVentaLocalId.trim() : "";
  const enviadoAFacturacionEnIso =
    typeof body.enviadoAFacturacionEnIso === "string" && body.enviadoAFacturacionEnIso.trim()
      ? body.enviadoAFacturacionEnIso.trim()
      : new Date().toISOString();
  const facturaElectronicaCufe =
    typeof body.facturaElectronicaCufe === "string" && body.facturaElectronicaCufe.trim()
      ? body.facturaElectronicaCufe.trim()
      : undefined;

  if (!puntoVenta || !pedidoId || !facturaVentaLocalId) {
    return res.status(400).json({
      ok: false,
      message: "puntoVenta, pedidoId y facturaVentaLocalId son obligatorios.",
    });
  }

  const pedido = await marcarPedidoDomicilioFacturacionPersistente({
    puntoVenta,
    pedidoId,
    facturaVentaLocalId,
    enviadoAFacturacionEnIso,
    facturaElectronicaCufe,
  });
  if (!pedido) {
    return res.status(404).json({ ok: false, message: "Pedido no encontrado." });
  }
  return res.status(200).json({ ok: true, pedido, message: "Pedido marcado en facturación." });
}
