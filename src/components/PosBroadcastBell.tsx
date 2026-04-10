"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  wmsBroadcastEnviar,
  wmsBroadcastEstado,
  wmsBroadcastMarcarLeido,
  wmsBroadcastMensajes,
  wmsBroadcastUnread,
  type PosBroadcastMensajeCliente,
  type PosBroadcastSesionCliente,
} from "@/lib/wms-broadcast-client";

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
  visible?: boolean;
};

export default function PosBroadcastBell({ getIdToken, visible = true }: Props) {
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
    const id = setInterval(() => void pollEstado(), 12000);
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
    const id = setInterval(() => void fetchUnread(), 10000);
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
    const id = setInterval(() => void cargarHilo(), 6000);
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

  const enviar = async () => {
    const t = texto.trim();
    if (!t || !sesion) return;
    setEnviando(true);
    setError(null);
    try {
      const token = await getIdToken();
      if (!token) {
        setError("Sesión inválida.");
        return;
      }
      const r = await wmsBroadcastEnviar(token, t);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setTexto("");
      await cargarHilo();
      await fetchUnread();
    } finally {
      setEnviando(false);
    }
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
            className="relative flex w-full max-w-md flex-col overflow-hidden rounded-3xl border border-indigo-200/50 bg-gradient-to-b from-[#15122a] via-[#1a1630] to-[#120f1c] text-indigo-50 shadow-[0_28px_90px_-20px_rgba(0,0,0,0.65)] ring-2 ring-indigo-500/20"
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
              className="relative flex-1 space-y-2.5 overflow-y-auto px-3 py-3"
              style={{ maxHeight: "min(52vh, 420px)" }}
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
                  return (
                    <div key={m.id} className={`flex ${deAdmin ? "justify-start" : "justify-end"}`}>
                      <div
                        className={`max-w-[92%] rounded-2xl px-3 py-2.5 text-sm leading-relaxed shadow-md ${
                          deAdmin
                            ? "rounded-tl-md border border-indigo-400/30 bg-gradient-to-br from-indigo-100/95 to-violet-100/90 text-gray-900"
                            : "rounded-tr-md border border-white/10 bg-gradient-to-br from-emerald-800 to-teal-900 text-white"
                        }`}
                      >
                        {!deAdmin && m.puntoEtiqueta ? (
                          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-100/90">
                            {m.puntoEtiqueta}
                          </p>
                        ) : null}
                        <p className="whitespace-pre-wrap break-words">{m.text}</p>
                        <p
                          className={`mt-1 text-[10px] font-semibold uppercase tracking-wide ${
                            deAdmin ? "text-indigo-900/45" : "text-emerald-100/75"
                          }`}
                        >
                          {deAdmin ? "Administración" : "Tu mensaje"} · {formatHora(m.createdAtMs)}
                        </p>
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
              <div className="flex gap-2 rounded-2xl border border-indigo-500/25 bg-white/[0.06] p-1.5 focus-within:border-indigo-400/50">
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
                  disabled={enviando || !texto.trim()}
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
