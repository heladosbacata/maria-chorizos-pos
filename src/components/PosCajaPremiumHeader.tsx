"use client";

import type { CSSProperties } from "react";
import { useMemo } from "react";
import PosCajaMetasMotivationPanel from "@/components/PosCajaMetasMotivationPanel";

type Props = {
  puntoVenta: string | null | undefined;
  etiquetaModulo: string;
};

/**
 * Hot dog en vista lateral: pan inferior + salchicha + pan superior + mostaza (brand yellow).
 * Paleta pastel premium alineada al POS (#FFC81C y cremas).
 */
function HotDogSvg({ uidSuffix }: { uidSuffix: string }) {
  const u = `hd-${uidSuffix}`;
  return (
    <svg
      width="52"
      height="24"
      viewBox="0 0 52 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        {/* Pan — vainilla / mantequilla pastel */}
        <linearGradient id={`${u}-bun-bottom`} x1="26" y1="20" x2="26" y2="8" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFF9F0" />
          <stop offset="0.45" stopColor="#FFECC8" />
          <stop offset="1" stopColor="#E8D5A3" />
        </linearGradient>
        <linearGradient id={`${u}-bun-top`} x1="26" y1="4" x2="26" y2="14" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFCF5" />
          <stop offset="0.4" stopColor="#FFF3D9" />
          <stop offset="1" stopColor="#F0DEB8" />
        </linearGradient>
        {/* Salchicha — dorado caramelo (contrasta pero sigue familia cálida) */}
        <linearGradient id={`${u}-dog`} x1="6" y1="12" x2="46" y2="12" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F0D4A0" />
          <stop offset="0.35" stopColor="#D9A862" />
          <stop offset="0.7" stopColor="#C4924E" />
          <stop offset="1" stopColor="#A67A42" />
        </linearGradient>
        {/* Mostaza — brand yellow + highlight pastel */}
        <linearGradient id={`${u}-mustard`} x1="12" y1="8" x2="40" y2="8" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFF8DC" />
          <stop offset="0.35" stopColor="#FFE566" />
          <stop offset="0.65" stopColor="#FFC81C" />
          <stop offset="1" stopColor="#F0B020" />
        </linearGradient>
        <filter id={`${u}-soft`} x="-15%" y="-15%" width="130%" height="130%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="0.25" />
        </filter>
      </defs>

      {/* Sombra suave bajo el pan */}
      <ellipse cx="26" cy="19.5" rx="21" ry="2.2" fill="rgba(40,32,20,0.2)" filter={`url(#${u}-soft)`} />

      {/* Pan inferior (base del hot dog) */}
      <path
        fill={`url(#${u}-bun-bottom)`}
        d="M6 13.5c0-1.2 1-2.1 2.3-2.1h35.4c1.3 0 2.3.9 2.3 2.1v.6c0 2.8-4.8 5.2-20 5.2S6 16.9 6 14.1v-.6Z"
      />
      <path
        fill="rgba(255,255,255,0.35)"
        d="M8.5 12.8c6.2 1.2 12.8 1.8 17.5 1.8s11.3-.6 17.5-1.8c.5-.1.9.3.7.8-.3.8-1.1 1.5-2.4 2.1-4.5 2-11.2 3.1-15.8 3.1s-11.3-1.1-15.8-3.1c-1.3-.6-2.1-1.3-2.4-2.1-.2-.5.2-.9.7-.8Z"
      />

      {/* Salchicha (asoma por los costados = lectura clara “hot dog”) */}
      <rect x="4" y="9.8" width="44" height="6.4" rx="3.2" fill={`url(#${u}-dog)`} />
      <ellipse cx="26" cy="13" rx="17" ry="2.2" fill="rgba(255,255,255,0.22)" />

      {/* Pan superior */}
      <path
        fill={`url(#${u}-bun-top)`}
        d="M6 12.2c0-3.2 4.8-5.8 20-5.8s20 2.6 20 5.8c0 .9-.4 1.7-1.1 2.3-.8.7-2.1 1.1-3.5 1.1H10.6c-1.4 0-2.7-.4-3.5-1.1-.7-.6-1.1-1.4-1.1-2.3Z"
      />
      <path
        fill="rgba(255,255,255,0.4)"
        d="M10 8.5c4.2-1 8.8-1.5 16-1.5s11.8.5 16 1.5c.6.15.5 1-.1 1.1-3.8.6-8.5 1-15.9 1s-12.1-.4-15.9-1c-.6-.1-.7-0.95-.1-1.1Z"
      />

      {/* Mostaza en zigzag (identidad MC / POS) */}
      <path
        fill="none"
        stroke={`url(#${u}-mustard)`}
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11 9.2l2.2 1.4 2.3-1.4 2.2 1.4 2.3-1.4 2.2 1.4 2.3-1.4 2.2 1.4 2.3-1.4 2.2 1.4 2.3-1.4 2.2 1.4"
      />
      <path
        fill="none"
        stroke="rgba(255,255,255,0.55)"
        strokeWidth="0.45"
        strokeLinecap="round"
        d="M11.4 8.9l2 1.2 2.1-1.2 2 1.2 2.1-1.2 2 1.2 2.1-1.2 2 1.2 2.1-1.2 2 1.2 2.1-1.2 2 1.2"
        opacity="0.9"
      />
    </svg>
  );
}

