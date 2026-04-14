import type { NextApiRequest, NextApiResponse } from "next";
import { actualizarEstadoPedidoPersistente } from "@/lib/pos-domicilios-firestore-store";
import type {
  DomicilioCambioEstadoPayload,
  DomicilioCambioEstadoResponse,
  EstadoDomicilio,
} from "@/types/pos-domicilios";

const ESTADOS_VALIDOS: EstadoDomicilio[] = [
  "NUEVO",
  "ACEPTADO",
  "EN_PREPARACION",
  "LISTO_PARA_DESPACHO",
  "EN_ENTREGA",
  "ENTREGADO",
  "RECHAZADO",
];

function asBody(body: unknown): DomicilioCambioEstadoPayload {
  if (body && typeof body === "object") {
    const o = body as Record<string, unknown>;
    return {
      puntoVenta: typeof o.puntoVenta === "string" ? o.puntoVenta : "",
      pedidoId: typeof o.pedidoId === "string" ? o.pedidoId : "",
      estado: typeof o.estado === "string" ? (o.estado as EstadoDomicilio) : "NUEVO",
      motivo: typeof o.motivo === "string" ? o.motivo : undefined,
    };
  }
  return { puntoVenta: "", pedidoId: "", estado: "NUEVO", motivo: undefined };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<DomicilioCambioEstadoResponse>) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }
  const payload = asBody(req.body);
  const pv = payload.puntoVenta.trim();
  const pedidoId = payload.pedidoId.trim();
  if (!pv || !pedidoId) {
    return res.status(400).json({ ok: false, message: "puntoVenta y pedidoId son obligatorios." });
  }
  if (!ESTADOS_VALIDOS.includes(payload.estado)) {
    return res.status(400).json({ ok: false, message: "Estado de pedido inválido." });
  }
  if (payload.estado === "RECHAZADO" && !(payload.motivo ?? "").trim()) {
    return res.status(400).json({ ok: false, message: "Debes indicar un motivo de rechazo." });
  }
  const pedido = await actualizarEstadoPedidoPersistente({
    puntoVenta: pv,
    pedidoId,
    estado: payload.estado,
    motivo: payload.motivo,
  });
  if (!pedido) {
    return res.status(404).json({ ok: false, message: "Pedido no encontrado." });
  }
  return res.status(200).json({ ok: true, pedido, message: "Estado actualizado." });
}
