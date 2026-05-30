"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  POS_BROADCAST_QUICK_REACT_EMOJIS,
  wmsBroadcastEnviar,
  wmsBroadcastEstado,
  wmsBroadcastMarcarLeido,
  wmsBroadcastMensajes,
  wmsBroadcastReaccionar,
  wmsBroadcastUnread,
  type PosBroadcastMensajeCliente,
  type PosBroadcastSesionCliente,
} from "@/lib/wms-broadcast-client";
import { comprimirImagenParaBroadcastChat } from "@/lib/pos-broadcast-chat-imagen";

function formatHora(ms: number): string {
  if (!ms) return "—";
  try {
    return new Intl.DateTimeFormat("es-CO", { dateStyle: "short", timeStyle: "short" }).format(new Date(ms));
  } catch {
    return "—";
  }
}

type Props = {
  getIdToken: () => Promise<string | null>;
  /** UID del cajero para resaltar su reacción y toggle */
  currentUid?: string | null;
  visible?: boolean;
};

const POLL_ESTADO_MS = 30_000;
const POLL_UNREAD_MS = 30_000;
const POLL_HILO_ABIERTO_MS = 15_000;
const EMOJIS_CHAT_RAPIDO = ["😀", "😊", "👍", "🙏", "🎉", "🔥", "❤️", "👏", "💪", "🏆", "✅", "📌"] as const;

