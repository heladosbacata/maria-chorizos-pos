"use client";

import { useId, useMemo } from "react";
import { useMetasRetosCaja } from "@/components/MetasRetosCajaProvider";
import { avanceUnidadesReto } from "@/lib/metas-retos-avance-ventas";

/** Silueta de mesero con bandeja — estilo hotelería fina, mismo lenguaje dorado del banner. */
function IconMeseroElegante({ className }: { className?: string }) {
  const uid = useId().replace(/:/g, "");
  const gid = `mc-mesero-gold-${uid}`;
  return (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <defs>
        <linearGradient id={gid} x1="3" y1="2" x2="21" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFF8DC" />
          <stop offset="0.28" stopColor="#FFE566" />
          <stop offset="0.58" stopColor="#FFC81C" />
          <stop offset="1" stopColor="#8B6230" />
        </linearGradient>
      </defs>
      <g fill={`url(#${gid})`}>
        {/* Chaqueta (atrás) */}
        <path d="M12 8.95c-1.58 0-2.88.5-3.35 1.42l-.75 7.05c-.1.85.4 1.48 1.28 1.55h5.64c.88-.07 1.38-.7 1.28-1.55l-.75-7.05c-.47-.92-1.77-1.42-3.35-1.42z" />
        {/* Brazo alzado */}
        <path
          d="M13.15 10.35c.55-.08 1.08.12 1.48.52l1.05 1.02a.72.72 0 001.02-.06l.14-.14a.72.72 0 00-.08-1.02l-1.12-.95a2.35 2.35 0 00-1.55-.42c-.38.06-.72.22-.98.48-.22.22-.36.5-.4.8z"
          opacity="0.92"
        />
        {/* Bandeja */}
        <ellipse cx="17.45" cy="8.28" rx="3.95" ry="1.12" />
        <ellipse cx="17.45" cy="7.95" rx="3.35" ry="0.62" fill="rgba(255,255,255,0.28)" />
        {/* Cabeza */}
        <circle cx="12" cy="6.15" r="2.22" />
        {/* Solapas / moño sugerido */}
        <path
          d="M12 8.55l-.95.48-.22-.42.95-.48.95.48-.22.42-.95-.48z"
          fill="rgba(0,0,0,0.14)"
        />
      </g>
    </svg>
  );
}

function IconStar({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
  );
}

function IconSparkles({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.847a4.5 4.5 0 003.09 3.09L15.75 12l-2.847.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"
      />
    </svg>
  );
}

function mensajeMotivacional(
  promedioPct: number,
  completados: number,
  total: number,
  cargando: boolean,
  error: boolean
): string {
  if (cargando) return "Sincronizando tu energía de ventas…";
  if (error) return "Cuando vuelva la conexión, tu avance aparecerá aquí. ¡Seguí vendiendo!";
  if (total === 0) {
    return "Cada venta construye el equipo. Pronto verás retos activos para volar más alto.";
  }
  if (completados === total) {
    return "¡Campeón! Todas las metas del periodo están cumplidas. Disfrutá el momento.";
  }
  if (promedioPct >= 85) {
    return "¡Estás a nada del premio! Un empujón más y cruzás la meta.";
  }
  if (promedioPct >= 60) {
    return "¡Ritmo de campeón! El bono se acerca: no aflojes ahora.";
  }
  if (promedioPct >= 40) {
    return "Mitad del camino superada. Tu esfuerzo se nota en cada ticket.";
  }
  if (promedioPct >= 15) {
    return "¡Va tomando color! Cada unidad suma para tu bono y para el equipo.";
  }
  if (promedioPct > 0) {
    return "¡Arrancaste con todo! Hoy puede ser el día de la racha perfecta.";
  }
  return "¡Este turno es tuyo! La primera venta del reto enciende la chispa del logro.";
}

/**
 * Resumen emocional del avance en metas (retos WMS), alineado al banner premium oscuro de caja.
 */
