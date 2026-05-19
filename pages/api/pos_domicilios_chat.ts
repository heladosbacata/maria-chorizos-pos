import type { NextApiRequest, NextApiResponse } from "next";
import { enviarMensajeChatPersistente, listarMensajesChatPersistente } from "@/lib/pos-domicilios-firestore-store";
import type {
  ChatDomicilioEnviarPayload,
  ChatDomicilioEnviarResponse,
  ChatDomicilioListadoResponse,
  RespuestaRapidaDomicilioId,
  TipoMensajeChatDomicilio,
} from "@/types/pos-domicilios-chat";

const MAX_ADJUNTO_CHARS = 290_000;
const MAX_TEXTO_CHAT = 800;

function normalizarTexto(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function asBody(body: unknown): ChatDomicilioEnviarPayload {
  if (body && typeof body === "object") {
    const o = body as Record<string, unknown>;
    const tm = o.tipoMensaje;
    const tipoMensaje: TipoMensajeChatDomicilio | undefined =
      tm === "texto" || tm === "respuesta_rapida" || tm === "comprobante" ? tm : undefined;
    const rr = o.respuestaRapidaId;
    const respuestaRapidaId: RespuestaRapidaDomicilioId | undefined =
      rr === "confirmado" || rr === "modificar" || rr === "anular" ? rr : undefined;
    return {
      puntoVenta: normalizarTexto(o.puntoVenta),
      pedidoId: normalizarTexto(o.pedidoId),
      autor: o.autor === "cliente" ? "cliente" : "pos",
      autorLabel: normalizarTexto(o.autorLabel),
      texto: normalizarTexto(o.texto),
      tipoMensaje,
      respuestaRapidaId,
      adjuntoDataUrl: normalizarTexto(o.adjuntoDataUrl),
      adjuntoNombre: normalizarTexto(o.adjuntoNombre),
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
    const adjunto = payload.adjuntoDataUrl?.trim() ?? "";
    if (adjunto.length > MAX_ADJUNTO_CHARS) {
      return res.status(400).json({
        ok: false,
        message: "La imagen del comprobante es demasiado grande. Probá con otra foto o comprimila más.",
      });
    }
    if (adjunto && !/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(adjunto)) {
      return res.status(400).json({
        ok: false,
        message: "Formato de imagen no admitido. Usá JPG, PNG o WebP.",
      });
    }
    let texto = payload.texto.trim().slice(0, MAX_TEXTO_CHAT);
    if (!texto && adjunto) {
      texto = "Comprobante de pago (transferencia).";
    }
    if (!payload.puntoVenta || !payload.pedidoId || (!texto && !adjunto)) {
      return res.status(400).json({ ok: false, message: "Datos incompletos para enviar el mensaje." });
    }
    const autorLabel =
      payload.autorLabel?.trim() ||
      (payload.autor === "cliente" ? "Cliente" : "POS");
    const adjuntoNombre = payload.adjuntoNombre?.trim().slice(0, 120) || undefined;
    const mensaje = await enviarMensajeChatPersistente({
      ...payload,
      autorLabel,
      texto,
      adjuntoDataUrl: adjunto || undefined,
      adjuntoNombre: adjunto ? adjuntoNombre : undefined,
    });
    if (!mensaje) {
      return res.status(400).json({ ok: false, message: "No fue posible enviar el mensaje." });
    }
    return res.status(200).json({ ok: true, mensaje, message: "Mensaje enviado." });
  }

  return res.status(405).json({ ok: false, message: "Method not allowed" });
}
