"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  wmsCajaMensajesListar,
  wmsCajaMensajesMarcarLeido,
  wmsCajaMensajesResponder,
  wmsCajaMensajesUnread,
  type PosCajaMensajeCliente,
} from "@/lib/wms-caja-mensajes-client";
import { EVENT_OPEN_CAJA_CHAT } from "@/lib/pos-geb-chat-event";

function formatHora(ms: number): string {
  if (!ms) return "—";
  try {
    return new Intl.DateTimeFormat("es-CO", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(ms));
  } catch {
    return "—";
  }
}

function IconBell({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2.2}
        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
      />
    </svg>
  );
}

function IconSend({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
    </svg>
  );
}

function IconX({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function IconSparkles({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path d="M11.5 2l1 4 4 1-4 1-1 4-1-4-4-1 4-1 1-4zm8 8l.5 2 2 .5-2 .5-.5 2-.5-2-2-.5 2-.5.5-2zm-6 10l.75 1.5 1.5.75-1.5.75-.75 1.5-.75-1.5-1.5-.75 1.5-.75.75-1.5z" />
    </svg>
  );
}

function Spinner({ className }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className ?? ""}`} fill="none" viewBox="0 0 24 24" aria-hidden>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

type Props = {
  getIdToken: () => Promise<string | null>;
  puntoVentaLabel?: string;
  visible?: boolean;
};

export default function PosCajaMensajesBell({ getIdToken, puntoVentaLabel, visible = true }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [minimizado, setMinimizado] = useState(false);
  const [posicionFlotante, setPosicionFlotante] = useState<{ x: number; y: number } | null>(null);
  const [autoAbrirPendiente, setAutoAbrirPendiente] = useState(false);
  const [unread, setUnread] = useState(0);
  const [mensajes, setMensajes] = useState<PosCajaMensajeCliente[]>([]);
  const [cargando, setCargando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const listaRef = useRef<HTMLDivElement>(null);
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
    const y = Math.max(margin, window.innerHeight - 88);
    const x = Math.max(margin, window.innerWidth - 320);
    setPosicionFlotante((prev) => prev ?? { x, y });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => {
      setPosicionFlotante((prev) => {
        if (!prev) return prev;
        const maxX = Math.max(16, window.innerWidth - 320);
        const maxY = Math.max(16, window.innerHeight - 88);
        return {
          x: Math.min(Math.max(16, prev.x), maxX),
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
    const maxX = Math.max(16, window.innerWidth - 320);
    const maxY = Math.max(16, window.innerHeight - 88);
    setPosicionFlotante({
      x: Math.min(Math.max(16, drag.originX + deltaX), maxX),
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

  const fetchUnread = useCallback(async () => {
    const token = await getIdToken();
    if (!token) return;
    const r = await wmsCajaMensajesUnread(token);
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
    else if (process.env.NODE_ENV === "development") {
      console.warn("[PosCajaMensajes] no se pudo consultar no leídos:", r.error);
    }
  }, [getIdToken]);

  const cargarHilo = useCallback(async () => {
    const token = await getIdToken();
    if (!token) return;
    setCargando(true);
    setError(null);
    try {
      const r = await wmsCajaMensajesListar(token);
      if (r.ok) setMensajes(r.mensajes);
      else setError(r.error);
    } finally {
      setCargando(false);
    }
  }, [getIdToken]);

  useEffect(() => {
    if (!visible || typeof window === "undefined") return;
    const openDesdeCabecera = () => {
      abrirChat();
    };
    window.addEventListener(EVENT_OPEN_CAJA_CHAT, openDesdeCabecera);
    return () => window.removeEventListener(EVENT_OPEN_CAJA_CHAT, openDesdeCabecera);
  }, [visible, abrirChat]);

  useEffect(() => {
    if (!visible) return;
    void fetchUnread();
    const t2 = window.setTimeout(() => void fetchUnread(), 2000);
    const id = setInterval(() => void fetchUnread(), 10000);
    const onVis = () => {
      if (document.visibilityState === "visible") void fetchUnread();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearTimeout(t2);
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [visible, fetchUnread]);

  useEffect(() => {
    if (!abierto) return;
    void (async () => {
      const token = await getIdToken();
      if (token) await wmsCajaMensajesMarcarLeido(token);
      setUnread(0);
      prevUnreadRef.current = 0;
    })();
    void cargarHilo();
    const id = setInterval(() => void cargarHilo(), 6000);
    return () => clearInterval(id);
  }, [abierto, cargarHilo, getIdToken]);

  useEffect(() => {
    if (!autoAbrirPendiente || !visible) return;
    setAbierto(true);
    setMinimizado(false);
    setAutoAbrirPendiente(false);
  }, [autoAbrirPendiente, visible]);

  useEffect(() => {
    if (!abierto || !listaRef.current) return;
    listaRef.current.scrollTop = listaRef.current.scrollHeight;
  }, [abierto, mensajes]);

  const enviar = async () => {
    const t = texto.trim();
    if (!t) return;
    setEnviando(true);
    setError(null);
    try {
      const token = await getIdToken();
      if (!token) {
        setError("Sesión inválida.");
        return;
      }
      const r = await wmsCajaMensajesResponder(token, t);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setTexto("");
      await cargarHilo();
    } finally {
      setEnviando(false);
    }
  };

  if (!visible) return null;

  return (
    <>
      <button
        type="button"
        onClick={abrirChat}
        className="group relative flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-amber-200/70 bg-gradient-to-br from-amber-50 via-white to-yellow-50 text-amber-900/80 shadow-[0_6px_20px_-8px_rgba(180,130,40,0.45),inset_0_1px_0_rgba(255,255,255,0.9)] transition-all hover:border-brand-yellow hover:text-amber-950 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-brand-yellow/50"
        title="Mensajes del administrativo (monitor de ventas). Tocá para leer y responder."
        aria-label="Mensajes del administrativo"
      >
        <IconBell className={`h-5 w-5 ${unread > 0 ? "animate-[pulse_2.2s_ease-in-out_infinite]" : ""}`} />
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-gradient-to-br from-red-500 to-amber-600 px-1 text-[10px] font-bold text-white shadow-md ring-2 ring-white">
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
          className="fixed z-[190] flex cursor-grab items-center gap-2 rounded-full border border-amber-300/80 bg-gradient-to-br from-amber-50 via-white to-yellow-50 px-4 py-3 text-sm font-semibold text-amber-950 shadow-[0_18px_40px_-16px_rgba(180,130,40,0.65)] transition hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-brand-yellow/50 active:cursor-grabbing"
          style={
            posicionFlotante
              ? {
                  left: `${posicionFlotante.x}px`,
                  top: `${posicionFlotante.y}px`,
                }
              : undefined
          }
          aria-label="Abrir chat con administración"
        >
          <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-900">
            <IconBell className="h-5 w-5" />
            {unread > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-gradient-to-br from-red-500 to-amber-600 px-1 text-[10px] font-bold text-white shadow-md ring-2 ring-white">
                {unread > 9 ? "9+" : unread}
              </span>
            ) : null}
          </span>
          <span className="text-left leading-tight">
            <span className="block">Chat administración</span>
            <span className="block text-[11px] font-medium text-amber-800/80">Pendiente por responder</span>
          </span>
        </button>
      ) : null}

      {abierto ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6">
          <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" />
          <div
            className="relative flex w-full max-w-md flex-col overflow-hidden rounded-3xl border border-amber-200/40 bg-gradient-to-b from-[#1c1410] via-[#231a14] to-[#181210] text-amber-50 shadow-[0_28px_90px_-20px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.05)] ring-2 ring-amber-500/25"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pos-caja-msg-title"
          >
            <div className="pointer-events-none absolute -left-16 -top-20 h-48 w-48 rounded-full bg-amber-500/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-12 -right-10 h-40 w-40 rounded-full bg-yellow-400/10 blur-3xl" />

            <header className="relative flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3.5">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-amber-400/90">
                  <IconSparkles className="h-4 w-4 shrink-0" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.22em]">Administración</span>
                </div>
                <h2 id="pos-caja-msg-title" className="mt-1 text-base font-semibold tracking-tight text-white">
                  Mensajes en vivo
                </h2>
                {puntoVentaLabel ? (
                  <p className="mt-0.5 truncate text-xs text-amber-200/50">{puntoVentaLabel}</p>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={minimizarChat}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-amber-200/80 transition hover:bg-white/10 hover:text-white"
                  aria-label="Minimizar"
                >
                  Minimizar
                </button>
                <button
                  type="button"
                  onClick={() => setAbierto(false)}
                  className="rounded-xl border border-white/10 bg-white/5 p-2 text-amber-200/80 transition hover:bg-white/10 hover:text-white"
                  aria-label="Cerrar"
                >
                  <IconX className="h-5 w-5" />
                </button>
              </div>
            </header>

            <div
              ref={listaRef}
              className="relative flex-1 space-y-2.5 overflow-y-auto px-3 py-3"
              style={{ maxHeight: "min(52vh, 420px)" }}
            >
              {cargando && mensajes.length === 0 ? (
                <div className="flex justify-center py-12 text-amber-200/50">
                  <Spinner className="h-8 w-8" />
                </div>
              ) : mensajes.length === 0 ? (
                <p className="py-6 px-2 text-center text-sm text-amber-200/45">
                  No hay mensajes en este hilo. Si el monitor ya envió uno: usá la misma cuenta POS que en el monitor.
                  El POS habla con el WMS por servidor (proxy); en Vercel definí{" "}
                  <span className="text-amber-100/80">NEXT_PUBLIC_WMS_URL</span> en el proyecto del POS.
                </p>
              ) : (
                mensajes.map((m) => {
                  const deAdmin = m.direction === "admin_to_pos";
                  return (
                    <div key={m.id} className={`flex ${deAdmin ? "justify-start" : "justify-end"}`}>
                      <div
                        className={`max-w-[92%] rounded-2xl px-3 py-2.5 text-sm leading-relaxed shadow-md ${
                          deAdmin
                            ? "rounded-tl-md border border-amber-400/25 bg-gradient-to-br from-amber-100/95 to-amber-50/90 text-gray-900"
                            : "rounded-tr-md bg-gradient-to-br from-emerald-700 to-teal-800 text-white"
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">{m.text}</p>
                        <p
                          className={`mt-1 text-[10px] font-semibold uppercase tracking-wide ${
                            deAdmin ? "text-amber-900/45" : "text-emerald-100/75"
                          }`}
                        >
                          {deAdmin ? "Administración" : "Tu respuesta"} · {formatHora(m.createdAtMs)}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {error ? (
              <p className="relative px-3 text-center text-xs text-red-300" role="alert">
                {error}
              </p>
            ) : null}

            <footer className="relative border-t border-white/10 bg-black/25 p-3">
              <div className="flex gap-2 rounded-2xl border border-amber-500/20 bg-white/[0.06] p-1.5 focus-within:border-brand-yellow/50 focus-within:ring-1 focus-within:ring-brand-yellow/30">
                <textarea
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  placeholder="Responder a administración…"
                  rows={2}
                  className="min-h-[44px] flex-1 resize-none bg-transparent px-2 py-2 text-sm text-white placeholder:text-amber-200/35 focus:outline-none"
                  disabled={enviando}
                  maxLength={4000}
                />
                <button
                  type="button"
                  disabled={enviando || !texto.trim()}
                  onClick={() => void enviar()}
                  className="flex h-11 w-11 shrink-0 items-center justify-center self-end rounded-xl bg-gradient-to-br from-brand-yellow to-amber-600 text-gray-900 shadow-lg transition hover:brightness-105 disabled:opacity-40"
                  aria-label="Enviar respuesta"
                >
                  {enviando ? <Spinner className="h-5 w-5" /> : <IconSend className="h-5 w-5" />}
                </button>
              </div>
            </footer>
          </div>
        </div>
      ) : null}
    </>
  );
}
