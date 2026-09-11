"use client";

import { useState } from "react";
import PosBroadcastBell from "@/components/PosBroadcastBell";
import PosCajaMensajesBell from "@/components/PosCajaMensajesBell";

type Props = {
  getIdToken: () => Promise<string | null>;
  currentUid?: string | null;
  puntoVentaLabel?: string;
  visible?: boolean;
  /**
   * `sidebar` = chat privado admin (compacto en menú).
   * `flotante` = legado.
   * El chat grupal vive en el panel de retos del mes.
   */
  variant?: "sidebar" | "flotante";
};

/**
 * Acceso a chat privado con administración (barra lateral).
 * El chat grupal se muestra en el cuadro de retos del mes.
 */
export default function PosChatFloatingDock({
  getIdToken,
  currentUid: _currentUid,
  puntoVentaLabel,
  visible = true,
  variant = "sidebar",
}: Props) {
  const [unreadCaja, setUnreadCaja] = useState(0);
  void _currentUid;

  if (!visible) return null;

  if (variant === "sidebar") {
    return (
      <div
        data-pos-tutorial="nav-chats-pos"
        data-pos-chat-dock="sidebar"
        className="relative w-full overflow-hidden rounded-xl border-2 border-amber-400 bg-gradient-to-br from-brand-yellow via-amber-300 to-amber-500 p-2 shadow-[0_8px_22px_-10px_rgba(245,158,11,0.7)] ring-2 ring-amber-300/50"
        role="navigation"
        aria-label={
          unreadCaja > 0
            ? `Chat con administración, ${unreadCaja} sin leer`
            : "Chat con administración"
        }
      >
        {unreadCaja > 0 ? (
          <span
            className="absolute right-1.5 top-1.5 z-10 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-black text-white shadow-md ring-2 ring-white"
            aria-hidden
          >
            {unreadCaja > 9 ? "9+" : unreadCaja}
          </span>
        ) : null}
        <div className="relative flex items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-950/90 text-brand-yellow">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-gray-950">Chat admin</p>
            <p className="text-[9px] font-bold uppercase tracking-wide text-amber-950/70">Premium</p>
          </div>
          <PosCajaMensajesBell
            getIdToken={getIdToken}
            puntoVentaLabel={puntoVentaLabel}
            onUnreadChange={setUnreadCaja}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      data-pos-chat-dock="1"
      className="fixed bottom-5 right-5 z-[215] flex items-center gap-2 rounded-[1.35rem] border-2 border-amber-300/80 bg-white px-3 py-2 shadow-xl"
      role="navigation"
      aria-label="Chat administración"
    >
      <PosCajaMensajesBell
        getIdToken={getIdToken}
        puntoVentaLabel={puntoVentaLabel}
        onUnreadChange={setUnreadCaja}
      />
    </div>
  );
}
