"use client";

import type { CSSProperties } from "react";
import { useMemo } from "react";

type Props = {
  puntoVenta: string | null | undefined;
  etiquetaModulo: string;
};

/** SVG chorizo estilizado con volumen (gradientes + amarres). */
function Chorizo3D({ uidSuffix }: { uidSuffix: string }) {
  const uid = `cg-${uidSuffix}`;
  return (
    <svg
      width="36"
      height="16"
      viewBox="0 0 36 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient id={`${uid}-body`} x1="18" y1="0" x2="18" y2="16" gradientUnits="userSpaceOnUse">
          <stop stopColor="#f4c4a8" />
          <stop offset="0.35" stopColor="#b85c3c" />
          <stop offset="0.72" stopColor="#6b2e22" />
          <stop offset="1" stopColor="#3d1810" />
        </linearGradient>
        <linearGradient id={`${uid}-shine`} x1="6" y1="2" x2="28" y2="14" gradientUnits="userSpaceOnUse">
          <stop stopColor="rgba(255,255,255,0.55)" />
          <stop offset="0.35" stopColor="rgba(255,255,255,0.08)" />
          <stop offset="0.65" stopColor="rgba(0,0,0,0.15)" />
          <stop offset="1" stopColor="rgba(0,0,0,0.35)" />
        </linearGradient>
        <filter id={`${uid}-soft`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="0.35" />
        </filter>
      </defs>
      <ellipse cx="18" cy="8" rx="14" ry="5.5" fill={`url(#${uid}-body)`} filter={`url(#${uid}-soft)`} />
      <ellipse cx="18" cy="8" rx="14" ry="5.5" fill={`url(#${uid}-shine)`} />
      <rect x="3" y="5.5" width="4" height="5" rx="1.2" fill="#2a120c" />
      <rect x="29" y="5.5" width="4" height="5" rx="1.2" fill="#2a120c" />
      <ellipse cx="18" cy="7" rx="10" ry="2.2" fill="rgba(255,255,255,0.12)" />
    </svg>
  );
}

function chorizoVars(i: number): CSSProperties {
  const drift = ((i * 17) % 5) * 14 - 28;
  const rx0 = -15 - (i % 4) * 8;
  const rx1 = 200 + (i % 7) * 35;
  const ry0 = 8 + (i % 5) * 6;
  const ry1 = -240 - (i % 6) * 40;
  const rz0 = -10 + (i % 5) * 4;
  const rz1 = 12 + (i % 4) * 5;
  const z0 = (i % 3) * 8 - 8;
  const z1 = -12 - (i % 4) * 6;
  const sc = 0.78 + (i % 5) * 0.07;
  const sc2 = sc * (1.02 + (i % 3) * 0.04);
  const op = 0.75 + (i % 4) * 0.05;
  return {
    ["--chorizo-drift" as string]: `${drift}px`,
    ["--chorizo-rx0" as string]: `${rx0}deg`,
    ["--chorizo-rx1" as string]: `${rx1}deg`,
    ["--chorizo-ry0" as string]: `${ry0}deg`,
    ["--chorizo-ry1" as string]: `${ry1}deg`,
    ["--chorizo-rz0" as string]: `${rz0}deg`,
    ["--chorizo-rz1" as string]: `${rz1}deg`,
    ["--chorizo-z0" as string]: `${z0}px`,
    ["--chorizo-z1" as string]: `${z1}px`,
    ["--chorizo-sc" as string]: String(sc),
    ["--chorizo-sc2" as string]: String(sc2),
    ["--chorizo-op" as string]: String(op),
  };
}

const N_PARTICLES = 22;

/**
 * Cabecera premium: barra con punto de venta y lluvia de chorizos 3D (CSS + SVG).
 */
export default function PosCajaPremiumHeader({ puntoVenta, etiquetaModulo }: Props) {
  const pv = puntoVenta?.trim() || "Sin punto asignado";

  const particles = useMemo(
    () =>
      Array.from({ length: N_PARTICLES }, (_, i) => ({
        i,
        leftPct: 2 + ((i * 41) % 89),
        duration: 4.1 + (i % 7) * 0.55,
        delay: (i * 0.27) % 5.2,
        vars: chorizoVars(i),
      })),
    []
  );

  return (
    <header className="relative isolate mb-5 overflow-hidden rounded-2xl border border-amber-400/25 bg-gradient-to-br from-slate-950 via-[#1a0a08] to-slate-950 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.45),0_0_0_1px_rgba(255,200,28,0.12)]">
      {/* Brillo ambiental */}
      <div
        className="pointer-events-none absolute -left-1/4 -top-1/2 h-[140%] w-[70%] rounded-full bg-[radial-gradient(closest-side,rgba(255,200,28,0.18),transparent)] blur-2xl motion-reduce:opacity-40"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-1/4 top-0 h-full w-1/2 bg-[radial-gradient(ellipse_at_top,rgba(196,30,58,0.22),transparent_65%)] blur-xl motion-reduce:opacity-30"
        aria-hidden
      />

      {/* Lluvia de chorizos */}
      <div
        className="posgeb-chorizo-stage pointer-events-none absolute inset-0 overflow-hidden motion-reduce:opacity-25"
        aria-hidden
      >
        <div className="absolute inset-x-0 top-0 h-[72%]">
          {particles.map(({ i, leftPct, duration, delay, vars }) => (
            <div
              key={i}
              className="posgeb-chorizo-particle absolute flex items-center justify-center"
              style={{
                left: `${leftPct}%`,
                top: "-8%",
                width: "40px",
                height: "40px",
                marginLeft: "-20px",
                animationDuration: `${duration}s`,
                animationDelay: `${delay}s`,
                ...vars,
              }}
            >
              <div className="drop-shadow-[0_6px_10px_rgba(0,0,0,0.45)]">
                <Chorizo3D uidSuffix={`${i}`} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Barra información */}
      <div className="relative z-10 flex min-h-[5.75rem] flex-col justify-end px-4 pb-3.5 pt-10 sm:min-h-[6.25rem] sm:px-6 sm:pb-4 sm:pt-11">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0 flex-1 rounded-xl border border-white/15 bg-gradient-to-br from-white/14 to-white/[0.06] px-4 py-3 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.5)] backdrop-blur-md backdrop-saturate-150">
            <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-amber-200/85">Punto de venta</p>
            <p className="mt-1 truncate text-xl font-bold tracking-tight text-white drop-shadow-sm sm:text-2xl">{pv}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full border border-amber-400/35 bg-amber-400/10 px-2.5 py-0.5 text-[11px] font-semibold text-amber-100/95">
                Maria Chorizos · POS GEB
              </span>
              <span className="text-xs font-medium text-white/55">Módulo: {etiquetaModulo}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Línea inferior decorativa */}
      <div
        className="pointer-events-none absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-400/50 to-transparent"
        aria-hidden
      />
    </header>
  );
}
