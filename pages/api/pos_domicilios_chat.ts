import type { NextApiRequest, NextApiResponse } from "next";
import { enviarMensajeChatPersistente, listarMensajesChatPersistente } from "@/lib/pos-domicilios-firestore-store";
import type {
  ChatDomicilioEnviarPayload,
  ChatDomicilioEnviarResponse,
  ChatDomicilioListadoResponse,
} from "@/types/pos-domicilios-chat";

function normalizarTexto(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function asBody(body: unknown): ChatDomicilioEnviarPayload {
  if (body && typeof body === "object") {
    const o = body as Record<string, unknown>;
    return {
      puntoVenta: normalizarTexto(o.puntoVenta),
      pedidoId: normalizarTexto(o.pedidoId),
      autor: o.autor === "cliente" ? "cliente" : "pos",
      autorLabel: normalizarTexto(o.autorLabel),
      texto: normalizarTexto(o.texto),
    };
  }
  return {
    puntoVenta: "",
    pedidoId: "",
    autor: "cliente",
    autorLabel: "",
    texto: "",
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ChatDomicilioListadoResponse | ChatDomicilioEnviarResponse>
) {
  if (req.method === "GET") {
    const puntoVenta = normalizarTexto(req.query.puntoVenta);
    const pedidoId = normalizarTexto(req.query.pedidoId);
    if (!puntoVenta || !pedidoId) {
      return res.status(400).json({ ok: false, data: [], message: "puntoVenta y pedidoId son obligatorios." });
    }
    const data = await listarMensajesChatPersistente(puntoVenta, pedidoId);
    return res.status(200).json({ ok: true, data });
  }

  if (req.method === "POST") {
    const payload = asBody(req.body);
    if (!payload.puntoVenta || !payload.pedidoId || !payload.texto) {
      return res.status(400).json({ ok: false, message: "Datos incompletos para enviar el mensaje." });
    }
    const texto = payload.texto.slice(0, 800);
    const autorLabel =
      payload.autorLabel?.trim() ||
      (payload.autor === "cliente" ? "Cliente" : "POS");
    const mensaje = await enviarMensajeChatPersistente({
      ...payload,
      autorLabel,
      texto,
    });
    if (!mensaje) {
      return res.status(400).json({ ok: false, message: "No fue posible enviar el mensaje." });
    }
    return res.status(200).json({ ok: true, mensaje, message: "Mensaje enviado." });
  }

  return res.status(405).json({ ok: false, message: "Method not allowed" });
}
