"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Heart, Moon, Sparkles, Store } from "lucide-react";

type Props = {
  puntoVenta: string;
};

function particulas(): { id: number; x: number; y: number; size: number; delay: number }[] {
  return Array.from({ length: 18 }, (_, i) => ({
    id: i,
    x: 8 + Math.random() * 84,
    y: 10 + Math.random() * 70,
    size: 2 + Math.random() * 4,
    delay: Math.random() * 2,
  }));
}

export default function PuntoCerradoPremiumView({ puntoVenta }: Props) {
  const [dots] = useState(particulas);
  const nombrePunto = puntoVenta.trim() || "nuestro punto de venta";

  useEffect(() => {
    document.title = "Volvemos pronto · María Chorizos";
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0a0e1a] text-white flex items-center justify-center p-4 sm:p-8">
      <div className="pointer-events-none absolute inset-0">
        <motion.div
          className="absolute -top-1/3 left-1/4 h-[70vh] w-[70vh] rounded-full bg-amber-500/20 blur-[120px]"
          animate={{ scale: [1, 1.08, 1], opacity: [0.35, 0.5, 0.35] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute bottom-0 right-0 h-[55vh] w-[55vh] rounded-full bg-rose-600/15 blur-[100px]"
          animate={{ scale: [1.05, 0.95, 1.05] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[40vh] w-[80vw] rounded-full bg-indigo-500/10 blur-[90px]"
          animate={{ rotate: [0, 8, 0] }}
          transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      {dots.map((d) => (
        <motion.span
          key={d.id}
          className="pointer-events-none absolute rounded-full bg-amber-200/40"
          style={{ left: `${d.x}%`, top: `${d.y}%`, width: d.size, height: d.size }}
          animate={{ y: [0, -18, 0], opacity: [0.2, 0.7, 0.2] }}
          transition={{ duration: 4 + d.delay, repeat: Infinity, delay: d.delay }}
          aria-hidden
        />
      ))}

      <motion.div
        initial={{ opacity: 0, y: 32, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 120, damping: 22, delay: 0.1 }}
        className="relative z-10 w-full max-w-lg"
        style={{ perspective: 1200 }}
      >
        <div
          className="relative rounded-[2rem] border border-white/10 bg-gradient-to-br from-white/[0.12] to-white/[0.04] p-8 sm:p-10 shadow-[0_32px_80px_-20px_rgba(0,0,0,0.65)] backdrop-blur-xl"
          style={{ transform: "rotateX(2deg)" }}
        >
          <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/60 to-transparent" />

          <div className="flex justify-center mb-8" style={{ perspective: 800 }}>
            <motion.div
              animate={{ rotateY: [-6, 6, -6], y: [0, -6, 0] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
              className="relative"
            >
              <div className="flex h-28 w-28 items-center justify-center rounded-3xl bg-gradient-to-br from-amber-400/90 via-rose-500/80 to-indigo-600/90 shadow-[0_20px_50px_-12px_rgba(251,191,36,0.45)] ring-1 ring-white/20">
                <Store className="h-14 w-14 text-white drop-shadow-lg" strokeWidth={1.5} />
              </div>
              <motion.div
                className="absolute -right-3 -top-3 flex h-11 w-11 items-center justify-center rounded-full bg-slate-900/80 ring-2 ring-amber-200/30 shadow-lg"
                animate={{ rotate: [0, 12, 0] }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
              >
                <Moon className="h-5 w-5 text-amber-100" />
              </motion.div>
              <motion.div
                className="absolute -left-2 bottom-2 text-amber-300/80"
                animate={{ scale: [1, 1.2, 1], opacity: [0.6, 1, 0.6] }}
                transition={{ duration: 2.5, repeat: Infinity }}
              >
                <Sparkles className="h-5 w-5" />
              </motion.div>
            </motion.div>
          </div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35 }}
            className="text-center text-xs font-semibold uppercase tracking-[0.25em] text-amber-200/80 mb-3"
          >
            María Chorizos
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="text-center text-2xl sm:text-3xl font-bold leading-tight tracking-tight"
          >
            En este momento estamos{" "}
            <span className="bg-gradient-to-r from-amber-200 via-rose-200 to-amber-100 bg-clip-text text-transparent">
              descansando
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.55 }}
            className="mt-5 text-center text-sm sm:text-base leading-relaxed text-slate-300/95"
          >
            <strong className="font-semibold text-white">{nombrePunto}</strong> aún no ha abierto caja
            hoy. Cuando abramos, podrás hacer tu pedido con todo el sabor que nos caracteriza.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.7 }}
            className="mt-8 rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-center"
          >
            <p className="text-sm text-slate-200 leading-relaxed flex items-start justify-center gap-2">
              <Heart className="h-4 w-4 shrink-0 text-rose-400 mt-0.5 fill-rose-400/30" aria-hidden />
              <span>
                Gracias por pensar en nosotros. Tu interés nos llena de alegría — vuelve en un ratito
                o escanea de nuevo el código cuando veas la tienda abierta.
              </span>
            </p>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.9 }}
            className="mt-6 text-center text-[11px] text-slate-500"
          >
            Pedidos por domicilio · Grupo Bacatá
          </motion.p>
        </div>
      </motion.div>
    </div>
  );
}
