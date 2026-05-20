import type { EstadoDomicilio } from "@/types/pos-domicilios";
import { pedidoIdChatClave } from "@/lib/pos-domicilios-pv-clave";
import {
  eliminarSuscripcionPushPorDocId,
  listarSuscripcionesPushPorPedido,
} from "@/lib/pos-domicilios-push-subscriptions";

type WebPushModule = typeof import("web-push");

async function webPushLib(): Promise<WebPushModule["default"] | null> {
  try {
    const mod = (await import("web-push")) as WebPushModule;
    return mod.default;
  } catch {
    return null;
  }
}

export function isWebPushDomiciliosConfigurado(): boolean {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const priv = process.env.VAPID_PRIVATE_KEY?.trim();
  return Boolean(pub && priv);
}

function cuerpoNotificacionEstado(estado: EstadoDomicilio): string {
  switch (estado) {
    case "NUEVO":
      return "Tu pedido fue recibido.";
    case "ACEPTADO":
      return "¡Pedido aceptado! Ya avanzamos con tu orden.";
    case "EN_PREPARACION":
      return "Estamos preparando tu pedido.";
    case "LISTO_PARA_DESPACHO":
      return "Tu pedido está listo para despacho.";
    case "EN_ENTREGA":
      return "¡Va en camino! Pronto llega.";
    case "ENTREGADO":
      return "¡Pedido entregado! Gracias por elegirnos.";
    case "RECHAZADO":
      return "Tu pedido no pudo continuar. Revisá el detalle en la app.";
    default:
      return "Hay una novedad con tu pedido.";
  }
}

/**
 * Envía Web Push a todas las suscripciones del pedido (cliente en /pedidos).
 * No lanza si faltan claves VAPID; ignora fallos por suscripción inválida.
 */
export async function notificarCambioEstadoPedidoDomicilioWebPush(params: {
  puntoVenta: string;
  pedidoId: string;
  estado: EstadoDomicilio;
}): Promise<void> {
  if (!isWebPushDomiciliosConfigurado()) return;
  const webpush = await webPushLib();
  if (!webpush) return;

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY!.trim();
  const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:notificaciones@mariachorizos.com";

  webpush.setVapidDetails(subject, publicKey, privateKey);

  const titulo = "Maria Chorizos — tu pedido";
  const body = cuerpoNotificacionEstado(params.estado);
  const qs = new URLSearchParams({
    puntoVenta: params.puntoVenta.trim(),
    pedidoId: pedidoIdChatClave(params.pedidoId),
  }).toString();
  const url = `/pedidos?${qs}`;
  const payload = JSON.stringify({ title: titulo, body, url });

  const registros = await listarSuscripcionesPushPorPedido(params.puntoVenta, params.pedidoId);
  if (registros.length === 0) return;

  await Promise.allSettled(
    registros.map(async (rec) => {
      try {
        await webpush.sendNotification(rec.subscription, payload, {
          TTL: 86_400,
          urgency: "high",
        });
      } catch (err: unknown) {
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) {
          await eliminarSuscripcionPushPorDocId(rec.id);
        }
      }
    })
  );
}

/** Aviso al cliente cuando el POS escribe en el chat del pedido. */
export async function notificarNuevoMensajeChatPedidoDomicilioWebPush(params: {
  puntoVenta: string;
  pedidoId: string;
  preview: string;
}): Promise<void> {
  if (!isWebPushDomiciliosConfigurado()) return;
  const webpush = await webPushLib();
  if (!webpush) return;

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY!.trim();
  const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:notificaciones@mariachorizos.com";

  webpush.setVapidDetails(subject, publicKey, privateKey);

  const titulo = "Maria Chorizos — mensaje del local";
  const body =
    params.preview.trim().slice(0, 180) || "Tenés un mensaje nuevo sobre tu pedido. Abrí el chat para leerlo.";
  const qs = new URLSearchParams({
    puntoVenta: params.puntoVenta.trim(),
    pedidoId: pedidoIdChatClave(params.pedidoId),
  }).toString();
  const url = `/pedidos?${qs}`;
  const payload = JSON.stringify({
    title: titulo,
    body,
    url,
    tag: `maria-chorizos-chat-${params.pedidoId.trim().toUpperCase()}`,
  });

  const registros = await listarSuscripcionesPushPorPedido(params.puntoVenta, params.pedidoId);
  if (registros.length === 0) return;

  await Promise.allSettled(
    registros.map(async (rec) => {
      try {
        await webpush.sendNotification(rec.subscription, payload, {
          TTL: 86_400,
          urgency: "high",
        });
      } catch (err: unknown) {
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) {
          await eliminarSuscripcionPushPorDocId(rec.id);
        }
      }
    })
  );
}