export default function PosBroadcastBell({ getIdToken, currentUid, visible = true }: Props) {
  const [sesion, setSesion] = useState<PosBroadcastSesionCliente | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [minimizado, setMinimizado] = useState(false);
  const [posicionFlotante, setPosicionFlotante] = useState<{ x: number; y: number } | null>(null);
  const [autoAbrirPendiente, setAutoAbrirPendiente] = useState(false);
  const [unread, setUnread] = useState(0);
  const [mensajes, setMensajes] = useState<PosBroadcastMensajeCliente[]>([]);
  const [cargando, setCargando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [texto, setTexto] = useState("");
  const [emojiPickerAbierto, setEmojiPickerAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reactionMessageId, setReactionMessageId] = useState<string | null>(null);
  const [reaccionandoId, setReaccionandoId] = useState<string | null>(null);
  const [imagenPendiente, setImagenPendiente] = useState<{ previewUrl: string; dataUrl: string } | null>(null);
  const listaRef = useRef<HTMLDivElement>(null);
  const inputImagenRef = useRef<HTMLInputElement>(null);
  const prevUnreadRef = useRef(0);
  const autoAbiertoInicialRef = useRef(false);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);

  const abrirChat = useCallback(() => {
    setAbierto(true);
    setMinimizado(false);
  }, []);

  const minimizarChat = useCallback(() => {
    setAbierto(false);
    setMinimizado(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const margin = 16;
    const leftSeguro = window.innerWidth >= 768 ? 224 : margin;
    const y = Math.max(margin, window.innerHeight - 88);
    const x = leftSeguro;
    setPosicionFlotante((prev) => prev ?? { x, y });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => {
      setPosicionFlotante((prev) => {
        if (!prev) return prev;
        const minX = window.innerWidth >= 768 ? 224 : 16;
        const maxX = Math.max(16, window.innerWidth - 320);
        const maxY = Math.max(16, window.innerHeight - 88);
        return {
          x: Math.min(Math.max(minX, prev.x), maxX),
          y: Math.min(Math.max(16, prev.y), maxY),
        };
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const onPointerDownFlotante = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!posicionFlotante) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: posicionFlotante.x,
      originY: posicionFlotante.y,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [posicionFlotante]);

  const onPointerMoveFlotante = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || typeof window === "undefined") return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (!drag.moved && Math.abs(deltaX) + Math.abs(deltaY) > 6) {
      drag.moved = true;
    }
    const minX = window.innerWidth >= 768 ? 224 : 16;
    const maxX = Math.max(16, window.innerWidth - 320);
    const maxY = Math.max(16, window.innerHeight - 88);
    setPosicionFlotante({
      x: Math.min(Math.max(minX, drag.originX + deltaX), maxX),
      y: Math.min(Math.max(16, drag.originY + deltaY), maxY),
    });
  }, []);

  const onPointerUpFlotante = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null;
    if (!drag.moved) {
      abrirChat();
    }
  }, [abrirChat]);

  const onPointerCancelFlotante = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  }, []);

  const pollEstado = useCallback(async () => {
    const token = await getIdToken();
    if (!token) return;
    const r = await wmsBroadcastEstado(token);
    if (r.ok) {
      setSesion(r.sesion);
      if (!r.sesion) {
        setAbierto(false);
        setMinimizado(false);
        setUnread(0);
        setMensajes([]);
        prevUnreadRef.current = 0;
        autoAbiertoInicialRef.current = false;
      }
    }
  }, [getIdToken]);

  const fetchUnread = useCallback(async () => {
    if (!sesion) {
      setUnread(0);
      return;
    }
    const token = await getIdToken();
    if (!token) return;
    const r = await wmsBroadcastUnread(token);
    if (r.ok) {
      const next = r.count;
      const huboNuevoMensaje = next > prevUnreadRef.current;
      const debeAutoAbrir = next > 0 && (!autoAbiertoInicialRef.current || huboNuevoMensaje);
      prevUnreadRef.current = next;
      setUnread(next);
      if (debeAutoAbrir) {
        autoAbiertoInicialRef.current = true;
        setAutoAbrirPendiente(true);
      }
    }
  }, [getIdToken, sesion]);

  const cargarHilo = useCallback(async () => {
    const token = await getIdToken();
    if (!token) return;
    setCargando(true);
    setError(null);
    try {
      const r = await wmsBroadcastMensajes(token);
      if (r.ok) setMensajes(r.mensajes);
      else setError(r.error);
    } finally {
      setCargando(false);
    }
  }, [getIdToken]);

  useEffect(() => {
    if (!visible) return;
    void pollEstado();
    const t2 = window.setTimeout(() => void pollEstado(), 2000);
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void pollEstado();
    }, POLL_ESTADO_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") void pollEstado();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearTimeout(t2);
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [visible, pollEstado]);

  useEffect(() => {
    if (!visible || !sesion) return;
    void fetchUnread();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void fetchUnread();
    }, POLL_UNREAD_MS);
    return () => clearInterval(id);
  }, [visible, sesion, fetchUnread]);

  useEffect(() => {
    if (!abierto || !sesion) return;
    void (async () => {
      const token = await getIdToken();
      if (token) {
        await wmsBroadcastMarcarLeido(token, { sessionId: sesion.id, lastSeenAtMs: Date.now() });
      }
      setUnread(0);
      prevUnreadRef.current = 0;
    })();
    void cargarHilo();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void cargarHilo();
    }, POLL_HILO_ABIERTO_MS);
    return () => clearInterval(id);
  }, [abierto, sesion, cargarHilo, getIdToken]);

  useEffect(() => {
    if (!autoAbrirPendiente || !visible || !sesion) return;
    setAbierto(true);
    setMinimizado(false);
    setAutoAbrirPendiente(false);
  }, [autoAbrirPendiente, visible, sesion]);

  useEffect(() => {
    if (!abierto || !listaRef.current) return;
    listaRef.current.scrollTop = listaRef.current.scrollHeight;
  }, [abierto, mensajes]);

  const reaccionar = async (messageId: string, emoji: string) => {
    setReaccionandoId(messageId);
    setError(null);
    try {
      const token = await getIdToken();
      if (!token) {
        setError("Sesión inválida.");
        return;
      }
      const r = await wmsBroadcastReaccionar(token, messageId, emoji);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setMensajes((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, reactions: r.reactions } : m))
      );
      setReactionMessageId(null);
    } finally {
      setReaccionandoId(null);
    }
  };

  const quitarImagenPendiente = useCallback(() => {
    if (imagenPendiente?.previewUrl) URL.revokeObjectURL(imagenPendiente.previewUrl);
    setImagenPendiente(null);
    if (inputImagenRef.current) inputImagenRef.current.value = "";
  }, [imagenPendiente?.previewUrl]);

  useEffect(() => {
    return () => {
      if (imagenPendiente?.previewUrl) URL.revokeObjectURL(imagenPendiente.previewUrl);
    };
  }, [imagenPendiente?.previewUrl]);

  const onElegirImagen = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Solo se permiten imágenes (JPG, PNG, WebP).");
      return;
    }
    const comprimida = await comprimirImagenParaBroadcastChat(file);
    if (!comprimida) {
      setError("No se pudo usar esa imagen. Probá con otra más pequeña.");
      return;
    }
    setImagenPendiente((prev) => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return {
        previewUrl: URL.createObjectURL(file),
        dataUrl: comprimida.dataUrl,
      };
    });
    if (inputImagenRef.current) inputImagenRef.current.value = "";
    setError(null);
  };

  const enviar = async () => {
    const t = texto.trim();
    if ((!t && !imagenPendiente) || !sesion) return;
    setEnviando(true);
    setError(null);
    try {
      const token = await getIdToken();
      if (!token) {
        setError("Sesión inválida.");
        return;
      }
      const r = await wmsBroadcastEnviar(token, t, {
        imageDataUrl: imagenPendiente?.dataUrl,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setTexto("");
      setEmojiPickerAbierto(false);
      quitarImagenPendiente();
      await cargarHilo();
      await fetchUnread();
    } finally {
      setEnviando(false);
    }
  };

  const insertarEmoji = (emoji: string) => {
    setTexto((prev) => `${prev}${prev && !prev.endsWith(" ") ? " " : ""}${emoji} `);
  };

  if (!visible || !sesion) return null;

  return (
    <>
      <button
        type="button"
        onClick={abrirChat}
        className="group relative flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-indigo-200/80 bg-gradient-to-br from-indigo-50 via-white to-violet-50 text-indigo-900/85 shadow-[0_6px_20px_-8px_rgba(79,70,229,0.35)] transition-all hover:border-indigo-400 hover:text-indigo-950 focus:outline-none focus:ring-2 focus:ring-indigo-400/45"
        title="Chat grupal con todos los puntos (abierto por administración)"
        aria-label="Chat grupal POS"
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
          />
        </svg>
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 px-1 text-[10px] font-bold text-white shadow-md ring-2 ring-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      {minimizado ? (
        <button
          type="button"
          onPointerDown={onPointerDownFlotante}
          onPointerMove={onPointerMoveFlotante}
          onPointerUp={onPointerUpFlotante}
          onPointerCancel={onPointerCancelFlotante}
          className="fixed z-[190] flex cursor-grab items-center gap-2 rounded-full border border-indigo-300/80 bg-gradient-to-br from-indigo-50 via-white to-violet-50 px-4 py-3 text-sm font-semibold text-indigo-950 shadow-[0_18px_40px_-16px_rgba(79,70,229,0.55)] transition hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-indigo-400/45 active:cursor-grabbing"
          style={
            posicionFlotante
              ? {
                  left: `${posicionFlotante.x}px`,
                  top: `${posicionFlotante.y}px`,
                }
              : undefined
          }
          aria-label="Abrir chat grupal"
        >
          <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-indigo-900">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
            {unread > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 px-1 text-[10px] font-bold text-white shadow-md ring-2 ring-white">
                {unread > 9 ? "9+" : unread}
              </span>
            ) : null}
          </span>
          <span className="text-left leading-tight">
            <span className="block">Chat grupal</span>
            <span className="block text-[11px] font-medium text-indigo-800/80">Pendiente por responder</span>
          </span>
        </button>
      ) : null}

      {abierto ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6">
          <div className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]" />
          <div
            className="relative flex h-[min(88vh,780px)] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-indigo-200/50 bg-gradient-to-b from-[#15122a] via-[#1a1630] to-[#120f1c] text-indigo-50 shadow-[0_28px_90px_-20px_rgba(0,0,0,0.65)] ring-2 ring-indigo-500/20"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pos-broadcast-title"
          >
            <header className="relative flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3.5">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-indigo-300/90">
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Todos los puntos</span>
                </div>
                <h2 id="pos-broadcast-title" className="mt-1 text-base font-semibold tracking-tight text-white">
                  {sesion.titulo?.trim() ? sesion.titulo : "Conversación grupal"}
                </h2>
                <p className="mt-0.5 text-xs text-indigo-200/50">Administración abre y cierra este chat.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={minimizarChat}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-indigo-200/80 transition hover:bg-white/10 hover:text-white"
                  aria-label="Minimizar"
                >
                  Minimizar
                </button>
                <button
                  type="button"
                  onClick={() => setAbierto(false)}
                  className="rounded-xl border border-white/10 bg-white/5 p-2 text-indigo-200/80 transition hover:bg-white/10 hover:text-white"
                  aria-label="Cerrar"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </header>

            <div
              ref={listaRef}
              className="relative min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-5"
            >
              {cargando && mensajes.length === 0 ? (
                <div className="flex justify-center py-12 text-indigo-200/40">
                  <svg className="h-8 w-8 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden>
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                </div>
              ) : mensajes.length === 0 ? (
                <p className="py-6 px-2 text-center text-sm text-indigo-200/45">
                  Todavía no hay mensajes. Escribí abajo para participar.
                </p>
              ) : (
                mensajes.map((m) => {
                  const deAdmin = m.direction === "admin";
                  const esMio = Boolean(currentUid && m.senderUid === currentUid);
                  const etiquetaAutor = deAdmin
                    ? "Administración"
                    : esMio
                      ? "Tu mensaje"
                      : m.puntoEtiqueta || "Punto";
                  const tieneReacciones = m.reactions && Object.keys(m.reactions).length > 0;
                  return (
                    <div key={m.id} className={`flex ${deAdmin ? "justify-start" : "justify-end"}`}>
                      <div className={`relative max-w-[92%] ${deAdmin ? "" : "flex flex-col items-end"}`}>
                        <div
                          className={`rounded-2xl px-3 py-2.5 text-sm leading-relaxed shadow-md ${
                            deAdmin
                              ? "rounded-tl-md border border-indigo-400/30 bg-gradient-to-br from-indigo-100/95 to-violet-100/90 text-gray-900"
                              : "rounded-tr-md border border-white/10 bg-gradient-to-br from-emerald-800 to-teal-900 text-white"
                          }`}
                        >
                          {!deAdmin && m.puntoEtiqueta && !esMio ? (
                            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-100/90">
                              {m.puntoEtiqueta}
                            </p>
                          ) : null}
                          {m.imageUrl ? (
                            <a
                              href={m.imageUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mb-2 block"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={m.imageUrl}
                                alt="Imagen adjunta"
                                className="max-h-44 max-w-full rounded-lg object-cover"
                                loading="lazy"
                                referrerPolicy="no-referrer"
                              />
                            </a>
                          ) : null}
                          {m.text ? <p className="whitespace-pre-wrap break-words">{m.text}</p> : null}
                          <p
                            className={`mt-1 text-[10px] font-semibold uppercase tracking-wide ${
                              deAdmin ? "text-indigo-900/45" : "text-emerald-100/75"
                            }`}
                          >
                            {etiquetaAutor} · {formatHora(m.createdAtMs)}
                          </p>
                        </div>

                        {tieneReacciones ? (
                          <div
                            className={`mt-1 flex flex-wrap gap-1 ${deAdmin ? "justify-start" : "justify-end"}`}
                          >
                            {Object.entries(m.reactions!).map(([emoji, userIds]) => {
                              const mia = Boolean(currentUid && userIds.includes(currentUid));
                              return (
                                <button
                                  key={emoji}
                                  type="button"
                                  disabled={reaccionandoId === m.id}
                                  onClick={() => void reaccionar(m.id, emoji)}
                                  className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs ring-1 transition disabled:opacity-50 ${
                                    mia
                                      ? "bg-indigo-500/30 ring-indigo-400/60 text-white"
                                      : deAdmin
                                        ? "bg-white/90 ring-slate-200 text-slate-700 hover:bg-white"
                                        : "bg-white/10 ring-white/20 text-indigo-100 hover:bg-white/15"
                                  }`}
                                  title={
                                    userIds.length > 1
                                      ? `${emoji} · ${userIds.length} personas`
                                      : emoji
                                  }
                                >
                                  <span>{emoji}</span>
                                  {userIds.length > 1 ? (
                                    <span className="text-[10px] font-semibold opacity-80">{userIds.length}</span>
                                  ) : null}
                                </button>
                              );
                            })}
                          </div>
                        ) : null}

                        <div
                          className={`mt-1 flex items-center gap-1 ${deAdmin ? "justify-start" : "justify-end"}`}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setReactionMessageId((prev) => (prev === m.id ? null : m.id))
                            }
                            className={`rounded-lg px-2 py-1 text-[11px] font-medium transition ${
                              reactionMessageId === m.id
                                ? "bg-indigo-500/25 text-indigo-100"
                                : "text-indigo-200/50 hover:bg-white/10 hover:text-indigo-100"
                            }`}
                            aria-label="Reaccionar al mensaje"
                            title="Reaccionar"
                          >
                            😊
                          </button>
                        </div>

                        {reactionMessageId === m.id ? (
                          <div
                            className={`mt-1 flex flex-wrap gap-1 rounded-xl border border-white/10 bg-black/40 p-2 shadow-lg ${
                              deAdmin ? "" : "justify-end"
                            }`}
                            data-reaction-picker
                          >
                            {POS_BROADCAST_QUICK_REACT_EMOJIS.map((emoji) => (
                              <button
                                key={emoji}
                                type="button"
                                disabled={reaccionandoId === m.id}
                                onClick={() => void reaccionar(m.id, emoji)}
                                className="rounded-lg px-2 py-1 text-lg transition hover:bg-white/15 disabled:opacity-50"
                                aria-label={`Reaccionar con ${emoji}`}
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {error ? (
              <p className="relative px-3 text-center text-xs text-rose-300" role="alert">
                {error}
              </p>
            ) : null}

            <footer className="relative border-t border-white/10 bg-black/25 p-3">
              {imagenPendiente ? (
                <div className="relative mb-2 inline-block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imagenPendiente.previewUrl}
                    alt="Vista previa"
                    className="h-16 max-w-[140px] rounded-lg border border-white/20 object-cover"
                  />
                  <button
                    type="button"
                    onClick={quitarImagenPendiente}
                    className="absolute -right-1.5 -top-1.5 rounded-full bg-slate-900/90 p-1 text-white ring-1 ring-white/20"
                    aria-label="Quitar imagen"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ) : null}
              {emojiPickerAbierto ? (
                <div className="mb-2 rounded-2xl border border-indigo-500/20 bg-white/[0.07] p-2 shadow-inner">
                  <div className="flex flex-wrap gap-1.5">
                    {EMOJIS_CHAT_RAPIDO.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => insertarEmoji(emoji)}
                        className="rounded-xl px-2.5 py-1.5 text-xl transition hover:bg-white/12"
                        aria-label={`Agregar emoji ${emoji}`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="flex gap-2 rounded-2xl border border-indigo-500/25 bg-white/[0.06] p-1.5 focus-within:border-indigo-400/50">
                <input
                  ref={inputImagenRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/*"
                  className="hidden"
                  onChange={(e) => void onElegirImagen(e.target.files?.[0] ?? null)}
                />
                <button
                  type="button"
                  disabled={enviando}
                  onClick={() => inputImagenRef.current?.click()}
                  className="flex h-11 w-11 shrink-0 items-center justify-center self-end rounded-xl border border-white/15 text-indigo-100/90 transition hover:bg-white/10 disabled:opacity-40"
                  aria-label="Adjuntar imagen"
                  title="Adjuntar imagen"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => setEmojiPickerAbierto((v) => !v)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center self-end rounded-xl border border-white/15 text-xl text-indigo-100/90 transition hover:bg-white/10"
                  aria-label="Agregar emoji"
                  title="Agregar emoji"
                >
                  😊
                </button>
                <textarea
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  placeholder="Escribí al grupo…"
                  rows={2}
                  className="min-h-[44px] flex-1 resize-none bg-transparent px-2 py-2 text-sm text-white placeholder:text-indigo-200/35 focus:outline-none"
                  disabled={enviando}
                  maxLength={4000}
                />
                <button
                  type="button"
                  disabled={enviando || (!texto.trim() && !imagenPendiente)}
                  onClick={() => void enviar()}
                  className="flex h-11 w-11 shrink-0 items-center justify-center self-end rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg transition hover:brightness-110 disabled:opacity-40"
                  aria-label="Enviar"
                >
                  {enviando ? (
                    <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden>
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  )}
                </button>
              </div>
            </footer>
          </div>
        </div>
      ) : null}
    </>
  );
}
