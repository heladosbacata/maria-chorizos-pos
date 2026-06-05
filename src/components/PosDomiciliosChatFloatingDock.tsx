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
  type DomiciliosAbrirChatDetail,
} from "@/lib/pos-domicilios-chat-event";
import {
  ESTADOS_ACTIVOS_DOMICILIO,
  etiquetaEstadoDomicilio,
  leerMapaVistoChatDomicilios,
  marcarChatDomicilioLeido,
} from "@/lib/pos-domicilios-chat-utils";
import { EVENT_DOMICILIOS_FORZAR_REFRESH } from "@/lib/pos-domicilios-nuevos-event";
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
    }, 10_000);
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

  return (
    <>
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
          {panelAbierto ? (
            <div className="w-[min(100vw-2rem,22rem)] overflow-hidden rounded-2xl border-2 border-cyan-300/80 bg-white shadow-[0_22px_60px_-12px_rgba(15,23,42,0.75)]">
              <div className="flex items-center justify-between gap-2 border-b border-cyan-100 bg-gradient-to-r from-cyan-700 to-sky-600 px-3 py-2.5 text-white">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-100">Chats activos</p>
                  <p className="text-xs font-bold">Domicilios premium</p>
                </div>
                <button
                  type="button"
                  onClick={() => setPanelAbierto(false)}
                  className="rounded-lg border border-white/30 p-1 hover:bg-white/15"
                  aria-label="Cerrar lista de chats"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="max-h-72 overflow-y-auto bg-slate-50 p-2">
                {pedidosActivos.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-200 bg-white px-3 py-6 text-center text-xs text-slate-500">
                    No hay pedidos activos con chat. Cuando llegue un domicilio, aparecerá aquí.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {pedidosActivos.map((p) => {
                      const unread = unreadPorPedido[p.id] ?? 0;
                      return (
                        <li key={p.id}>
                          <button
                            type="button"
                            onClick={() =>
                              abrirChat({ pedido: p, marcoEntradaNuevo: p.estado === "NUEVO", enviarResumenAuto: false })
                            }
                            className="flex w-full items-start gap-2 rounded-xl border border-cyan-100 bg-white px-3 py-2.5 text-left shadow-sm transition hover:border-cyan-300 hover:bg-cyan-50/80"
                          >
                            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-100 text-cyan-800">
                              <MessageCircle className="h-4 w-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-2">
                                <span className="truncate text-sm font-bold text-slate-900">{p.cliente}</span>
                                {unread > 0 ? (
                                  <span className="shrink-0 rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-black text-white">
                                    {unread}
                                  </span>
                                ) : null}
                              </span>
                              <span className="mt-0.5 block truncate text-[11px] font-semibold text-cyan-800">{p.id}</span>
                              <span className="mt-0.5 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
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
          ) : null}

          <div
            className={`relative flex items-center gap-2 rounded-[1.35rem] border-2 px-3.5 py-2.5 shadow-[0_22px_60px_-12px_rgba(15,23,42,0.75)] ${
              totalNoLeidos > 0
                ? "border-amber-400/90 bg-gradient-to-br from-amber-50 via-cyan-50 to-sky-50 ring-2 ring-amber-400/50 animate-[pulse_2s_ease-in-out_infinite]"
                : "border-cyan-300/80 bg-gradient-to-br from-white via-cyan-50/95 to-sky-50/95 ring-2 ring-cyan-400/30"
            }`}
          >
            {totalNoLeidos > 0 ? (
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
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-700">Domicilios</p>
                <p className="text-[11px] font-semibold text-slate-800">
                  {pedidosActivos.length} chat{pedidosActivos.length === 1 ? "" : "s"} activo
                  {pedidosActivos.length === 1 ? "" : "s"}
                </p>
              </div>
            </div>
            <div className="h-9 w-px bg-cyan-200/80" aria-hidden />
            <button
              type="button"
              onClick={() => setPanelAbierto((v) => !v)}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-600 to-sky-600 px-3 py-2 text-xs font-bold text-white shadow-md transition hover:brightness-110 active:scale-[0.98]"
              aria-expanded={panelAbierto}
              aria-label={
                totalNoLeidos > 0
                  ? `Abrir chats de domicilios, ${totalNoLeidos} mensaje${totalNoLeidos === 1 ? "" : "s"} sin leer`
                  : "Abrir chats de domicilios"
              }
            >
              <Truck className="h-4 w-4" strokeWidth={2} />
              <span className="hidden sm:inline">Chats</span>
            </button>
          </div>
        </div>
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
