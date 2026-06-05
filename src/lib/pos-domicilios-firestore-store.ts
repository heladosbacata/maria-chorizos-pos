import { getFirestore } from "firebase-admin/firestore";
import { getFirebaseAdminApp } from "@/lib/firebase-admin-server";
import { pedidoIdChatClave, puntoVentaFirestoreClave as normPv } from "@/lib/pos-domicilios-pv-clave";
import {
  purgarBandejaDomiciliosFirestore,
  purgarBandejaDomiciliosMemoria,
} from "@/lib/pos-domicilios-purga-bandeja";
import { esPedidoDemoDomicilio, filtrarPedidosDemoDomicilios } from "@/lib/pos-domicilios-seed";
import { getMensajesChatMemory, appendMensajeChatMemory } from "@/lib/pos-domicilios-chat-memory-store";
import { getPedidosMemory, setPedidosMemory } from "@/lib/pos-domicilios-memory-store";
import type { DomicilioCrearPayload, EstadoDomicilio, PedidoDomicilio } from "@/types/pos-domicilios";
import type {
  ChatDomicilioEnviarPayload,
  MensajeChatDomicilio,
  RespuestaRapidaDomicilioId,
  TipoMensajeChatDomicilio,
} from "@/types/pos-domicilios-chat";

const COLL_PEDIDOS = "posDomiciliosPedidos";
const COLL_CHAT = "posDomiciliosChats";

function pedidoDocId(puntoVenta: string, pedidoId: string): string {
  return `${normPv(puntoVenta)}__${pedidoId.trim().toUpperCase()}`;
}

