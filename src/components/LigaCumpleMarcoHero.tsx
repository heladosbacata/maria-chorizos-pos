"use client";

import { motion } from "framer-motion";
import { Cake, User } from "lucide-react";
import { useEffect, useState } from "react";

type Props = {
  fotoUrl?: string;
  nombre: string;
  cumpleCorto?: string;
  puntoVenta?: string;
  posicion?: number;
};

export default function LigaCumpleMarcoHero({
  fotoUrl,
  nombre,
  cumpleCorto,
  puntoVenta,
  posicion,
}: Props) {
  const fotoSrc = fotoUrl?.trim() ?? "";
  const [fotoOk, setFotoOk] = useState(true);

  useEffect(() => {
    setFotoOk(true);
  }, [fotoSrc]);

  const mostrarFoto = Boolean(fotoSrc) && fotoOk;

  return (
    <div className="relative flex flex-col items-center px-2 py-4 sm:py-5">
      <div
        className="pointer-events-none absolute inset-x-4 top-2 h-32 rounded-full bg-[radial-gradient(ellipse,rgba(236,72,153,0.28),transparent_70%)] motion-safe:animate-liga-cumple-halo sm:h-40"
        aria-hidden
      />

      <div className="relative [perspective:900px]">
        <span
          className="pointer-events-none absolute -inset-5 rounded-full bg-[conic-gradient(from_0deg,#ec4899,#fbbf24,#a855f7,#22d3ee,#ec4899)] opacity-80 blur-[1px] motion-safe:animate-liga-cumple-ring"
          aria-hidden
        />
        <span
          className="pointer-events-none absolute -inset-2 rounded-full border border-pink-200/30 bg-pink-500/10 motion-safe:animate-liga-cumple-glow"
          aria-hidden
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.88, rotateX: 12 }}
          animate={{ opacity: 1, scale: 1, rotateX: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 22 }}
          className="relative motion-safe:animate-liga-cumple-3d-tilt [transform-style:preserve-3d]"
        >
          <span className="pointer-events-none absolute -left-3 top-2 z-20 text-lg motion-safe:animate-liga-cumple-sparkle" aria-hidden>
            ✨
          </span>
          <span
            className="pointer-events-none absolute -right-2 top-6 z-20 text-lg motion-safe:animate-liga-cumple-sparkle motion-safe:[animation-delay:0.7s]"
            aria-hidden
          >
            🎈
          </span>
          <span className="absolute -top-7 left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded-full bg-gradient-to-r from-pink-500 via-amber-400 to-purple-500 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-white shadow-[0_0_20px_rgba(236,72,153,0.6)] motion-safe:animate-bounce sm:text-[11px]">
            🎂 ¡Hoy cumple años!
          </span>

          <div className="relative z-10 rounded-full bg-gradient-to-br from-[#FFD700] via-pink-400 to-purple-500 p-[3px] shadow-[0_12px_40px_rgba(236,72,153,0.45),0_0_0_1px_rgba(255,255,255,0.15)_inset]">
            <div className="rounded-full bg-[#1a1610] p-1">
              <div className="relative h-32 w-32 overflow-hidden rounded-full bg-[#2a2318] shadow-[inset_0_8px_24px_rgba(0,0,0,0.45)] sm:h-40 sm:w-40">
                {mostrarFoto ? (
                  <img
                    src={fotoSrc}
                    alt={nombre}
                    className="h-full w-full object-cover"
                    loading="eager"
                    referrerPolicy="no-referrer"
                    onError={() => setFotoOk(false)}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#3d3428] to-[#1a1610] text-pink-200/70">
                    <User className="h-14 w-14 sm:h-16 sm:w-16" aria-hidden />
                  </div>
                )}
                <div
                  className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-tr from-white/25 via-transparent to-transparent"
                  aria-hidden
                />
              </div>
            </div>
          </div>

          {posicion != null && posicion > 0 ? (
            <span className="absolute -bottom-1 -right-1 z-20 flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#1a1610] bg-gradient-to-br from-[#FFD700] via-[#E8C547] to-[#B8860B] text-sm font-black text-[#1a140c] shadow-lg">
              {posicion}
            </span>
          ) : null}
        </motion.div>

        <div
          className="pointer-events-none absolute -bottom-3 left-1/2 h-5 w-36 -translate-x-1/2 rounded-[100%] bg-black/50 blur-md"
          aria-hidden
        />
      </div>

      <motion.p
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12 }}
        className="mt-5 max-w-[18rem] text-center text-base font-black uppercase tracking-wide text-[#FFF8E8] sm:text-lg"
      >
        {nombre}
      </motion.p>
      {cumpleCorto ? (
        <p className="mt-1 flex items-center justify-center gap-1.5 text-sm font-semibold text-pink-200">
          <Cake className="h-4 w-4 text-pink-300" aria-hidden />
          <span>¡Hoy es su cumpleaños! · {cumpleCorto}</span>
        </p>
      ) : (
        <p className="mt-1 text-sm font-semibold text-pink-200">¡Hoy es su cumpleaños!</p>
      )}
      {puntoVenta ? (
        <p className="mt-1 max-w-[16rem] truncate text-center text-xs font-bold text-[#FFE9B8] sm:text-sm">
          {puntoVenta}
        </p>
      ) : null}
    </div>
  );
}
