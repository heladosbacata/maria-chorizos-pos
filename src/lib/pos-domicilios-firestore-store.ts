import { getFirestore } from "firebase-admin/firestore";
import { getFirebaseAdminApp } from "@/lib/firebase-admin-server";
import { buildPedidosSemillaDomicilios } from "@/lib/pos-domicilios-seed";
import { getMensajesChatMemory, appendMensajeChatMemory } from "@/lib/pos-domicilios-chat-memory-store";
import { getPedidosMemory, setPedidosMemory } from "@/lib/pos-domicilios-memory-store";
import type { DomicilioCrearPayload, EstadoDomicilio, PedidoDomicilio } from "@/types/pos-domicilios";
import type { ChatDomicilioEnviarPayload, MensajeChatDomicilio } from "@/types/pos-domicilios-chat";

const COLL_PEDIDOS = "posDomiciliosPedidos";
const COLL_CHAT = "posDomiciliosChats";

function normPv(puntoVenta: string): string {
  return puntoVenta.trim().toLowerCase();
}

function pedidoDocId(puntoVenta: string, pedidoId: string): string {
  return `${normPv(puntoVenta)}__${pedidoId.trim().toUpperCase()}`;
}

function chatKey(puntoVenta: string, pedidoId: string): string {
  return `${normPv(puntoVenta)}::${pedidoId.trim().toUpperCase()}`;
}