function chatKey(puntoVenta: string, pedidoId: string): string {
  return `${normPv(puntoVenta)}::${pedidoIdChatClave(pedidoId)}`;
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
  const ref = payload.referencia?.trim();
  return {
    id,
    puntoVenta: pv,
    cliente,
    telefono,
    direccion,
    ...(ref ? { referencia: ref } : {}),
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

const MAX_ADJUNTO_CHAT_CHARS = 290_000;

function toChat(raw: Record<string, unknown>, docIdFallback?: string): MensajeChatDomicilio | null {
  const id =
    (typeof raw.id === "string" && raw.id.trim()) ||
    (typeof docIdFallback === "string" && docIdFallback.trim()) ||
    "";
  const puntoVenta = typeof raw.puntoVenta === "string" ? raw.puntoVenta.trim() : "";
  const pedidoId = typeof raw.pedidoId === "string" ? raw.pedidoId.trim() : "";
  const autorRaw = typeof raw.autor === "string" ? raw.autor.trim().toLowerCase() : "";
  const autor = autorRaw === "pos" ? "pos" : autorRaw === "cliente" ? "cliente" : null;
  const autorLabel = typeof raw.autorLabel === "string" ? raw.autorLabel.trim() : "";
  const textoBruto = typeof raw.texto === "string" ? raw.texto.trim() : "";
  const adjuntoRaw = typeof raw.adjuntoDataUrl === "string" ? raw.adjuntoDataUrl.trim() : "";
  const adjuntoDataUrl =
    adjuntoRaw &&
    adjuntoRaw.length <= MAX_ADJUNTO_CHAT_CHARS &&
    /^data:image\//i.test(adjuntoRaw) &&
    adjuntoRaw.startsWith("data:image")
      ? adjuntoRaw.slice(0, MAX_ADJUNTO_CHAT_CHARS)
      : undefined;
  const tmRaw = raw.tipoMensaje;
  const tipoAdjuntoGuardado: TipoMensajeChatDomicilio | undefined =
    tmRaw === "imagen" || tmRaw === "comprobante" ? tmRaw : adjuntoDataUrl ? "comprobante" : undefined;
  const texto =
    textoBruto ||
    (adjuntoDataUrl
      ? tipoAdjuntoGuardado === "imagen"
        ? "Foto adjunta."
        : "Comprobante de pago (transferencia)."
      : "");
  const creadoEnIso = maybeIso(raw.creadoEnIso) ?? new Date().toISOString();
  const rr = raw.respuestaRapidaId;
  const respuestaRapidaId: RespuestaRapidaDomicilioId | undefined =
    rr === "confirmado" || rr === "modificar" || rr === "anular" ? rr : undefined;
  const adjuntoNombre =
    typeof raw.adjuntoNombre === "string" && raw.adjuntoNombre.trim()
      ? raw.adjuntoNombre.trim().slice(0, 120)
      : undefined;
  const tipoMensaje: TipoMensajeChatDomicilio | undefined = adjuntoDataUrl
    ? tipoAdjuntoGuardado ?? "comprobante"
    : respuestaRapidaId
      ? "respuesta_rapida"
      : raw.tipoMensaje === "texto" ||
          raw.tipoMensaje === "comprobante" ||
          raw.tipoMensaje === "imagen" ||
          raw.tipoMensaje === "respuesta_rapida"
        ? (raw.tipoMensaje as TipoMensajeChatDomicilio)
        : textoBruto
          ? "texto"
          : undefined;
  if (!id || !puntoVenta || !pedidoId || !autor || !autorLabel || !texto) return null;
  const base: MensajeChatDomicilio = {
    id,
    puntoVenta,
    pedidoId,
    autor,
    autorLabel,
    texto,
    creadoEnIso,
    ...(tipoMensaje ? { tipoMensaje } : {}),
    ...(respuestaRapidaId ? { respuestaRapidaId } : {}),
    ...(adjuntoDataUrl ? { adjuntoDataUrl, adjuntoNombre } : {}),
  };
  return base;
}

export async function listarPedidosDomiciliosPersistente(puntoVenta: string): Promise<PedidoDomicilio[]> {
  const pv = puntoVenta.trim();
  if (!pv) return [];
  const app = getFirebaseAdminApp();
  if (!app) {
    if (purgarBandejaDomiciliosMemoria(pv)) return [];
    return getPedidosMemory(pv);
  }
  const db = getFirestore(app);
  if (await purgarBandejaDomiciliosFirestore(db, pv)) return [];

  const snaps = await db.collection(COLL_PEDIDOS).where("puntoVentaNorm", "==", normPv(pv)).get();
  if (snaps.empty) return [];

  const out: PedidoDomicilio[] = [];
  for (const doc of snaps.docs) {
    const p = toPedido(doc.data() as Record<string, unknown>);
    if (p && !esPedidoDemoDomicilio(p.id)) out.push(p);
  }
  out.sort((a, b) => new Date(b.creadoEnIso).getTime() - new Date(a.creadoEnIso).getTime());
  return filtrarPedidosDemoDomicilios(out);
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
  const docData = { ...pedido, puntoVentaNorm: normPv(pv) };
  const limpio = Object.fromEntries(Object.entries(docData).filter(([, v]) => v !== undefined));
  await db.collection(COLL_PEDIDOS).doc(pedidoDocId(pv, pedido.id)).set(limpio, { merge: true });
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
  await ref.set(
    Object.fromEntries(Object.entries({ ...next, puntoVentaNorm: normPv(pv) }).filter(([, v]) => v !== undefined)),
    { merge: true }
  );
  return next;
}

export async function listarMensajesChatPersistente(puntoVenta: string, pedidoId: string): Promise<MensajeChatDomicilio[]> {
  const pv = puntoVenta.trim();
  const pid = pedidoIdChatClave(pedidoId);
  if (!pv || !pid) return [];
  const app = getFirebaseAdminApp();
  if (!app) return getMensajesChatMemory(pv, pid);
  const db = getFirestore(app);
  const key = chatKey(pv, pid);
  let snaps = await db.collection(COLL_CHAT).where("chatKey", "==", key).get();
  if (snaps.empty) {
    snaps = await db
      .collection(COLL_CHAT)
      .where("puntoVenta", "==", pv)
      .where("pedidoId", "==", pid)
      .get();
  }
  const out: MensajeChatDomicilio[] = [];
  const vistos = new Set<string>();
  for (const doc of snaps.docs) {
    const m = toChat(doc.data() as Record<string, unknown>, doc.id);
    if (!m || vistos.has(m.id)) continue;
    vistos.add(m.id);
    out.push(m);
  }
  out.sort((a, b) => new Date(a.creadoEnIso).getTime() - new Date(b.creadoEnIso).getTime());
  return out;
}

export async function enviarMensajeChatPersistente(payload: ChatDomicilioEnviarPayload): Promise<MensajeChatDomicilio | null> {
  const pv = payload.puntoVenta.trim();
  const pid = pedidoIdChatClave(payload.pedidoId);
  const adjuntoRaw = typeof payload.adjuntoDataUrl === "string" ? payload.adjuntoDataUrl.trim() : "";
  const adjuntoDataUrl =
    adjuntoRaw &&
    adjuntoRaw.length <= MAX_ADJUNTO_CHAT_CHARS &&
    /^data:image\/(jpeg|jpg|png|webp);base64,/i.test(adjuntoRaw)
      ? adjuntoRaw.slice(0, MAX_ADJUNTO_CHAT_CHARS)
      : undefined;
  let texto = payload.texto.trim().slice(0, 800);
  const esAdjuntoImagen = adjuntoDataUrl && payload.tipoMensaje === "imagen";
  if (!texto && adjuntoDataUrl) texto = esAdjuntoImagen ? "Foto adjunta." : "Comprobante de pago (transferencia).";
  const rr = payload.respuestaRapidaId;
  const respuestaRapidaId: RespuestaRapidaDomicilioId | undefined =
    rr === "confirmado" || rr === "modificar" || rr === "anular" ? rr : undefined;
  if (!pv || !pid || (!texto && !adjuntoDataUrl)) return null;
  const autor = payload.autor === "pos" ? "pos" : "cliente";
  const autorLabel = payload.autorLabel?.trim() || (autor === "cliente" ? "Cliente" : "POS");
  const tipoMensaje: TipoMensajeChatDomicilio = adjuntoDataUrl
    ? esAdjuntoImagen
      ? "imagen"
      : "comprobante"
    : respuestaRapidaId
      ? "respuesta_rapida"
      : "texto";
  const adjuntoNombre =
    adjuntoDataUrl && payload.adjuntoNombre?.trim()
      ? payload.adjuntoNombre.trim().slice(0, 120)
      : adjuntoDataUrl
        ? esAdjuntoImagen
          ? "foto.jpg"
          : "comprobante.jpg"
        : undefined;
  const mensaje: MensajeChatDomicilio = {
    id: buildIdPrefijo("chat"),
    puntoVenta: pv,
    pedidoId: pid,
    autor,
    autorLabel,
    texto,
    creadoEnIso: new Date().toISOString(),
    tipoMensaje,
    ...(respuestaRapidaId ? { respuestaRapidaId } : {}),
    ...(adjuntoDataUrl ? { adjuntoDataUrl, adjuntoNombre } : {}),
  };
  const app = getFirebaseAdminApp();
  if (!app) {
    appendMensajeChatMemory(mensaje);
    return mensaje;
  }
  const db = getFirestore(app);
  const chatDoc = {
    ...mensaje,
    chatKey: chatKey(pv, pid),
    puntoVentaNorm: normPv(pv),
  };
  await db
    .collection(COLL_CHAT)
    .doc(mensaje.id)
    .set(Object.fromEntries(Object.entries(chatDoc).filter(([, v]) => v !== undefined)));
  return mensaje;
}
