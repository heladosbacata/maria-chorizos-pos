"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import PosBodyPortal from "@/components/PosBodyPortal";
import PosBroadcastBell from "@/components/PosBroadcastBell";
import PosCajaMensajesBell from "@/components/PosCajaMensajesBell";
import {
  cargarPosicionDockChat,
  clampPosicionDockChat,
  guardarPosicionDockChat,
  posicionInicialDockChat,
} from "@/lib/pos-chat-dock-layout";

type Props = {
  getIdToken: () => Promise<string | null>;
  currentUid?: string | null;
  puntoVentaLabel?: string;
  visible?: boolean;
};

/**
 * Acceso flotante a los chats del POS (arrastrable).
 * Solo en la franja entre el menú izquierdo y «Cuenta a cobrar», sin tapar la operación.
 */
export default function PosChatFloatingDock({
  getIdToken,
  currentUid,
  puntoVentaLabel,
  visible = true,
}: Props) {
  const dockRef = useRef<HTMLDivElement>(null);
  const [posicion, setPosicion] = useState<{ x: number; y: number } | null>(null);
  const [unreadCaja, setUnreadCaja] = useState(0);
  const [unreadGrupal, setUnreadGrupal] = useState(0);
  const [grupalActivo, setGrupalActivo] = useState(false);
  const totalUnread = unreadCaja + unreadGrupal;
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const medidasDock = useCallback(() => {
    const w = dockRef.current?.offsetWidth ?? 280;
    const h = dockRef.current?.offsetHeight ?? 68;
    return { w, h };
  }, []);

  const clampPos = useCallback(
    (x: number, y: number) => {
      const { w, h } = medidasDock();
      return clampPosicionDockChat(x, y, w, h);
    },
    [medidasDock]
  );

  const fijarPosicionInicial = useCallback(() => {
    if (typeof window === "undefined") return;
    const { w, h } = medidasDock();
    const guardada = cargarPosicionDockChat();
    const base = guardada ? clampPos(guardada.x, guardada.y) : posicionInicialDockChat(w, h);
    setPosicion((prev) => prev ?? base);
  }, [clampPos, medidasDock]);

  useLayoutEffect(() => {
    if (!visible) return;
    fijarPosicionInicial();
  }, [visible, fijarPosicionInicial]);

  useEffect(() => {
    if (!visible) return;
    const id = window.requestAnimationFrame(() => fijarPosicionInicial());
    return () => window.cancelAnimationFrame(id);
  }, [visible, fijarPosicionInicial]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => {
      setPosicion((prev) => (prev ? clampPos(prev.x, prev.y) : prev));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [clampPos]);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!posicion) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: posicion.x,
      originY: posicion.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [posicion]);

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const nextX = drag.originX + event.clientX - drag.startX;
    const nextY = drag.originY + event.clientY - drag.startY;
    setPosicion(clampPos(nextX, nextY));
  }, [clampPos]);

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (dragRef.current?.pointerId === event.pointerId) {
        dragRef.current = null;
        event.currentTarget.releasePointerCapture(event.pointerId);
        setPosicion((p) => {
          if (p) guardarPosicionDockChat(p);
          return p;
        });
      }
    },
    []
  );

  const onPointerCancel = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  }, []);

  if (!visible) return null;

  return (
    <PosBodyPortal open>
    <div
      ref={dockRef}
      data-pos-chat-dock="1"
      className="fixed z-[215] flex max-w-[calc(100vw-1.5rem)] items-center gap-2 rounded-[1.35rem] border-2 border-amber-300/80 bg-gradient-to-br from-white via-amber-50/95 to-indigo-50/95 px-3.5 py-2.5 shadow-[0_22px_60px_-12px_rgba(15,23,42,0.75)] ring-2 ring-amber-400/40"
      style={
        posicion
          ? { left: `${posicion.x}px`, top: `${posicion.y}px`, right: "auto", bottom: "auto" }
          : { right: "1.25rem", bottom: "1.25rem", left: "auto", top: "auto" }
      }
      role="navigation"
      aria-label={
        totalUnread > 0
          ? `Chats del POS, ${totalUnread} mensaje${totalUnread === 1 ? "" : "s"} sin leer`
          : "Chats del POS"
      }
    >
      {totalUnread > 0 ? (
        <span
          className="pointer-events-none absolute -right-1.5 -top-1.5 z-20 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-gradient-to-br from-red-500 to-rose-600 px-1.5 text-[10px] font-bold text-white shadow-[0_4px_14px_-2px_rgba(220,38,38,0.65)] ring-2 ring-white"
          aria-hidden
        >
          {totalUnread > 9 ? "9+" : totalUnread}
        </span>
      ) : null}
      <div
        className="flex min-w-0 cursor-grab touch-none select-none items-center gap-2 pr-1 active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        title="Arrastrá para mover. Queda entre el menú y la cuenta a cobrar, sin tapar la venta."
        aria-label="Mover chats flotantes"
      >
        <span className="grid h-8 w-4 shrink-0 grid-cols-2 gap-0.5 text-slate-400" aria-hidden>
          <span className="h-1 w-1 rounded-full bg-current" />
          <span className="h-1 w-1 rounded-full bg-current" />
          <span className="h-1 w-1 rounded-full bg-current" />
          <span className="h-1 w-1 rounded-full bg-current" />
          <span className="h-1 w-1 rounded-full bg-current" />
          <span className="h-1 w-1 rounded-full bg-current" />
        </span>
        <div className="hidden min-w-0 sm:block">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Chats POS</p>
          <p className="text-[11px] font-semibold text-slate-800">Privado y grupal</p>
        </div>
      </div>
      <div className="h-9 w-px bg-slate-200/80" aria-hidden />
      <div className="flex items-center gap-2">
        <PosCajaMensajesBell
          getIdToken={getIdToken}
          puntoVentaLabel={puntoVentaLabel}
          onUnreadChange={setUnreadCaja}
        />
        <PosBroadcastBell
          getIdToken={getIdToken}
          currentUid={currentUid}
          onUnreadChange={setUnreadGrupal}
          onSesionActivaChange={setGrupalActivo}
          mostrarBotonSiInactivo
        />
        {!grupalActivo ? (
          <span
            className="sr-only"
            aria-live="polite"
          >
            Chat grupal: canal no abierto por administración
          </span>
        ) : null}
      </div>
    </div>
    </PosBodyPortal>
  );
}
