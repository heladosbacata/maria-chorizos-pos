import { createHash } from "crypto";
import { getFirestore } from "firebase-admin/firestore";
import { getFirebaseAdminApp } from "@/lib/firebase-admin-server";
import { puntoVentaFirestoreClave as normPv } from "@/lib/pos-domicilios-pv-clave";

const COLL_PUSH = "posDomiciliosPushSubs";

export function domicilioPushChatKey(puntoVenta: string, pedidoId: string): string {
  return `${normPv(puntoVenta)}::${pedidoId.trim().toUpperCase()}`;
}

export type PushSubscriptionJsonCliente = {
  endpoint: string;
  expirationTime?: number | null;
  keys?: { p256dh: string; auth: string };
};

export type SuscripcionPushGuardada = {
  id: string;
  chatKey: string;
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
};

type MemRec = SuscripcionPushGuardada;

const globalForPush = globalThis as typeof globalThis & {
  __posDomiciliosPushSubsMem__?: Map<string, MemRec[]>;
};

function memStore(): Map<string, MemRec[]> {
  if (!globalForPush.__posDomiciliosPushSubsMem__) {
    globalForPush.__posDomiciliosPushSubsMem__ = new Map();
  }
  return globalForPush.__posDomiciliosPushSubsMem__;
}

function docIdFromEndpoint(endpoint: string): string {
  return createHash("sha256").update(endpoint).digest("hex").slice(0, 40);
}

function toSubscription(json: PushSubscriptionJsonCliente): { endpoint: string; keys: { p256dh: string; auth: string } } | null {
  const endpoint = typeof json.endpoint === "string" ? json.endpoint.trim() : "";
  const p256dh = json.keys?.p256dh?.trim() ?? "";
  const auth = json.keys?.auth?.trim() ?? "";
  if (!endpoint || !p256dh || !auth) return null;
  return { endpoint, keys: { p256dh, auth } };
}

export async function guardarSuscripcionPushCliente(params: {
  puntoVenta: string;
  pedidoId: string;
  subscription: PushSubscriptionJsonCliente;
}): Promise<{ ok: boolean; message?: string; id?: string }> {
  const pv = params.puntoVenta.trim();
  const pid = params.pedidoId.trim();
  const sub = toSubscription(params.subscription);
  if (!pv || !pid || !sub) {
    return { ok: false, message: "Suscripción inválida o datos incompletos." };
  }
  const chatKey = domicilioPushChatKey(pv, pid);
  const id = docIdFromEndpoint(sub.endpoint);
  const app = getFirebaseAdminApp();

  if (!app) {
    const map = memStore();
    const list = map.get(chatKey) ?? [];
    const next = list.filter((x) => x.id !== id);
    next.push({ id, chatKey, subscription: sub });
    map.set(chatKey, next);
    return { ok: true, id };
  }

  const db = getFirestore(app);
  await db.collection(COLL_PUSH).doc(id).set(
    {
      chatKey,
      puntoVentaNorm: normPv(pv),
      pedidoId: pid.toUpperCase(),
      endpoint: sub.endpoint,
      keysP256dh: sub.keys.p256dh,
      keysAuth: sub.keys.auth,
      creadoEnIso: new Date().toISOString(),
    },
    { merge: true }
  );
  return { ok: true, id };
}

export async function listarSuscripcionesPushPorPedido(
  puntoVenta: string,
  pedidoId: string
): Promise<SuscripcionPushGuardada[]> {
  const pv = puntoVenta.trim();
  const pid = pedidoId.trim();
  if (!pv || !pid) return [];
  const chatKey = domicilioPushChatKey(pv, pid);
  const app = getFirebaseAdminApp();
  if (!app) {
    return memStore().get(chatKey) ?? [];
  }
  const db = getFirestore(app);
  const snaps = await db.collection(COLL_PUSH).where("chatKey", "==", chatKey).get();
  const out: SuscripcionPushGuardada[] = [];
  for (const doc of snaps.docs) {
    const d = doc.data() as Record<string, unknown>;
    const endpoint = typeof d.endpoint === "string" ? d.endpoint : "";
    const p256dh = typeof d.keysP256dh === "string" ? d.keysP256dh : "";
    const auth = typeof d.keysAuth === "string" ? d.keysAuth : "";
    if (!endpoint || !p256dh || !auth) continue;
    out.push({
      id: doc.id,
      chatKey,
      subscription: { endpoint, keys: { p256dh, auth } },
    });
  }
  return out;
}

export async function eliminarSuscripcionPushPorDocId(docId: string): Promise<void> {
  if (!docId.trim()) return;
  const app = getFirebaseAdminApp();
  if (!app) {
    const map = memStore();
    for (const [key, list] of Array.from(map.entries())) {
      const next = list.filter((x: MemRec) => x.id !== docId);
      if (next.length !== list.length) {
        map.set(key, next);
        break;
      }
    }
    return;
  }
  const db = getFirestore(app);
  await db.collection(COLL_PUSH).doc(docId).delete().catch(() => undefined);
}
