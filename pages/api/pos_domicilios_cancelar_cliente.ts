import type { NextApiRequest, NextApiResponse } from "next";
import {
  actualizarEstadoPedidoPersistente,
  enviarMensajeChatPersistente,
  obtenerPedidoDomicilioPersistente,
} from "@/lib/pos-domicilios-firestore-store";
import { notificarCambioEstadoPedidoDomicilioWebPush } from "@/lib/pos-domicilios-push-notify";
import type { DomicilioCambioEstadoResponse } from "@/types/pos-domicilios";
import { pedidoPuedeCancelarsePorCliente } from "@/types/pos-domicilios";

type CancelarClienteBody = {
  puntoVenta?: string;
  pedidoId?: string;
  motivo?: string;
};

function asBody(body: unknown): CancelarClienteBody {
  if (body && typeof body === "object") {
    const o = body as Record<string, unknown>;
    return {
      puntoVenta: typeof o.puntoVenta === "string" ? o.puntoVenta : "",
      pedidoId: typeof o.pedidoId === "string" ? o.pedidoId : "",
      motivo: typeof o.motivo === "string" ? o.motivo : undefined,
    };
  }
  return {};
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<DomicilioCambioEstadoResponse>) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  const payload = asBody(req.body);
  const pv = payload.puntoVenta?.trim() ?? "";
  const pedidoId = payload.pedidoId?.trim() ?? "";
  if (!pv || !pedidoId) {
    return res.status(400).json({ ok: false, message: "puntoVenta y pedidoId son obligatorios." });
  }

  const actual = await obtenerPedidoDomicilioPersistente(pv, pedidoId);
  if (!actual) {
    return res.status(404).json({ ok: false, message: "Pedido no encontrado." });
  }
  if (!pedidoPuedeCancelarsePorCliente(actual.estado)) {
    return res.status(400).json({
      ok: false,
      message:
        actual.estado === "CANCELADO"
          ? "Este pedido ya fue cancelado."
          : actual.estado === "RECHAZADO"
            ? "Este pedido ya fue rechazado por el punto de venta."
            : actual.estado === "ENTREGADO"
              ? "No podés cancelar un pedido ya entregado."
              : "Este pedido ya está en camino y no se puede cancelar desde aquí. Escribí al punto por el chat.",
    });
  }

  const motivo = payload.motivo?.trim() || "Cancelado por el cliente";
  const pedido = await actualizarEstadoPedidoPersistente({
    puntoVenta: pv,
    pedidoId,
    estado: "CANCELADO",
    motivo,
  });
  if (!pedido) {
    return res.status(404).json({ ok: false, message: "No fue posible cancelar el pedido." });
  }

  const textoChat =
    motivo === "Cancelado por el cliente"
      ? "Cancelé mi pedido desde la app."
      : `Cancelé mi pedido. Motivo: ${motivo}`;
  await enviarMensajeChatPersistente({
    puntoVenta: pv,
    pedidoId,
    autor: "cliente",
    autorLabel: actual.cliente || "Cliente",
    texto: textoChat,
    tipoMensaje: "texto",
  });

  void notificarCambioEstadoPedidoDomicilioWebPush({
    puntoVenta: pv,
    pedidoId,
    estado: pedido.estado,
  }).catch(() => undefined);

  return res.status(200).json({ ok: true, pedido, message: "Pedido cancelado." });
}