function buildIdPrefijo(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function maybeIso(v: unknown): string | undefined {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (v && typeof v === "object" && "toDate" in v && typeof (v as { toDate: () => Date }).toDate === "function") {
    try {
      return (v as { toDate: () => Date }).toDate().toISOString();
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function toPedido(raw: Record<string, unknown>): PedidoDomicilio | null {
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const puntoVenta = typeof raw.puntoVenta === "string" ? raw.puntoVenta.trim() : "";
  const cliente = typeof raw.cliente === "string" ? raw.cliente.trim() : "";
  const telefono = typeof raw.telefono === "string" ? raw.telefono.trim() : "";
  const direccion = typeof raw.direccion === "string" ? raw.direccion.trim() : "";
  const total = typeof raw.total === "number" && Number.isFinite(raw.total) ? Math.round(raw.total) : 0;
  const estado = typeof raw.estado === "string" ? (raw.estado as EstadoDomicilio) : "NUEVO";
  const creadoEnIso = maybeIso(raw.creadoEnIso) ?? new Date().toISOString();
  if (!id || !puntoVenta || !cliente || !telefono || !direccion || total <= 0) return null;
  const metodoPago =
    raw.metodoPago === "transferencia" || raw.metodoPago === "datafono" || raw.metodoPago === "efectivo"
      ? raw.metodoPago
      : "efectivo";
  const canal = raw.canal === "qr" || raw.canal === "whatsapp" || raw.canal === "web" ? raw.canal : "web";
  const items = Array.isArray(raw.items) ? raw.items.filter((x): x is string => typeof x === "string") : [];
  const tiempoObjetivoMin =
    typeof raw.tiempoObjetivoMin === "number" && Number.isFinite(raw.tiempoObjetivoMin)
      ? Math.max(10, Math.round(raw.tiempoObjetivoMin))
      : 35;
  return {
    id,
    puntoVenta,
    cliente,
    telefono,
    direccion,
    referencia: typeof raw.referencia === "string" && raw.referencia.trim() ? raw.referencia.trim() : undefined,
    total,
    metodoPago,
    canal,
    estado,
    creadoEnIso,
    items,
    tiempoObjetivoMin,
    rechazoMotivo:
      typeof raw.rechazoMotivo === "string" && raw.rechazoMotivo.trim() ? raw.rechazoMotivo.trim() : undefined,
    rechazadoEnIso: maybeIso(raw.rechazadoEnIso),
  };
}

function pedidoFromPayload(payload: DomicilioCrearPayload, id: string): PedidoDomicilio | null {
  const pv = payload.puntoVenta.trim();
  const cliente = payload.cliente.trim();
  const telefono = payload.telefono.trim();
  const direccion = payload.direccion.trim();
  const items = payload.items.map((x) => x.trim()).filter(Boolean);
  if (!pv || !cliente || !telefono || !direccion || items.length === 0 || !Number.isFinite(payload.total) || payload.total <= 0) {
    return null;
  }
  return {
    id,
    puntoVenta: pv,
    cliente,
    telefono,
    direccion,
    referencia: payload.referencia?.trim() || undefined,
    total: Math.round(payload.total),
    metodoPago: payload.metodoPago,
    canal: payload.canal,
    estado: "NUEVO",
    creadoEnIso: new Date().toISOString(),
    items,
    tiempoObjetivoMin:
      payload.tiempoObjetivoMin && Number.isFinite(payload.tiempoObjetivoMin)
        ? Math.max(10, Math.round(payload.tiempoObjetivoMin))
        : 35,
  };
}

function toChat(raw: Record<string, unknown>): MensajeChatDomicilio | null {
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const puntoVenta = typeof raw.puntoVenta === "string" ? raw.puntoVenta.trim() : "";
  const pedidoId = typeof raw.pedidoId === "string" ? raw.pedidoId.trim() : "";
  const autor = raw.autor === "pos" ? "pos" : raw.autor === "cliente" ? "cliente" : null;
  const autorLabel = typeof raw.autorLabel === "string" ? raw.autorLabel.trim() : "";
  const texto = typeof raw.texto === "string" ? raw.texto.trim() : "";
  const creadoEnIso = maybeIso(raw.creadoEnIso) ?? new Date().toISOString();
  if (!id || !puntoVenta || !pedidoId || !autor || !autorLabel || !texto) return null;
  return { id, puntoVenta, pedidoId, autor, autorLabel, texto, creadoEnIso };
}

export async function listarPedidosDomiciliosPersistente(puntoVenta: string): Promise<PedidoDomicilio[]> {
  const pv = puntoVenta.trim();
  if (!pv) return [];
  const app = getFirebaseAdminApp();
  if (!app) return getPedidosMemory(pv);
  const db = getFirestore(app);
  const snaps = await db.collection(COLL_PEDIDOS).where("puntoVentaNorm", "==", normPv(pv)).get();
  if (snaps.empty) {
    const seed = buildPedidosSemillaDomicilios(pv);
    const batch = db.batch();
    for (const p of seed) {
      const ref = db.collection(COLL_PEDIDOS).doc(pedidoDocId(pv, p.id));
      batch.set(ref, { ...p, puntoVentaNorm: normPv(pv) }, { merge: true });
    }
    await batch.commit();
    return seed;
  }
  const out: PedidoDomicilio[] = [];
  for (const doc of snaps.docs) {
    const p = toPedido(doc.data() as Record<string, unknown>);
    if (p) out.push(p);
  }
  out.sort((a, b) => new Date(b.creadoEnIso).getTime() - new Date(a.creadoEnIso).getTime());
  return out;
}

export async function crearPedidoDomicilioPersistente(payload: DomicilioCrearPayload): Promise<PedidoDomicilio | null> {
  const pv = payload.puntoVenta.trim();
  if (!pv) return null;
  const id = `DOM-${Math.floor(Math.random() * 9000) + 1000}`;
  const pedido = pedidoFromPayload(payload, id);
  if (!pedido) return null;
  const app = getFirebaseAdminApp();
  if (!app) {
    const current = getPedidosMemory(pv);
    setPedidosMemory(pv, [pedido, ...current]);
    return pedido;
  }
  const db = getFirestore(app);
  await db
    .collection(COLL_PEDIDOS)
    .doc(pedidoDocId(pv, pedido.id))
    .set({ ...pedido, puntoVentaNorm: normPv(pv) }, { merge: true });
  return pedido;
}

export async function actualizarEstadoPedidoPersistente(params: {
  puntoVenta: string;
  pedidoId: string;
  estado: EstadoDomicilio;
  motivo?: string;
}): Promise<PedidoDomicilio | null> {
  const pv = params.puntoVenta.trim();
  const id = params.pedidoId.trim();
  if (!pv || !id) return null;
  const app = getFirebaseAdminApp();
  if (!app) {
    const pedidos = getPedidosMemory(pv);
    const idx = pedidos.findIndex((p) => p.id === id);
    if (idx < 0) return null;
    const next = { ...pedidos[idx], estado: params.estado };
    if (params.estado === "RECHAZADO") {
      next.rechazoMotivo = params.motivo?.trim() || "Sin motivo especificado";
      next.rechazadoEnIso = new Date().toISOString();
    } else {
      delete next.rechazoMotivo;
      delete next.rechazadoEnIso;
    }
    const copia = [...pedidos];
    copia[idx] = next;
    setPedidosMemory(pv, copia);
    return next;
  }
  const db = getFirestore(app);
  const ref = db.collection(COLL_PEDIDOS).doc(pedidoDocId(pv, id));
  const snap = await ref.get();
  if (!snap.exists) return null;
  const base = toPedido(snap.data() as Record<string, unknown>);
  if (!base) return null;
  const next: PedidoDomicilio = { ...base, estado: params.estado };
  if (params.estado === "RECHAZADO") {
    next.rechazoMotivo = params.motivo?.trim() || "Sin motivo especificado";
    next.rechazadoEnIso = new Date().toISOString();
  } else {
    delete next.rechazoMotivo;
    delete next.rechazadoEnIso;
  }
  await ref.set({ ...next, puntoVentaNorm: normPv(pv) }, { merge: true });
  return next;
}

export async function listarMensajesChatPersistente(puntoVenta: string, pedidoId: string): Promise<MensajeChatDomicilio[]> {
  const pv = puntoVenta.trim();
  const pid = pedidoId.trim();
  if (!pv || !pid) return [];
  const app = getFirebaseAdminApp();
  if (!app) return getMensajesChatMemory(pv, pid);
  const db = getFirestore(app);
  const key = chatKey(pv, pid);
  const snaps = await db.collection(COLL_CHAT).where("chatKey", "==", key).get();
  const out: MensajeChatDomicilio[] = [];
  for (const doc of snaps.docs) {
    const m = toChat(doc.data() as Record<string, unknown>);
    if (m) out.push(m);
  }
  out.sort((a, b) => new Date(a.creadoEnIso).getTime() - new Date(b.creadoEnIso).getTime());
  return out;
}

export async function enviarMensajeChatPersistente(payload: ChatDomicilioEnviarPayload): Promise<MensajeChatDomicilio | null> {
  const pv = payload.puntoVenta.trim();
  const pid = payload.pedidoId.trim();
  const texto = payload.texto.trim().slice(0, 800);
  if (!pv || !pid || !texto) return null;
  const autor = payload.autor === "pos" ? "pos" : "cliente";
  const autorLabel = payload.autorLabel?.trim() || (autor === "cliente" ? "Cliente" : "POS");
  const mensaje: MensajeChatDomicilio = {
    id: buildIdPrefijo("chat"),
    puntoVenta: pv,
    pedidoId: pid,
    autor,
    autorLabel,
    texto,
    creadoEnIso: new Date().toISOString(),
  };
  const app = getFirebaseAdminApp();
  if (!app) {
    appendMensajeChatMemory(mensaje);
    return mensaje;
  }
  const db = getFirestore(app);
  await db.collection(COLL_CHAT).doc(mensaje.id).set({
    ...mensaje,
    chatKey: chatKey(pv, pid),
    puntoVentaNorm: normPv(pv),
  });
  return mensaje;
}
