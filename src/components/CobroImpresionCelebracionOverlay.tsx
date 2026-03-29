"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const FRASES_MOTIVADORAS = [
  "Cada venta suma al sabor que nos distingue.",
  "Tu dedicación hoy se nota en cada comprobante.",
  "Calidad que se siente — y ahora también se imprime.",
  "Cliente satisfecho, equipo imparable.",
  "Pequeños gestos, grandes resultados. ¡Sigue así!",
  "María Chorizos: tradición que cobra vida en cada ticket.",
];

export interface CobroImpresionCelebracionOverlayProps {
  open: boolean;
}

/**
 * Overlay de alta gama mientras se envía el ticket a la impresora tras cobrar.
 */
export default function CobroImpresionCelebracionOverlay({ open }: CobroImpresionCelebracionOverlayProps) {
  const [mounted, setMounted] = useState(false);
  const [fraseIdx, setFraseIdx] = useState(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setFraseIdx(Math.floor(Math.random() * FRASES_MOTIVADORAS.length));
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const frase = FRASES_MOTIVADORAS[fraseIdx] ?? FRASES_MOTIVADORAS[0];

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[260] flex items-center justify-center p-5"
      role="alertdialog"
      aria-modal="true"
      aria-busy="true"
      aria-labelledby="cobro-print-titulo"
      aria-describedby="cobro-print-desc"
    >
      <div className="cobro-print-backdrop absolute inset-0 bg-[#0a0c10]/82 backdrop-blur-[14px]" aria-hidden />

      <div className="relative z-[1] w-full max-w-md">
        <div className="cobro-print-card relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-slate-900/95 via-slate-900/98 to-[#06080d] px-8 pb-10 pt-9 shadow-[0_25px_80px_-20px_rgba(0,0,0,0.85),0_0_0_1px_rgba(255,255,255,0.06)_inset,0_0_120px_-30px_rgba(255,200,28,0.25)]">
          <div
            className="pointer-events-none absolute -left-24 -top-24 h-56 w-56 rounded-full bg-brand-yellow/20 blur-3xl cobro-print-glow"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -bottom-16 -right-16 h-48 w-48 rounded-full bg-primary-500/15 blur-3xl cobro-print-glow-delayed"
            aria-hidden
          />

          <div className="relative flex flex-col items-center text-center">
            <div className="relative mb-8 flex h-36 w-36 items-center justify-center">
              <div
                className="absolute inset-0 rounded-full border border-brand-yellow/25 cobro-print-orbit-ring"
                aria-hidden
              />
              <div
                className="absolute inset-2 rounded-full border border-dashed border-white/10 cobro-print-orbit-ring-reverse"
                aria-hidden
              />

              <div className="relative flex h-28 w-28 flex-col items-center justify-end cobro-print-printer-float">
                <svg
                  viewBox="0 0 120 120"
                  className="h-full w-full drop-shadow-[0_12px_24px_rgba(0,0,0,0.45)]"
                  aria-hidden
                >
                  <defs>
                    <linearGradient id="cobroPrintGold" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#fde68a" />
                      <stop offset="45%" stopColor="#FFC81C" />
                      <stop offset="100%" stopColor="#b45309" />
                    </linearGradient>
                    <linearGradient id="cobroPrintMetal" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#475569" />
                      <stop offset="100%" stopColor="#1e293b" />
                    </linearGradient>
                    <linearGradient id="cobroPrintShine" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="transparent" />
                      <stop offset="50%" stopColor="#ffffff" />
                      <stop offset="100%" stopColor="transparent" />
                    </linearGradient>
                    <filter id="cobroPrintShadow" x="-20%" y="-20%" width="140%" height="140%">
                      <feDropShadow dx="0" dy="3" stdDeviation="3" floodOpacity="0.35" />
                    </filter>
                  </defs>
                  <rect
                    x="18"
                    y="52"
                    width="84"
                    height="44"
                    rx="10"
                    fill="url(#cobroPrintMetal)"
                    filter="url(#cobroPrintShadow)"
                  />
                  <rect x="26" y="58" width="68" height="10" rx="3" fill="#334155" opacity="0.9" />
                  <rect x="14" y="44" width="92" height="18" rx="5" fill="url(#cobroPrintMetal)" />
                  <rect x="22" y="48" width="76" height="8" rx="2" fill="#0f172a" opacity="0.85" />
                  <g className="cobro-print-paper-group">
                    <rect x="34" y="8" width="52" height="56" rx="4" fill="#fafaf9" stroke="#e7e5e4" strokeWidth="1.5" />
                    <line x1="42" y1="22" x2="78" y2="22" stroke="#d6d3d1" strokeWidth="2" strokeLinecap="round" />
                    <line x1="42" y1="32" x2="72" y2="32" stroke="#e7e5e4" strokeWidth="2" strokeLinecap="round" />
                    <line x1="42" y1="42" x2="76" y2="42" stroke="#e7e5e4" strokeWidth="2" strokeLinecap="round" />
                    <rect
                      x="34"
                      y="8"
                      width="52"
                      height="56"
                      rx="4"
                      fill="url(#cobroPrintShine)"
                      className="cobro-print-paper-shine"
                      opacity="0.4"
                    />
                  </g>
                  <circle cx="92" cy="72" r="5" fill="url(#cobroPrintGold)" className="cobro-print-led" />
                </svg>
              </div>

              <span
                className="cobro-print-sparkle absolute -right-1 top-4 text-2xl text-brand-yellow/90"
                aria-hidden
              >
                ✦
              </span>
              <span
                className="cobro-print-sparkle-delayed absolute -left-2 bottom-10 text-xl text-amber-200/80"
                aria-hidden
              >
                ✧
              </span>
              <span
                className="cobro-print-sparkle-slow absolute right-6 bottom-2 text-lg text-white/50"
                aria-hidden
              >
                ✦
              </span>
            </div>

            <p
              id="cobro-print-titulo"
              className="text-xl font-semibold tracking-tight text-white sm:text-2xl"
            >
              Imprimiendo tu comprobante
            </p>
            <p id="cobro-print-desc" className="mt-2 text-sm font-medium text-brand-yellow/95">
              Un momento de arte culinario en papel
            </p>
            <p className="mt-6 max-w-xs text-sm leading-relaxed text-slate-400">{frase}</p>

            <div className="mt-8 flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2.5">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/70 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
              </span>
              <span className="text-xs font-medium uppercase tracking-[0.2em] text-slate-300">
                Impresora en proceso
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
