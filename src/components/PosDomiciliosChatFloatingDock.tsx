"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { MessageCircle, Truck, X } from "lucide-react";
import PosBodyPortal from "@/components/PosBodyPortal";
import PosDomiciliosChatModal from "@/components/PosDomiciliosChatModal";
import { MASCOTA_DOMICILIOS_URL } from "@/lib/brand";
import { domiciliosListar } from "@/lib/pos-domicilios-api";
import { listarMensajesChatDomicilio } from "@/lib/pos-domicilios-chat-api";
import {
  cargarPosicionDockDomiciliosChat,
  clampPosicionDockDomiciliosChat,
  guardarPosicionDockDomiciliosChat,
  posicionInicialDockDomiciliosChat,
} from "@/lib/pos-domicilios-chat-dock-layout";
import {
  EVENT_DOMICILIOS_ABRIR_CHAT,
  emitirDomiciliosMensajeCliente,
  type DomiciliosAbrirChatDetail,
} from "@/lib/pos-domicilios-chat-event";
import {
  ESTADOS_ACTIVOS_DOMICILIO,
  etiquetaEstadoDomicilio,
  leerMapaVistoChatDomicilios,
  marcarChatDomicilioLeido,
} from "@/lib/pos-domicilios-chat-utils";
import {
  EVENT_DOMICILIOS_ALERTA_ATENDIDA,
  EVENT_DOMICILIOS_AVISO_PEDIDO_NUEVO,
  EVENT_DOMICILIOS_FORZAR_REFRESH,
  emitirDomiciliosAbrirAlertaPedido,
  type DomiciliosAvisoPedidoNuevoDetail,
} from "@/lib/pos-domicilios-nuevos-event";
import { reproducirAlertaNuevoPedidoDomicilio } from "@/lib/pos-domicilios-sonidos";
import type { PedidoDomicilio } from "@/types/pos-domicilios";

type Props = {
  puntoVenta?: string | null;
  visible?: boolean;
};

type UnreadPorPedido = Record<string, number>;