function hotdogVars(i: number): CSSProperties {
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
  const op = 0.82 + (i % 4) * 0.04;
  return {
    ["--hotdog-drift" as string]: `${drift}px`,
    ["--hotdog-rx0" as string]: `${rx0}deg`,
    ["--hotdog-rx1" as string]: `${rx1}deg`,
    ["--hotdog-ry0" as string]: `${ry0}deg`,
    ["--hotdog-ry1" as string]: `${ry1}deg`,
    ["--hotdog-rz0" as string]: `${rz0}deg`,
    ["--hotdog-rz1" as string]: `${rz1}deg`,
    ["--hotdog-z0" as string]: `${z0}px`,
    ["--hotdog-z1" as string]: `${z1}px`,
    ["--hotdog-sc" as string]: String(sc),
    ["--hotdog-sc2" as string]: String(sc2),
    ["--hotdog-op" as string]: String(op),
  };
}

const N_PARTICLES = 20;

/**
 * Cabecera premium: barra con punto de venta y lluvia de hot dogs (amarillos pastel + brand).
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
        vars: hotdogVars(i),
      })),
    []
  );

  return (
    <header className="relative isolate mb-5 overflow-hidden rounded-2xl border border-[#FFE08A]/35 bg-gradient-to-br from-[#0f0d08] via-[#1a1610] to-[#0c0b08] shadow-[0_20px_50px_-12px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,200,28,0.18)]">
      {/* Brillo pastel amarillo / vainilla (marca) */}
      <div
        className="pointer-events-none absolute -left-1/4 -top-1/2 h-[145%] w-[72%] rounded-full bg-[radial-gradient(closest-side,rgba(255,236,200,0.35),rgba(255,200,28,0.12),transparent)] blur-2xl motion-reduce:opacity-50"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-1/5 top-0 h-full w-[55%] bg-[radial-gradient(ellipse_at_top,rgba(255,220,150,0.2),rgba(255,200,28,0.08),transparent_70%)] blur-xl motion-reduce:opacity-40"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#FFF8E6]/[0.04] via-transparent to-[#FFC81C]/[0.06]"
        aria-hidden
      />

      {/* Lluvia de hot dogs */}
      <div
        className="posgeb-hotdog-stage pointer-events-none absolute inset-0 overflow-hidden motion-reduce:opacity-25"
        aria-hidden
      >
        <div className="absolute inset-x-0 top-0 h-[72%]">
          {particles.map(({ i, leftPct, duration, delay, vars }) => (
            <div
              key={i}
              className="posgeb-hotdog-particle absolute flex items-center justify-center"
              style={{
                left: `${leftPct}%`,
                top: "-10%",
                width: "56px",
                height: "56px",
                marginLeft: "-28px",
                animationDuration: `${duration}s`,
                animationDelay: `${delay}s`,
                ...vars,
              }}
            >
              <div className="drop-shadow-[0_8px_14px_rgba(30,22,10,0.35)]">
                <HotDogSvg uidSuffix={`${i}`} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Barra información — cristal con acentos amarillo pastel */}
      <div className="relative z-10 flex min-h-[5.75rem] flex-col justify-end px-4 pb-3.5 pt-10 sm:min-h-[6.25rem] sm:px-6 sm:pb-4 sm:pt-11">
        <div className="flex flex-wrap items-stretch justify-between gap-3 lg:items-end">
          <div className="min-w-0 flex-1 rounded-xl border border-[#FFE9B8]/25 bg-gradient-to-br from-[#FFFDF8]/[0.14] via-[#FFF6E0]/[0.08] to-white/[0.05] px-4 py-3 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.45)] backdrop-blur-md backdrop-saturate-150">
            <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#FFF2CC]/90">Punto de venta</p>
            <p className="mt-1 truncate text-xl font-bold tracking-tight text-white drop-shadow-sm sm:text-2xl">{pv}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full border border-[#FFE08A]/45 bg-gradient-to-r from-[#FFC81C]/20 to-[#FFE9A8]/15 px-2.5 py-0.5 text-[11px] font-semibold text-[#FFF8E8]">
                Maria Chorizos · POS GEB
              </span>
              <span className="text-xs font-medium text-[#F5E6C8]/70">Módulo: {etiquetaModulo}</span>
            </div>
          </div>
          <PosCajaMetasMotivationPanel />
        </div>
      </div>

      <div
        className="pointer-events-none absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#FFE08A]/60 to-transparent"
        aria-hidden
      />
    </header>
  );
}
