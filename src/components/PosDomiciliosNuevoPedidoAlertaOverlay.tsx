"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Truck } from "lucide-react";
import {
  EVENT_DOMICILIOS_PEDIDO_NUEVO,
  type DomiciliosPedidoNuevoDetail,
} from "@/lib/pos-domicilios-nuevos-event";
import type { PedidoDomicilio } from "@/types/pos-domicilios";

type Props = {
  /** Si el cajero ya está en Domicilios, el módulo maneja su propio chat; no duplicar overlay. */
  domiciliosModuloActivo?: boolean;
  onVerPedidos: (pedido: PedidoDomicilio) => void;
};

function formatoMoneda(valor: number): string {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(
    valor
  );
}

export default function PosDomiciliosNuevoPedidoAlertaOverlay({ domiciliosModuloActivo, onVerPedidos }: Props) {
  const [alerta, setAlerta] = useState<DomiciliosPedidoNuevoDetail | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<DomiciliosPedidoNuevoDetail>).detail;
      if (!detail?.pedido) return;
      if (domiciliosModuloActivo) return;
      setAlerta(detail);
    };
    window.addEventListener(EVENT_DOMICILIOS_PEDIDO_NUEVO, handler);
    return () => window.removeEventListener(EVENT_DOMICILIOS_PEDIDO_NUEVO, handler);
  }, [domiciliosModuloActivo]);

  useEffect(() => {
    if (domiciliosModuloActivo) setAlerta(null);
  }, [domiciliosModuloActivo]);

  return (
    <AnimatePresence>
      {alerta && !domiciliosModuloActivo ? (
        <motion.div
          key={alerta.pedido.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="domicilios-alerta-titulo"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.88, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 12 }}
            transition={{ type: "spring", stiffness: 260, damping: 22 }}
            className="relative w-full max-w-md overflow-hidden rounded-3xl border border-cyan-300/40 bg-gradient-to-br from-cyan-950 via-slate-900 to-indigo-950 p-[3px] shadow-[0_0_60px_-12px_rgba(34,211,238,0.55)]"
          >
            <div className="relative overflow-hidden rounded-[1.35rem] bg-gradient-to-br from-slate-900/95 to-slate-950 px-6 py-7 text-center text-white">
              <motion.div
                className="pointer-events-none absolute -top-16 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full bg-cyan-400/25 blur-3xl"
                animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0.65, 0.4] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
              />
              <motion.div
                className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 via-cyan-400 to-indigo-500 shadow-lg"
                animate={{ rotateY: [0, 8, -8, 0], y: [0, -4, 0] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
              >
                <Truck className="h-10 w-10 text-white drop-shadow" strokeWidth={1.6} />
              </motion.div>
              <motion.p
                className="flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-[0.28em] text-amber-200/90"
                animate={{ opacity: [0.7, 1, 0.7] }}
                transition={{ duration: 1.8, repeat: Infinity }}
              >
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
                Domicilios premium
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
              </motion.p>
              <h2 id="domicilios-alerta-titulo" className="mt-2 text-2xl font-black leading-tight">
                ¡Llegó un{" "}
                <span className="bg-gradient-to-r from-amber-200 via-cyan-200 to-amber-100 bg-clip-text text-transparent">
                  pedido nuevo!
                </span>
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-slate-300">
                <strong className="text-white">{alerta.pedido.cliente}</strong> acaba de ordenar por{" "}
                {alerta.pedido.canal === "qr" ? "QR" : alerta.pedido.canal === "whatsapp" ? "WhatsApp" : "web"}.
              </p>
              <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm">
                <p className="font-bold text-cyan-100">{alerta.pedido.id}</p>
                <p className="mt-1 text-slate-300">{formatoMoneda(alerta.pedido.total)}</p>
                <p className="mt-1 truncate text-xs text-slate-400">{alerta.pedido.direccion}</p>
              </div>
              {alerta.cantidadNuevos > 1 ? (
                <p className="mt-3 text-xs font-semibold text-amber-200">
                  + {alerta.cantidadNuevos - 1} pedido(s) más en bandeja
                </p>
              ) : null}
              <div className="mt-6 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => {
                    onVerPedidos(alerta.pedido);
                    setAlerta(null);
                  }}
                  className="flex-1 rounded-xl bg-gradient-to-r from-cyan-500 to-sky-500 px-4 py-3 text-sm font-bold text-white shadow-lg transition hover:brightness-110 active:scale-[0.98]"
                >
                  Ver pedido ahora
                </button>
                <button
                  type="button"
                  onClick={() => setAlerta(null)}
                  className="flex-1 rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-200 hover:bg-white/10"
                >
                  Seguir en caja
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