export default function PosDomiciliosChatFloatingDock({ puntoVenta, visible = true }: Props) {
  const pv = (puntoVenta ?? "").trim();
  const dockRef = useRef<HTMLDivElement>(null);
  const [posicion, setPosicion] = useState<{ x: number; y: number } | null>(null);
  const [panelAbierto, setPanelAbierto] = useState(false);
  const [pedidosActivos, setPedidosActivos] = useState<PedidoDomicilio[]>([]);
  const [unreadPorPedido, setUnreadPorPedido] = useState<UnreadPorPedido>({});
  const [chatPedido, setChatPedido] = useState<PedidoDomicilio | null>(null);
  const [chatMarcoNuevo, setChatMarcoNuevo] = useState(false);
  const [chatEnviarResumen, setChatEnviarResumen] = useState(false);
  const [toastMensajeCliente, setToastMensajeCliente] = useState<{
    texto: string;
    pedidoId: string;
  } | null>(null);
  const [avisoPedidoNuevo, setAvisoPedidoNuevo] = useState<DomiciliosAvisoPedidoNuevoDetail | null>(null);
  const unreadPrevRef = useRef<UnreadPorPedido>({});
  const totalUnreadPrevRef = useRef(0);
  const lastAlertAtRef = useRef(0);
  const chatPedidoIdAbiertoRef = useRef<string | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const totalNoLeidos = useMemo(
    () => Object.values(unreadPorPedido).reduce((acc, n) => acc + n, 0),
    [unreadPorPedido]
  );

  useEffect(() => {
    chatPedidoIdAbiertoRef.current = chatPedido?.id ?? null;
  }, [chatPedido?.id]);

  useEffect(() => {
    const onAviso = (e: Event) => {
      const detail = (e as CustomEvent<DomiciliosAvisoPedidoNuevoDetail>).detail;
      if (!detail?.pedido) return;
      setAvisoPedidoNuevo(detail);
      try {
        if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
          navigator.vibrate([120, 60, 120, 60, 180, 80, 220]);
        }
      } catch {
        /* ignore */
      }
    };
    const onAtendida = () => setAvisoPedidoNuevo(null);
    window.addEventListener(EVENT_DOMICILIOS_AVISO_PEDIDO_NUEVO, onAviso);
    window.addEventListener(EVENT_DOMICILIOS_ALERTA_ATENDIDA, onAtendida);
    return () => {
      window.removeEventListener(EVENT_DOMICILIOS_AVISO_PEDIDO_NUEVO, onAviso);
      window.removeEventListener(EVENT_DOMICILIOS_ALERTA_ATENDIDA, onAtendida);
    };
  }, []);

  const abrirAlertaPedidoNuevo = useCallback(() => {
    setAvisoPedidoNuevo(null);
    emitirDomiciliosAbrirAlertaPedido();
  }, []);

  useEffect(() => {
    const prevTotal = totalUnreadPrevRef.current;
    const prevMap = unreadPrevRef.current;
    unreadPrevRef.current = unreadPorPedido;
    totalUnreadPrevRef.current = totalNoLeidos;

    if (totalNoLeidos <= prevTotal || totalNoLeidos <= 0) return;
    // No alertar si el cajero ya tiene ese chat abierto
    const subio = Object.keys(unreadPorPedido).find((id) => {
      if (chatPedidoIdAbiertoRef.current === id) return false;
      return (unreadPorPedido[id] ?? 0) > (prevMap[id] ?? 0);
    });
    if (!subio) return;

    const now = Date.now();
    if (now - lastAlertAtRef.current < 4500) return;
    lastAlertAtRef.current = now;

    const pedido = pedidosActivos.find((p) => p.id === subio);
    const nombre = pedido?.cliente?.trim() || "Cliente";
    const noLeidosPedido = unreadPorPedido[subio] ?? 1;
    reproducirAlertaNuevoPedidoDomicilio(pv);
    try {
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        navigator.vibrate([80, 40, 80]);
      }
    } catch {
      /* ignore */
    }
    emitirDomiciliosMensajeCliente({
      puntoVenta: pv,
      pedidoId: subio,
      clienteNombre: nombre,
      noLeidosPedido,
      noLeidosTotal: totalNoLeidos,
    });
    setToastMensajeCliente({
      texto: `Nuevo mensaje de ${nombre} · pedido ${subio}`,
      pedidoId: subio,
    });
    const t = window.setTimeout(() => setToastMensajeCliente(null), 8000);
    return () => window.clearTimeout(t);
  }, [unreadPorPedido, totalNoLeidos, pedidosActivos, pv]);

  const abrirChat = useCallback((detail: DomiciliosAbrirChatDetail) => {
    setChatPedido(detail.pedido);
    setChatMarcoNuevo(Boolean(detail.marcoEntradaNuevo));
    setChatEnviarResumen(Boolean(detail.enviarResumenAuto));
    marcarChatDomicilioLeido(detail.pedido.puntoVenta, detail.pedido.id);
    setUnreadPorPedido((cur) => ({ ...cur, [detail.pedido.id]: 0 }));
    setPanelAbierto(false);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<DomiciliosAbrirChatDetail>).detail;
      if (!detail?.pedido) return;
      abrirChat(detail);
    };
    window.addEventListener(EVENT_DOMICILIOS_ABRIR_CHAT, handler);
    return () => window.removeEventListener(EVENT_DOMICILIOS_ABRIR_CHAT, handler);
  }, [abrirChat]);

  const cargarPedidosYUnread = useCallback(async () => {
    if (!pv) {
      setPedidosActivos([]);
      setUnreadPorPedido({});
      return;
    }
    const res = await domiciliosListar(pv);
    if (!res.ok) return;
    const activos = res.data
      .filter((p) => ESTADOS_ACTIVOS_DOMICILIO.includes(p.estado))
      .sort((a, b) => new Date(b.creadoEnIso).getTime() - new Date(a.creadoEnIso).getTime());
    setPedidosActivos(activos);

    const mapaVisto = leerMapaVistoChatDomicilios(pv);
    const result: UnreadPorPedido = {};
    await Promise.all(
      activos.map(async (p) => {
        const chatRes = await listarMensajesChatDomicilio(p.puntoVenta, p.id);
        if (!chatRes.ok) {
          result[p.id] = 0;
          return;
        }
        const vistoAt = mapaVisto[p.id] ? new Date(mapaVisto[p.id]).getTime() : 0;
        result[p.id] = chatRes.data.filter((m) => {
          if (m.autor !== "cliente") return false;
          const t = new Date(m.creadoEnIso).getTime();
          return Number.isFinite(t) && t > vistoAt;
        }).length;
      })
    );
    setUnreadPorPedido(result);
  }, [pv]);

  useEffect(() => {
    if (!pv || !visible) return;
    void cargarPedidosYUnread();
    const t = window.setInterval(() => {
      void cargarPedidosYUnread().catch(() => undefined);
    }, 5_000);
    const onRefresh = () => {
      void cargarPedidosYUnread().catch(() => undefined);
    };
    window.addEventListener(EVENT_DOMICILIOS_FORZAR_REFRESH, onRefresh);
    return () => {
      window.clearInterval(t);
      window.removeEventListener(EVENT_DOMICILIOS_FORZAR_REFRESH, onRefresh);
    };
  }, [pv, visible, cargarPedidosYUnread]);

  const medidasDock = useCallback(() => {
    const w = dockRef.current?.offsetWidth ?? 280;
    const h = dockRef.current?.offsetHeight ?? 68;
    return { w, h };
  }, []);

  const clampPos = useCallback(
    (x: number, y: number) => {
      const { w, h } = medidasDock();
      return clampPosicionDockDomiciliosChat(x, y, w, h);
    },
    [medidasDock]
  );

  const fijarPosicionInicial = useCallback(() => {
    if (typeof window === "undefined") return;
    const { w, h } = medidasDock();
    const guardada = cargarPosicionDockDomiciliosChat();
    const base = guardada ? clampPos(guardada.x, guardada.y) : posicionInicialDockDomiciliosChat(w, h);
    setPosicion((prev) => prev ?? base);
  }, [clampPos, medidasDock]);

  useLayoutEffect(() => {
    if (!visible) return;
    fijarPosicionInicial();
  }, [visible, fijarPosicionInicial, panelAbierto, pedidosActivos.length]);

  useEffect(() => {
    if (!visible) return;
    const onResize = () => {
      setPosicion((prev) => (prev ? clampPos(prev.x, prev.y) : prev));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [visible, clampPos]);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!posicion) return;
      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: posicion.x,
        originY: posicion.y,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [posicion]
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const nextX = drag.originX + event.clientX - drag.startX;
      const nextY = drag.originY + event.clientY - drag.startY;
      setPosicion(clampPos(nextX, nextY));
    },
    [clampPos]
  );

  const onPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
      setPosicion((p) => {
        if (p) guardarPosicionDockDomiciliosChat(p);
        return p;
      });
    }
  }, []);

  const onPointerCancel = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  }, []);

  if (!visible || !pv) return null;

  const hayAvisoPedido = Boolean(avisoPedidoNuevo);

  return (
    <>
      {avisoPedidoNuevo ? (
        <PosBodyPortal open>
          <div className="fixed inset-x-0 bottom-[5.5rem] z-[231] flex justify-center px-3 sm:bottom-28 pointer-events-none">
            <button
              type="button"
              onClick={abrirAlertaPedidoNuevo}
              className="pointer-events-auto max-w-md animate-[pos-domicilios-shake_0.55s_ease-in-out_infinite] rounded-2xl border-2 border-amber-400 bg-gradient-to-r from-amber-50 via-orange-50 to-rose-50 px-4 py-3.5 text-left shadow-[0_20px_50px_-12px_rgba(245,158,11,0.55)] ring-4 ring-amber-400/50"
            >
              <p className="text-[10px] font-black uppercase tracking-wide text-amber-800">
                Chat domicilios · pedido nuevo
              </p>
              <p className="mt-0.5 text-sm font-black text-slate-900">
                ¡Llegó un pedido de {avisoPedidoNuevo.pedido.cliente.trim() || "un cliente"}!
              </p>
              <p className="mt-1 text-[11px] font-semibold text-rose-700">
                Tocá para abrir · aceptar o rechazar
                {avisoPedidoNuevo.cantidadEnCola > 1
                  ? ` · +${avisoPedidoNuevo.cantidadEnCola - 1} en cola`
                  : ""}
              </p>
            </button>
          </div>
        </PosBodyPortal>
      ) : null}
      {toastMensajeCliente && !avisoPedidoNuevo ? (
        <PosBodyPortal open>
          <div className="fixed inset-x-0 top-3 z-[230] flex justify-center px-3 pointer-events-none">
            <button
              type="button"
              className="pointer-events-auto max-w-md rounded-2xl border-2 border-amber-400 bg-amber-50 px-4 py-3 text-left shadow-2xl ring-2 ring-amber-300/60"
              onClick={() => {
                const p = pedidosActivos.find((x) => x.id === toastMensajeCliente.pedidoId);
                if (p) abrirChat({ pedido: p });
                setToastMensajeCliente(null);
              }}
            >
              <p className="text-[10px] font-black uppercase tracking-wide text-amber-800">Chat domicilios</p>
              <p className="mt-0.5 text-sm font-bold text-slate-900">{toastMensajeCliente.texto}</p>
              <p className="mt-1 text-[11px] font-semibold text-cyan-800">Tocá para abrir el chat</p>
            </button>
          </div>
        </PosBodyPortal>
      ) : null}
      <PosBodyPortal open>
        <div
          ref={dockRef}
          data-pos-domicilios-chat-dock="1"
          className="fixed z-[216] flex max-w-[calc(100vw-1.5rem)] flex-col items-stretch gap-2"
          style={
            posicion
              ? { left: `${posicion.x}px`, top: `${posicion.y}px`, right: "auto", bottom: "auto" }
              : { left: "17rem", bottom: "1.25rem", right: "auto", top: "auto" }
          }
        >
          <div
            className={`relative flex items-center gap-2 rounded-[1.35rem] border-2 px-3.5 py-2.5 shadow-[0_22px_60px_-12px_rgba(15,23,42,0.75)] ${
              hayAvisoPedido
                ? "animate-[pos-domicilios-shake_0.5s_ease-in-out_infinite] border-rose-500 bg-gradient-to-br from-amber-100 via-orange-50 to-rose-100 ring-4 ring-rose-400/60"
                : totalNoLeidos > 0
                  ? "border-amber-400/90 bg-gradient-to-br from-amber-50 via-cyan-50 to-sky-50 ring-2 ring-amber-400/50 animate-[pulse_2s_ease-in-out_infinite]"
                  : "border-cyan-300/80 bg-gradient-to-br from-white via-cyan-50/95 to-sky-50/95 ring-2 ring-cyan-400/30"
            }`}
          >
            {hayAvisoPedido ? (
              <span className="pointer-events-none absolute -right-1.5 -top-1.5 z-20 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-red-600 px-1.5 text-[10px] font-bold text-white shadow-lg ring-2 ring-white">
                !
              </span>
            ) : totalNoLeidos > 0 ? (
              <span className="pointer-events-none absolute -right-1.5 -top-1.5 z-20 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-red-600 px-1.5 text-[10px] font-bold text-white shadow-lg ring-2 ring-white">
                {totalNoLeidos > 9 ? "9+" : totalNoLeidos}
              </span>
            ) : null}
            <div
              className="flex cursor-grab touch-none select-none items-center gap-2 active:cursor-grabbing"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerCancel}
              title="Arrastrá para mover el acceso a chats de domicilios"
              aria-label="Mover chats de domicilios"
            >
              <span className="grid h-8 w-4 shrink-0 grid-cols-2 gap-0.5 text-slate-400" aria-hidden>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <span key={i} className="h-1 w-1 rounded-full bg-current" />
                ))}
              </span>
              <div className="hidden min-w-0 sm:block">
                <p
                  className={`text-[10px] font-black uppercase tracking-[0.2em] ${
                    hayAvisoPedido ? "text-rose-700" : "text-cyan-700"
                  }`}
                >
                  Domicilios
                </p>
                <p className="text-[11px] font-semibold text-slate-800">
                  {hayAvisoPedido
                    ? "¡Pedido nuevo!"
                    : `${pedidosActivos.length} chat${pedidosActivos.length === 1 ? "" : "s"} activo${
                        pedidosActivos.length === 1 ? "" : "s"
                      }`}
                </p>
              </div>
            </div>
            <div className="h-9 w-px bg-cyan-200/80" aria-hidden />
            <div className="relative flex flex-col items-center justify-end">
              <img
                src={MASCOTA_DOMICILIOS_URL}
                alt=""
                aria-hidden
                className="pointer-events-none mb-[-4px] h-10 w-auto max-w-[2.75rem] select-none object-contain drop-shadow-md sm:mb-[-6px] sm:h-14 sm:max-w-[3.75rem] md:h-16 md:max-w-[4.25rem]"
                draggable={false}
              />
              <button
                type="button"
                onClick={() => {
                  if (hayAvisoPedido) {
                    abrirAlertaPedidoNuevo();
                    return;
                  }
                  setPanelAbierto((v) => !v);
                }}
                className={`relative z-10 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-white shadow-md transition hover:brightness-110 active:scale-[0.98] ${
                  hayAvisoPedido
                    ? "bg-gradient-to-r from-rose-600 to-orange-500"
                    : "bg-gradient-to-r from-cyan-600 to-sky-600"
                }`}
                aria-expanded={panelAbierto}
                aria-label={
                  hayAvisoPedido
                    ? "Abrir pedido nuevo para aceptar o rechazar"
                    : totalNoLeidos > 0
                      ? `Abrir chats de domicilios, ${totalNoLeidos} mensaje${totalNoLeidos === 1 ? "" : "s"} sin leer`
                      : "Abrir chats de domicilios"
                }
              >
                <Truck className="h-4 w-4" strokeWidth={2} />
                <span className="hidden sm:inline">{hayAvisoPedido ? "Atender" : "Chats"}</span>
              </button>
            </div>
          </div>
        </div>
      </PosBodyPortal>

      <PosBodyPortal open={panelAbierto} lockScroll onEscape={() => setPanelAbierto(false)}>
        {panelAbierto ? (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-6">
            <button
              type="button"
              tabIndex={-1}
              className="absolute inset-0 z-0 bg-black/45 backdrop-blur-[2px]"
              aria-label="Cerrar lista de chats de domicilios"
              onClick={() => setPanelAbierto(false)}
            />
            <div
              className="relative z-10 flex h-[min(92vh,820px)] w-[min(100vw-1.5rem,56rem)] min-w-[min(100vw-1.5rem,20rem)] max-w-4xl flex-col overflow-hidden rounded-3xl border border-cyan-200/50 bg-gradient-to-b from-[#0c1f2e] via-[#0f2838] to-[#0a1824] text-cyan-50 shadow-[0_28px_90px_-20px_rgba(0,0,0,0.65)] ring-2 ring-cyan-500/25"
              role="dialog"
              aria-modal="true"
              aria-labelledby="pos-domicilios-chats-title"
            >
              <header className="flex shrink-0 items-start justify-between gap-3 border-b border-white/10 px-4 py-3.5 sm:px-5">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-300/90">Chats activos</p>
                  <h2 id="pos-domicilios-chats-title" className="mt-1 text-base font-semibold tracking-tight text-white">
                    Domicilios premium
                  </h2>
                  <p className="mt-0.5 text-xs text-cyan-200/60">
                    {pedidosActivos.length} pedido{pedidosActivos.length === 1 ? "" : "s"} con chat abierto
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPanelAbierto(false)}
                  className="shrink-0 rounded-xl border border-white/10 bg-white/5 p-2 text-cyan-200/80 transition hover:bg-white/10 hover:text-white"
                  aria-label="Cerrar lista de chats"
                >
                  <X className="h-5 w-5" />
                </button>
              </header>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
                {pedidosActivos.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-cyan-400/30 bg-white/5 px-4 py-16 text-center text-sm text-cyan-100/70">
                    No hay pedidos activos con chat. Cuando llegue un domicilio, aparecerá aquí.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {pedidosActivos.map((p) => {
                      const unread = unreadPorPedido[p.id] ?? 0;
                      return (
                        <li key={p.id}>
                          <button
                            type="button"
                            onClick={() =>
                              abrirChat({ pedido: p, marcoEntradaNuevo: p.estado === "NUEVO", enviarResumenAuto: false })
                            }
                            className="flex w-full items-start gap-3 rounded-2xl border border-cyan-400/25 bg-white/5 px-4 py-3.5 text-left shadow-sm transition hover:border-cyan-300/50 hover:bg-cyan-500/10"
                          >
                            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-500/20 text-cyan-200">
                              <MessageCircle className="h-5 w-5" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-2">
                                <span className="truncate text-base font-bold text-white">{p.cliente}</span>
                                {unread > 0 ? (
                                  <span className="shrink-0 rounded-full bg-rose-500 px-2 py-0.5 text-[11px] font-black text-white">
                                    {unread}
                                  </span>
                                ) : null}
                              </span>
                              <span className="mt-0.5 block truncate text-sm font-semibold text-cyan-200/80">{p.id}</span>
                              <span className="mt-1 inline-flex rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-semibold text-cyan-100/80">
                                {etiquetaEstadoDomicilio(p.estado)}
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </PosBodyPortal>

      <PosDomiciliosChatModal
        pedido={chatPedido}
        marcoEntradaNuevo={chatMarcoNuevo}
        enviarResumenAuto={chatEnviarResumen}
        onClose={() => {
          setChatPedido(null);
          setChatMarcoNuevo(false);
          setChatEnviarResumen(false);
          void cargarPedidosYUnread();
        }}
      />
    </>
  );
}
