"use client";

import { useState } from "react";
import PosBroadcastBell from "@/components/PosBroadcastBell";
import PosCajaMensajesBell from "@/components/PosCajaMensajesBell";

type Props = {
  getIdToken: () => Promise<string | null>;
  currentUid?: string | null;
  puntoVentaLabel?: string;
  className?: string;
};

function IconChat({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 18.5 6.4 16A7 7 0 1 1 12 19a6.9 6.9 0 0 1-2.9-.65L5 18.5Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Chip amarillo premium minimalista: Admin + Grupal en la barra de retos.
 */
export default function PosChatsPremiumBanner({
  getIdToken,
  currentUid,
  puntoVentaLabel,
  className = "",
}: Props) {
  const [unreadCaja, setUnreadCaja] = useState(0);
  const [unreadGrupal, setUnreadGrupal] = useState(0);
  const totalUnread = unreadCaja + unreadGrupal;

  return (
    <div
      data-pos-tutorial="nav-chats-pos"
      className={`relative inline-flex max-w-full items-center gap-1.5 rounded-full border border-amber-500/80 bg-gradient-to-r from-brand-yellow via-amber-300 to-amber-400 py-1 pl-2.5 pr-1.5 shadow-[0_6px_18px_-10px_rgba(180,83,9,0.55)] ${className}`}
      role="navigation"
      aria-label={
        totalUnread > 0
          ? `Chat, ${totalUnread} mensaje${totalUnread === 1 ? "" : "s"} sin leer`
          : "Chat"
      }
    >
      <span className="relative flex items-center gap-1 pr-0.5">
        <IconChat className="h-3.5 w-3.5 text-gray-950" />
        <span className="text-[10px] font-black uppercase tracking-[0.16em] text-gray-950">Chat</span>
        {totalUnread > 0 ? (
          <span className="absolute -right-1 -top-2 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-rose-600 px-0.5 text-[8px] font-bold leading-none text-white ring-1 ring-white">
            {totalUnread > 9 ? "9+" : totalUnread}
          </span>
        ) : null}
      </span>

      <span className="h-4 w-px shrink-0 bg-amber-800/20" aria-hidden />

      <div className="flex items-center gap-0.5 [&_button]:!h-7 [&_button]:!w-7 [&_button]:!rounded-full [&_button]:!border-amber-600/25 [&_button]:!bg-white/70 [&_button]:!shadow-none [&_button]:hover:!border-amber-700/40 [&_button]:hover:!bg-white [&_svg]:!h-3.5 [&_svg]:!w-3.5">
        <PosCajaMensajesBell
          getIdToken={getIdToken}
          puntoVentaLabel={puntoVentaLabel}
          onUnreadChange={setUnreadCaja}
        />
        <PosBroadcastBell
          getIdToken={getIdToken}
          currentUid={currentUid}
          onUnreadChange={setUnreadGrupal}
          mostrarBotonSiInactivo
        />
      </div>
    </div>
  );
}
