/**
 * Web Push en el navegador — landing /pedidos (Maria Chorizos).
 * Requiere NEXT_PUBLIC_VAPID_PUBLIC_KEY y en servidor VAPID_PRIVATE_KEY.
 */

const SW_PATH = "/pedidos-push-sw.js";

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = typeof atob === "function" ? atob(base64) : "";
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function pedidosPushSoportadoEnEsteNavegador(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean("serviceWorker" in navigator && "PushManager" in window && "Notification" in window);
}

export async function activarNotificacionesPedidoDomicilio(params: {
  vapidPublicKey: string;
  puntoVenta: string;
  pedidoId: string;
}): Promise<{ ok: boolean; message?: string }> {
  const { vapidPublicKey, puntoVenta, pedidoId } = params;
  if (!pedidosPushSoportadoEnEsteNavegador()) {
    return { ok: false, message: "Tu navegador no permite notificaciones push en esta página." };
  }
  const key = vapidPublicKey.trim();
  if (!key) {
    return { ok: false, message: "Las notificaciones no están disponibles (falta configuración VAPID)." };
  }

  const perm = await Notification.requestPermission();
  if (perm !== "granted") {
    return { ok: false, message: "Sin permiso no podemos enviarte avisos. Podés activarlo desde la configuración del navegador." };
  }

  const reg = await navigator.serviceWorker.register(SW_PATH, { scope: "/" });
  await reg.update().catch(() => undefined);

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
  });

  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    return { ok: false, message: "No se pudo crear la suscripción push." };
  }

  const res = await fetch("/api/pos_domicilios_push_suscribir", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      puntoVenta,
      pedidoId,
      subscription: {
        endpoint: json.endpoint,
        expirationTime: json.expirationTime ?? null,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      },
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
  if (!res.ok || data.ok === false) {
    return { ok: false, message: data.message ?? "No se pudo registrar el aviso en el servidor." };
  }
  return { ok: true, message: data.message ?? "Listo. Te avisamos cuando cambie el estado del pedido." };
}