export default function PosCajaMetasMotivationPanel() {
  const { retos, ventas, ymdRef, cargando, error } = useMetasRetosCaja();

  const stats = useMemo(() => {
    let sumPct = 0;
    let completados = 0;
    const detalles: { pct: number; avance: number; meta: number }[] = [];
    for (const reto of retos) {
      const { avance } = avanceUnidadesReto(reto, ventas, ymdRef);
      const meta = Math.max(0, Number(reto.metaUnidades) || 0);
      const pct = meta > 0 ? Math.min(100, Math.round((avance / meta) * 100)) : 0;
      sumPct += pct;
      detalles.push({ pct, avance, meta });
      if (meta > 0 && avance >= meta) completados += 1;
    }
    const n = retos.length;
    const promedioPct = n > 0 ? Math.round(sumPct / n) : 0;
    return { promedioPct, completados, total: n, detalles };
  }, [retos, ventas, ymdRef]);

  const tieneError = Boolean(error);
  const msg = mensajeMotivacional(stats.promedioPct, stats.completados, stats.total, cargando && !tieneError, tieneError);
  const barPct = tieneError ? 0 : stats.promedioPct;

  return (
    <div
      className="relative w-full min-w-0 overflow-hidden rounded-xl border border-[#FFE9B8]/30 bg-gradient-to-br from-[#2a2318]/90 via-[#1f1a14]/85 to-[#14110d]/90 px-3.5 py-3 shadow-[0_12px_36px_-14px_rgba(0,0,0,0.65)] backdrop-blur-md backdrop-saturate-150 sm:max-w-[min(100%,20rem)] lg:shrink-0"
      role="region"
      aria-label="Resumen motivacional de metas del periodo"
    >
      <div
        className="pointer-events-none absolute -right-6 -top-10 h-24 w-24 rounded-full bg-[radial-gradient(circle,rgba(255,200,60,0.35),transparent_68%)] blur-2xl motion-reduce:opacity-40"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -left-4 bottom-0 h-16 w-20 rounded-full bg-[radial-gradient(circle,rgba(255,236,200,0.12),transparent_70%)] blur-xl"
        aria-hidden
      />

      <div className="relative flex items-start gap-2.5">
        <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#FFE08A]/35 bg-gradient-to-br from-[#FFC81C]/25 to-[#5c4a2a]/40 shadow-inner">
          <IconMeseroElegante className="h-6 w-6 drop-shadow-[0_2px_6px_rgba(0,0,0,0.45)]" />
          <IconStar className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 text-[#FFF8DC] drop-shadow-sm motion-safe:animate-pulse" />
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex items-center gap-1.5">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#FFE9A8]/95">Tu poder de venta</p>
            <IconSparkles className="h-3.5 w-3.5 shrink-0 text-[#FFC81C]/90 motion-safe:animate-pulse" />
          </div>
          <p className="mt-1.5 text-[11px] font-medium leading-snug text-[#F5E6C8]/92">{msg}</p>
        </div>
      </div>

      <div className="relative mt-3">
        {cargando && retos.length === 0 && !tieneError ? (
          <div className="space-y-2" aria-busy>
            <div className="h-2.5 w-full animate-pulse rounded-full bg-[#3d3428]/80" />
            <div className="flex justify-between gap-2">
              <div className="h-2 w-24 animate-pulse rounded bg-[#3d3428]/60" />
              <div className="h-2 w-12 animate-pulse rounded bg-[#3d3428]/60" />
            </div>
          </div>
        ) : (
          <>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#C4B49A]">
                {stats.total > 0 ? "Avance promedio del periodo" : "Sin retos activos"}
              </span>
              <span className="text-lg font-black tabular-nums leading-none text-[#FFF8E8] drop-shadow-sm">
                {tieneError ? "—" : `${stats.promedioPct}%`}
              </span>
            </div>
            <div className="relative h-2.5 overflow-hidden rounded-full bg-[#1a1510] ring-1 ring-[#FFE08A]/25">
              <div
                className="relative h-full rounded-full bg-gradient-to-r from-[#8B6914] via-[#FFC81C] to-[#FFF2A8] motion-safe:transition-[width] motion-safe:duration-700 motion-safe:ease-out"
                style={{ width: `${barPct}%` }}
              >
                <span className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/35 to-transparent pos-metas-bar-shine" />
              </div>
            </div>
            {stats.total > 0 ? (
              <p className="mt-2 text-[10px] font-medium text-[#B8A88C]">
                <span className="tabular-nums font-bold text-[#FFE9B8]">{stats.completados}</span>
                <span> de </span>
                <span className="tabular-nums">{stats.total}</span>
                <span> {stats.total === 1 ? "meta cumplida" : "metas cumplidas"}</span>
                {stats.completados < stats.total ? (
                  <span className="ml-1 text-[#FFC81C]/90">· El resto te está esperando</span>
                ) : (
                  <span className="ml-1 text-emerald-300/90">· Equipo imparable</span>
                )}
              </p>
            ) : !tieneError ? (
              <p className="mt-2 text-[10px] text-[#9A8B74]">Revisá «Metas y bonificaciones» cuando haya campañas.</p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
