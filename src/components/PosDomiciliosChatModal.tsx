"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { PosDomiciliosChatBurbuja } from "@/components/PosDomiciliosChatBurbuja";
import PosBodyPortal from "@/components/PosBodyPortal";
import { enviarMensajeChatDomicilio, listarMensajesChatDomicilio } from "@/lib/pos-domicilios-chat-api";
import { textoResumenPedidoParaConfirmacion } from "@/lib/pos-domicilios-resumen-chat";
import {
  formatoHoraChatDomicilio,
  marcarChatDomicilioLeido,
  RESPUESTAS_RAPIDAS_CHAT_DOMICILIO,
} from "@/lib/pos-domicilios-chat-utils";
import type { PedidoDomicilio } from "@/types/pos-domicilios";
import type { MensajeChatDomicilio } from "@/types/pos-domicilios-chat";

type Props = {
  pedido: PedidoDomicilio | null;
  marcoEntradaNuevo?: boolean;
  enviarResumenAuto?: boolean;
  onClose: () => void;
};

export default function PosDomiciliosChatModal({
  pedido,
  marcoEntradaNuevo = false,
  enviarResumenAuto = false,
  onClose,
}: Props) {
  const [chatMensajes, setChatMensajes] = useState<MensajeChatDomicilio[]>([]);
  const [chatTextoPos, setChatTextoPos] = useState("");
  const [chatCargando, setChatCargando] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatEnviando, setChatEnviando] = useState(false);
  const [marcoActivo, setMarcoActivo] = useState(marcoEntradaNuevo);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const resumenEnProcesoRef = useRef<Set<string>>(new Set());
  const resumenOkRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setMarcoActivo(marcoEntradaNuevo);
    if (marcoEntradaNuevo) {
      const t = window.setTimeout(() => setMarcoActivo(false), 8000);
      return () => window.clearTimeout(t);
    }
  }, [pedido?.id, marcoEntradaNuevo]);

  useEffect(() => {
    if (!pedido) {
      setChatMensajes([]);
      setChatTextoPos("");
      setChatError(null);
      return;
    }
    let activo = true;
    const cargar = async (silencioso = false) => {
      if (!silencioso) setChatCargando(true);
      const res = await listarMensajesChatDomicilio(pedido.puntoVenta, pedido.id);
      if (!activo) return;
      if (!res.ok) {
        if (!silencioso) setChatError(res.message ?? "No fue posible cargar el chat.");
      } else {
        setChatMensajes(res.data);
        setChatError(null);
        marcarChatDomicilioLeido(pedido.puntoVenta, pedido.id);
      }
      if (!silencioso) setChatCargando(false);
    };
    void cargar(false);
    const timer = window.setInterval(() => {
      void cargar(true);
    }, 4000);
    return () => {
      activo = false;
      window.clearInterval(timer);
    };
  }, [pedido]);

  useEffect(() => {
    if (!pedido) return;
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: "smooth" });
  }, [chatMensajes, pedido]);

  useEffect(() => {
    if (!pedido || !enviarResumenAuto) return;
    const pid = pedido.id;
    if (resumenOkRef.current.has(pid) || resumenEnProcesoRef.current.has(pid)) return;
    resumenEnProcesoRef.current.add(pid);
    const pv = pedido.puntoVenta;
    void (async () => {
      try {
        if (resumenOkRef.current.has(pid)) return;
        const resp = await enviarMensajeChatDomicilio({
          puntoVenta: pv,
          pedidoId: pid,
          autor: "pos",
          autorLabel: "POS",
          texto: textoResumenPedidoParaConfirmacion(pedido),
          tipoMensaje: "texto",
        });
        if (resp.ok) {
          resumenOkRef.current.add(pid);
          const refresh = await listarMensajesChatDomicilio(pv, pid);
          if (refresh.ok) setChatMensajes(refresh.data);
        }
      } finally {
        resumenEnProcesoRef.current.delete(pid);
      }
    })();
  }, [pedido, enviarResumenAuto]);

  const aplicarRespuestaRapidaChat = useCallback((texto: string) => {
    setChatTextoPos((prev) => {
      const t = prev.trim();
      return t ? `${t}\n\n${texto}` : texto;
    });
  }, []);

  const enviarMensajePos = async () => {
    if (!pedido || chatEnviando) return;
    const texto = chatTextoPos.trim();
    if (!texto) return;
    setChatEnviando(true);
    setChatError(null);
    const resp = await enviarMensajeChatDomicilio({
      puntoVenta: pedido.puntoVenta,
      pedidoId: pedido.id,
      autor: "pos",
      autorLabel: "POS",
      texto,
      tipoMensaje: "texto",
    });
    if (!resp.ok) {
      setChatError(resp.message ?? "No fue posible enviar el mensaje.");
      setChatEnviando(false);
      return;
    }
    setChatTextoPos("");
    if (resp.mensaje) {
      setChatMensajes((prev) => (prev.some((m) => m.id === resp.mensaje!.id) ? prev : [...prev, resp.mensaje!]));
    }
    const refresh = await listarMensajesChatDomicilio(pedido.puntoVenta, pedido.id);
    if (refresh.ok) setChatMensajes(refresh.data);
    setChatEnviando(false);
  };

  if (!pedido) return null;

  return (
    <PosBodyPortal open lockScroll onEscape={onClose}>
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-6">
        <button
          type="button"
          tabIndex={-1}
          aria-label="Cerrar chat de pedido"
          className="absolute inset-0 z-0 bg-black/45 backdrop-blur-[2px]"
          onClick={onClose}
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.93, y: 20 }}
          animate={{
            opacity: 1,
            scale: 1,
            y: 0,
            boxShadow: marcoActivo
              ? "0 0 0 3px rgba(251,191,36,0.85), 0 0 28px rgba(34,211,238,0.35), 0 28px 90px -20px rgba(0,0,0,0.65)"
              : "0 28px 90px -20px rgba(0,0,0,0.65)",
          }}
          transition={{
            type: "spring",
            stiffness: 300,
            damping: 32,
            mass: 0.92,
            boxShadow: { duration: 0.55, ease: [0.22, 1, 0.36, 1] },
          }}
          className={`relative z-10 flex h-[min(92vh,820px)] w-[min(100vw-1.5rem,56rem)] min-w-[min(100vw-1.5rem,20rem)] max-w-4xl flex-col ${marcoActivo ? "rounded-3xl bg-gradient-to-br from-amber-200 via-cyan-400 to-indigo-500 p-[3px] shadow-lg" : ""}`}
          role="dialog"
          aria-modal="true"
        >
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-cyan-200/50 bg-white shadow-2xl">
            <header className="flex shrink-0 items-start justify-between gap-3 bg-gradient-to-r from-cyan-800 via-cyan-700 to-sky-700 px-4 py-3.5 text-white sm:px-5">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-100/90">
                  {marcoActivo ? "Recién ingresado · premium" : "Domicilios premium"}
                </p>
                <p className="text-sm font-extrabold">Chat · pedido {pedido.id}</p>
                <p className="text-xs text-cyan-100">
                  {pedido.cliente} · {pedido.telefono}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="shrink-0 rounded-lg border border-white/30 px-2.5 py-1 text-xs font-semibold hover:bg-white/15"
              >
                Cerrar
              </button>
            </header>
            {marcoActivo ? (
              <div className="shrink-0 border-b border-amber-200/90 bg-gradient-to-r from-amber-50 via-white to-cyan-50 px-4 py-2.5 text-center sm:px-5">
                <p className="text-xs font-extrabold text-amber-950">Pedido nuevo en bandeja</p>
                <p className="mt-0.5 text-[11px] font-medium leading-snug text-amber-900/90">
                  Ya enviamos al cliente el resumen en este chat para que lo confirme. Revisá el hilo y respondé si hace
                  falta aclarar algo antes de aceptar el pedido.
                </p>
              </div>
            ) : null}
            <div ref={chatScrollRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-slate-50 px-4 py-4 sm:px-5">
              {chatCargando ? (
                <p className="text-xs text-slate-500">Cargando mensajes...</p>
              ) : chatMensajes.length === 0 ? (
                <p className="text-xs text-slate-500">Sin mensajes aún. El cliente puede escribir desde el landing.</p>
              ) : (
                chatMensajes.map((m) => (
                  <PosDomiciliosChatBurbuja
                    key={m.id}
                    mensaje={m}
                    esPropio={m.autor === "pos"}
                    horaFormateada={formatoHoraChatDomicilio(m.creadoEnIso)}
                  />
                ))
              )}
            </div>
            <div className="shrink-0 border-t border-cyan-100 bg-gradient-to-b from-cyan-50/90 to-slate-50/80 px-4 py-2 sm:px-5">
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-cyan-900">Respuestas rápidas</p>
              <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto pr-0.5">
                {RESPUESTAS_RAPIDAS_CHAT_DOMICILIO.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    title={r.texto}
                    disabled={chatEnviando}
                    onClick={() => aplicarRespuestaRapidaChat(r.texto)}
                    className="rounded-full border border-cyan-200/80 bg-white px-2.5 py-1 text-[11px] font-semibold text-cyan-950 shadow-sm transition hover:border-cyan-400 hover:bg-cyan-100/80 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {r.etiqueta}
                  </button>
                ))}
              </div>
            </div>
            <div className="shrink-0 space-y-2 border-t border-gray-200 px-4 py-3 sm:px-5">
              <textarea
                value={chatTextoPos}
                onChange={(e) => setChatTextoPos(e.target.value)}
                rows={3}
                placeholder="Escribí tu respuesta al cliente…"
                className="w-full resize-y rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none ring-cyan-200 focus:border-cyan-500 focus:ring-2"
              />
              <button
                type="button"
                onClick={() => void enviarMensajePos()}
                disabled={chatEnviando || !chatTextoPos.trim()}
                className="w-full rounded-xl bg-cyan-700 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {chatEnviando ? "Enviando..." : "Enviar mensaje"}
              </button>
              {chatError ? <p className="text-xs text-rose-600">{chatError}</p> : null}
            </div>
          </div>
        </motion.div>
      </div>
    </PosBodyPortal>
  );
}
