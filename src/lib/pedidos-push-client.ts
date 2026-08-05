/**
 * Web Push en el navegador — landing /pedidos (Maria Chorizos).
 * Requiere NEXT_PUBLIC_VAPID_PUBLIC_KEY y en servidor VAPID_PRIVATE_KEY.
 *
 * Flujo profesional:
 * 1) Soft-ask en UI (modal/CTA)
 * 2) requestPermission solo con gesto del usuario (o reutilizar si ya granted)
 * 3) Registrar SW + suscripción Push
 * 4) POST al API vinculando la suscripción al pedidoId activo
 */

const SW_PATH = "/pedidos-push-sw.js";
const STORAGE_ULTIMO_PEDIDO_PUSH = "pos_mc_pedidos_push_pedido_v1";

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

export function permisoNotificacionesPedidos(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

export function esIosSafariSinPwa(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (!isIOS) return false;
  const standalone =
    ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone)) ||
    window.matchMedia("(display-mode: standalone)").matches;
  return !standalone;
}

function marcarPedidoPushLocal(pedidoId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_ULTIMO_PEDIDO_PUSH, pedidoId.trim().toUpperCase());
  } catch {
    /* ignore */
  }
}

export function pedidoYaTeniasPushLocal(pedidoId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_ULTIMO_PEDIDO_PUSH) === pedidoId.trim().toUpperCase();
  } catch {
    return false;
  }
}

async function obtenerRegistroServiceWorker(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration(SW_PATH);
  if (existing) {
    await existing.update().catch(() => undefined);
    await navigator.serviceWorker.ready.catch(() => undefined);
    return existing;
  }
  const reg = await navigator.serviceWorker.register(SW_PATH, { scope: "/" });
  await reg.update().catch(() => undefined);
  await navigator.serviceWorker.ready.catch(() => undefined);
  return reg;
}

async function obtenerOCrearSuscripcionPush(
  reg: ServiceWorkerRegistration,
  vapidPublicKey: string
): Promise<PushSubscription | null> {
  const actual = await reg.pushManager.getSubscription();
  if (actual) return actual;
  try {
    return await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
    });
  } catch {
    return null;
  }
}

async function registrarSuscripcionEnServidor(params: {
  puntoVenta: string;
  pedidoId: string;
  subscription: PushSubscription;
}): Promise<{ ok: boolean; message?: string }> {
  const json = params.subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    return { ok: false, message: "No se pudo leer la suscripción de notificaciones." };
  }
  const res = await fetch("/api/pos_domicilios_push_suscribir", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      puntoVenta: params.puntoVenta,
      pedidoId: params.pedidoId,
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
  return { ok: true, message: data.message ?? "Avisos activados. Le avisamos aunque cierre la app." };
}

/**
 * Activa o re-vincula avisos push al pedido actual.
 * - Si el permiso ya es granted: no vuelve a pedir el diálogo nativo.
 * - Si es default: pide permiso (debe llamarse desde un clic del usuario).
 * - Si es denied: devuelve instrucciones.
 */
export async function activarNotificacionesPedidoDomicilio(params: {
  vapidPublicKey: string;
  puntoVenta: string;
  pedidoId: string;
  /** Si true y el permiso es default, no pide el diálogo (solo para auto-ensure silencioso). */
  soloSiYaConcedido?: boolean;
}): Promise<{ ok: boolean; message?: string; permiso?: NotificationPermission | "unsupported" }> {
  const { vapidPublicKey, puntoVenta, pedidoId, soloSiYaConcedido = false } = params;
  if (!pedidosPushSoportadoEnEsteNavegador()) {
    if (esIosSafariSinPwa()) {
      return {
        ok: false,
        permiso: "unsupported",
        message:
          "En iPhone: toque Compartir → «Agregar a pantalla de inicio» y abra María Chorizos desde el ícono para activar avisos.",
      };
    }
    return {
      ok: false,
      permiso: "unsupported",
      message: "Este navegador no permite notificaciones push en esta página.",
    };
  }

  const key = vapidPublicKey.trim();
  if (!key) {
    return { ok: false, message: "Las notificaciones no están disponibles (falta configuración del servidor)." };
  }

  let perm = Notification.permission;
  if (perm === "default") {
    if (soloSiYaConcedido) {
      return { ok: false, permiso: perm, message: "Aún no autorizó las notificaciones." };
    }
    perm = await Notification.requestPermission();
  }

  if (perm === "denied") {
    return {
      ok: false,
      permiso: perm,
      message:
        "Las notificaciones están bloqueadas. Actívelas en la configuración del navegador o del sitio y vuelva a intentar.",
    };
  }
  if (perm !== "granted") {
    return {
      ok: false,
      permiso: perm,
      message: "Sin permiso no podemos avisarle cuando el local le escriba.",
    };
  }

  try {
    const reg = await obtenerRegistroServiceWorker();
    const sub = await obtenerOCrearSuscripcionPush(reg, key);
    if (!sub) {
      return {
        ok: false,
        permiso: perm,
        message: "No se pudo crear la suscripción push. Intente de nuevo o use Chrome/Android.",
      };
    }
    const r = await registrarSuscripcionEnServidor({ puntoVenta, pedidoId, subscription: sub });
    if (r.ok) marcarPedidoPushLocal(pedidoId);
    return { ...r, permiso: perm };
  } catch {
    return {
      ok: false,
      permiso: perm,
      message: "No se pudieron activar los avisos. Revise la conexión e intente de nuevo.",
    };
  }
}
