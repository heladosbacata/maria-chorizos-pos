"use client";

import { useEffect, useId, useMemo } from "react";
import { useMetasRetosCaja } from "@/components/MetasRetosCajaProvider";
import { avanceUnidadesReto, etiquetaRangoPeriodo } from "@/lib/metas-retos-avance-ventas";
import { formatPesosCop } from "@/lib/pesos-cop-input";
import type { MetaRetoActiva } from "@/lib/wms-metas-retos-activas";

function etiquetaCadenciaCorta(c: MetaRetoActiva["cadencia"]): string {
  if (c === "semanal") return "Semanal";
  if (c === "mensual") return "Mensual";
  return "Diario";
}

function esFidelizacion(reto: MetaRetoActiva): boolean {
  return reto.tipoReto === "fidelizacion_clientes";
}

function etiquetaUnidadReto(reto: MetaRetoActiva, cadencia: MetaRetoActiva["cadencia"]): string {
  if (esFidelizacion(reto)) {
    return cadencia === "diario" ? " clientes hoy" : " clientes en el periodo";
  }
  return cadencia === "diario" ? " u. hoy" : " u. en el periodo";
}

const NOMBRES_MES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
] as const;

function nombreMesDesdeYmd(ymd: string): string {
  const m = Number(ymd.slice(5, 7));
  return NOMBRES_MES[m - 1] ?? "";
}

function diasEntreYmdInclusive(desde: string, hasta: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) return 0;
  const a = new Date(`${desde}T12:00:00-05:00`).getTime();
  const b = new Date(`${hasta}T12:00:00-05:00`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return Math.floor((b - a) / 86_400_000) + 1;
}

function metaClientesDiariosSugerida(meta: number, reto: MetaRetoActiva): number {
  if (meta <= 0) return 0;
  const dias = diasEntreYmdInclusive(reto.fechaInicio.trim(), reto.fechaFin.trim());
  if (dias > 0) return Math.max(1, Math.ceil(meta / dias));
  return Math.max(1, Math.ceil(meta / 30));
}

/** Prioriza fidelización; luego el reto diario; si no hay, el primero activo del periodo. */
function retoDestacadoParaHoy(retos: MetaRetoActiva[]): MetaRetoActiva | null {
  const fidelizacion = retos.filter((r) => esFidelizacion(r));
  if (fidelizacion.length > 0) return fidelizacion[0] ?? null;
  const diarios = retos.filter((r) => r.cadencia === "diario");
  if (diarios.length > 0) return diarios[0] ?? null;
  return retos[0] ?? null;
}

/** Estrella de cinco puntas centrada en viewBox 24×24 (forma reconocible al instante). */
const STAR_PATH_24 =
  "M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z";

/**
 * Estrella que se va llenando de abajo hacia arriba según el porcentaje (0–100).
 */
function IconEstrellaProgreso({
  porcentaje,
  className,
}: {
  porcentaje: number;
  className?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const gid = `mc-estrella-gold-${uid}`;
  const clipId = `mc-estrella-clip-${uid}`;
  const p = Math.max(0, Math.min(100, porcentaje));
  const fillH = (24 * p) / 100;
  const fillY = 24 - fillH;

  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient id={gid} x1="4" y1="3" x2="20" y2="21" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFF8DC" />
          <stop offset="0.35" stopColor="#FFE566" />
          <stop offset="0.65" stopColor="#FFC81C" />
          <stop offset="1" stopColor="#9A703A" />
        </linearGradient>
        <clipPath id={clipId}>
          <rect
            x="0"
            y={fillY}
            width="24"
            height={fillH}
            style={{
              transition: "y 0.75s ease-out, height 0.75s ease-out",
            }}
          />
        </clipPath>
      </defs>
      {/* Contorno vacío (lo que falta por lograr) */}
      <path
        d={STAR_PATH_24}
        fill="rgba(255,236,200,0.08)"
        stroke="rgba(255,224,160,0.45)"
        strokeWidth="0.9"
        strokeLinejoin="round"
      />
      {/* Relleno dorado recortado por el avance */}
      <path d={STAR_PATH_24} fill={`url(#${gid})`} clipPath={`url(#${clipId})`} />
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

function IconWallet({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20 7.5V6.8A2.8 2.8 0 0017.2 4H5.8A2.8 2.8 0 003 6.8v10.4A2.8 2.8 0 005.8 20h11.4a2.8 2.8 0 002.8-2.8v-.7"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12h4.25v4H16.5a2 2 0 010-4z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.5 14h.01" />
    </svg>
  );
}

function IconUsersHeart({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"
      />
      <circle cx="9" cy="7" r="4" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"
      />
    </svg>
  );
}

function BannerConcursoFidelizacion({
  reto,
  avance,
  pct,
}: {
  reto: MetaRetoActiva;
  avance: number;
  pct: number;
}) {
  const meta = Math.max(0, Number(reto.metaUnidades) || 0);
  const mes = nombreMesDesdeYmd(reto.fechaInicio.trim() || reto.fechaFin.trim());
  const titulo = mes ? `Concurso Fidelización ${mes}` : "Concurso Fidelización";
  const diarios = metaClientesDiariosSugerida(meta, reto);
  const premio = reto.bonoDetalle?.trim() || "Premio especial";

  return (
    <div className="relative overflow-hidden rounded-xl border border-violet-300/30 bg-gradient-to-br from-violet-950/70 via-[#1a1428]/80 to-[#0f0d14]/90 px-3 py-3 shadow-inner ring-1 ring-violet-200/15">
      <div
        className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-[radial-gradient(circle,rgba(167,139,250,0.35),transparent_68%)] blur-2xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -left-6 bottom-0 h-20 w-24 rounded-full bg-[radial-gradient(circle,rgba(255,200,60,0.18),transparent_70%)] blur-xl"
        aria-hidden
      />

      <div className="relative flex gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-violet-200/30 bg-violet-400/15 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.16em] text-violet-100">
              <IconUsersHeart className="h-3 w-3" />
              Concurso especial
            </span>
            <span className="rounded border border-[#FFE9B8]/25 bg-[#FFC81C]/10 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-[#E8DCC4]">
              {etiquetaCadenciaCorta(reto.cadencia)}
            </span>
          </div>

          <h3 className="mt-2 text-[15px] font-black leading-tight tracking-tight text-[#FFF8E8] drop-shadow-sm">
            {titulo}
          </h3>

          <p className="mt-1.5 text-[12px] font-bold leading-snug text-violet-100/95">
            Meta:{" "}
            <span className="tabular-nums text-[#FFE9B8]">{meta}</span> clientes fidelizados
          </p>

          {diarios > 0 ? (
            <p className="mt-1 text-[11px] font-semibold leading-snug text-emerald-200/90">
              {diarios} {diarios === 1 ? "cliente diario" : "clientes diarios"} te ponen en camino al premio
            </p>
          ) : null}

          <p className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-lg border border-[#FFE08A]/30 bg-[#FFC81C]/12 px-2 py-1 text-[10px] font-bold text-[#FFF2CC]">
            <span className="text-[8px] font-black uppercase tracking-wider text-[#FFE9A8]/80">Premio</span>
            <span className="truncate">{premio}</span>
          </p>

          <p className="mt-2 text-[10px] leading-snug text-[#C4B49A]">
            Registro + 2 millas, primera compra +1 milla = cliente fidelizado
          </p>

          <div className="mt-2.5 flex items-baseline justify-between gap-2">
            <span className="text-[10px] font-medium text-[#B8A88C]">
              <span className="tabular-nums font-bold text-[#FFE9B8]">{avance}</span>
              <span> / </span>
              <span className="tabular-nums">{meta}</span>
              <span> clientes en el periodo</span>
            </span>
            <span className="text-sm font-black tabular-nums text-[#FFF8E8]">{pct}%</span>
          </div>
          <div className="relative mt-1 h-2 overflow-hidden rounded-full bg-[#1a1510] ring-1 ring-violet-200/25">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-700 via-[#FFC81C] to-[#FFF2A8] motion-safe:transition-[width] motion-safe:duration-500 motion-safe:ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {reto.urlImagen ? (
          <div className="relative shrink-0 self-start">
            {/* eslint-disable-next-line @next/next/no-img-element -- URL externa del WMS */}
            <img
              src={reto.urlImagen}
              alt={premio}
              className="h-[5.5rem] w-[5.5rem] rounded-xl border border-violet-200/25 bg-white/10 object-cover shadow-lg ring-1 ring-black/20 sm:h-24 sm:w-24"
              loading="lazy"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          </div>
        ) : null}
      </div>
    </div>
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
  const { retos, ventas, ymdRef, cargando, error, refrescar } = useMetasRetosCaja();

  useEffect(() => {
    refrescar();
  }, [refrescar]);

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

  const billetera = useMemo(() => {
    const ganados = retos
      .map((reto) => {
        const { avance, rango } = avanceUnidadesReto(reto, ventas, ymdRef);
        const meta = Math.max(0, Number(reto.metaUnidades) || 0);
        if (meta <= 0 || avance < meta) return null;
        return {
          id: reto.id,
          producto:
            reto.descripcionProducto.trim() ||
            (reto.tipoReto === "fidelizacion_clientes" ? "Clientes fidelizados" : "Meta alcanzada"),
          bonoCOP: Math.max(0, Number(reto.bonoCOP) || 0),
          bonoDetalle: reto.bonoDetalle?.trim() || "",
          avance,
          meta,
          periodo: rango ? etiquetaRangoPeriodo(rango.desde, rango.hasta) : ymdRef,
        };
      })
      .filter(Boolean) as {
      id: string;
      producto: string;
      bonoCOP: number;
      bonoDetalle: string;
      avance: number;
      meta: number;
      periodo: string;
    }[];
    const totalCOP = ganados.reduce((sum, item) => sum + item.bonoCOP, 0);
    return { ganados, totalCOP };
  }, [retos, ventas, ymdRef]);

  const retoHoy = useMemo(() => retoDestacadoParaHoy(retos), [retos]);
  const retoFidelizacion = useMemo(() => retos.find((r) => esFidelizacion(r)) ?? null, [retos]);
  const avanceRetoHoy = useMemo(() => {
    if (!retoHoy) return null;
    return avanceUnidadesReto(retoHoy, ventas, ymdRef);
  }, [retoHoy, ventas, ymdRef]);
  const pctRetoHoy =
    retoHoy && avanceRetoHoy
      ? (() => {
          const meta = Math.max(0, Number(retoHoy.metaUnidades) || 0);
          const av = avanceRetoHoy.avance;
          return meta > 0 ? Math.min(100, Math.round((av / meta) * 100)) : 0;
        })()
      : 0;

  const tieneError = Boolean(error);
  const msg = mensajeMotivacional(stats.promedioPct, stats.completados, stats.total, cargando && !tieneError, tieneError);
  const barPct = tieneError ? 0 : stats.promedioPct;
  const pctEstrella =
    tieneError || (cargando && retos.length === 0)
      ? 0
      : retoFidelizacion && avanceRetoHoy && esFidelizacion(retoFidelizacion)
        ? pctRetoHoy
        : stats.total === 0
          ? 0
          : stats.promedioPct;

  const mostrarHeroFidelizacion =
    Boolean(retoFidelizacion && avanceRetoHoy && esFidelizacion(retoFidelizacion) && !tieneError);

  return (
    <div
      className="relative w-full min-w-0 overflow-hidden rounded-xl border border-[#FFE9B8]/30 bg-gradient-to-br from-[#2a2318]/90 via-[#1f1a14]/85 to-[#14110d]/90 px-4 py-3.5 shadow-[0_12px_36px_-14px_rgba(0,0,0,0.65)] backdrop-blur-md backdrop-saturate-150"
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
          <IconEstrellaProgreso
            porcentaje={pctEstrella}
            className="h-7 w-7 drop-shadow-[0_2px_6px_rgba(0,0,0,0.45)]"
          />
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex items-center gap-1.5">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#FFE9A8]/95">Tu poder de venta</p>
            <IconSparkles className="h-3.5 w-3.5 shrink-0 text-[#FFC81C]/90 motion-safe:animate-pulse" />
          </div>
          <p className="mt-1.5 text-[11px] font-medium leading-snug text-[#F5E6C8]/92">{msg}</p>
        </div>
      </div>

      {mostrarHeroFidelizacion && retoFidelizacion && avanceRetoHoy ? (
        <div className="relative mt-3">
          <BannerConcursoFidelizacion reto={retoFidelizacion} avance={avanceRetoHoy.avance} pct={pctRetoHoy} />
        </div>
      ) : null}

      <div className="relative mt-3 overflow-hidden rounded-xl border border-emerald-300/25 bg-gradient-to-br from-emerald-950/55 via-[#11140d]/65 to-[#0d0b08]/70 px-3 py-2.5 shadow-inner ring-1 ring-black/20">
        <div
          className="pointer-events-none absolute -right-5 -top-8 h-20 w-20 rounded-full bg-[radial-gradient(circle,rgba(52,211,153,0.24),transparent_68%)] blur-2xl"
          aria-hidden
        />
        <div className="relative flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-300/25 bg-emerald-400/10 text-emerald-200">
              <IconWallet className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-emerald-200/90">
                Mi billetera de bonos
              </p>
              <p className="mt-1 text-[10px] leading-snug text-[#CDEEDB]/80">
                {billetera.ganados.length > 0
                  ? `${billetera.ganados.length} ${billetera.ganados.length === 1 ? "bono ganado" : "bonos ganados"} por metas cumplidas.`
                  : "Aquí se acumulan los bonos cuando completas metas."}
              </p>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[8px] font-bold uppercase tracking-wide text-emerald-200/60">
              {billetera.totalCOP > 0 ? "Ganado" : "Premios"}
            </p>
            <p className="text-lg font-black tabular-nums leading-tight text-emerald-200">
              {billetera.totalCOP > 0 ? `$${formatPesosCop(billetera.totalCOP, false)}` : billetera.ganados.length}
            </p>
          </div>
        </div>

        {billetera.ganados.length > 0 ? (
          <div className="relative mt-2 max-h-24 space-y-1 overflow-y-auto pr-1">
            {billetera.ganados.map((item) => {
              const retoGanado = retos.find((r) => r.id === item.id);
              const sufijoUnidad =
                retoGanado && esFidelizacion(retoGanado) ? " clientes" : " u.";
              return (
              <div
                key={`${item.id}:${item.periodo}`}
                className="rounded-lg border border-emerald-300/15 bg-white/[0.055] px-2 py-1.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 truncate text-[10px] font-bold text-[#F2FFF7]">{item.producto}</p>
                  <span className="shrink-0 text-[10px] font-black tabular-nums text-emerald-200">
                    {item.bonoDetalle || `$${formatPesosCop(item.bonoCOP, false)}`}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-[8px] font-medium text-emerald-100/55">
                  {item.avance}/{item.meta}
                  {sufijoUnidad} · {item.periodo}
                </p>
              </div>
            );
            })}
          </div>
        ) : null}
      </div>

      {!mostrarHeroFidelizacion ? (
      <div className="relative mt-3 rounded-lg border border-[#FFE08A]/25 bg-[#0d0b08]/55 px-2.5 py-2 shadow-inner ring-1 ring-black/20">
        <div className="flex items-center justify-between gap-2 border-b border-[#3d3428]/80 pb-1.5">
          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#FFC81C]/95">
            {retoHoy && esFidelizacion(retoHoy) ? "Concurso de fidelización" : "Reto activo hoy"}
          </p>
          {retoHoy && !esFidelizacion(retoHoy) ? (
            <span className="shrink-0 rounded border border-[#FFE9B8]/25 bg-[#FFC81C]/10 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-[#E8DCC4]">
              {etiquetaCadenciaCorta(retoHoy.cadencia)}
            </span>
          ) : null}
        </div>
        {cargando && retos.length === 0 && !tieneError ? (
          <div className="mt-2 space-y-1.5" aria-busy>
            <div className="h-3 w-4/5 animate-pulse rounded bg-[#3d3428]/70" />
            <div className="h-2 w-full animate-pulse rounded bg-[#3d3428]/50" />
          </div>
        ) : retoHoy && avanceRetoHoy ? (
          <div className="mt-2 min-w-0">
            <p className="text-[12px] font-bold leading-snug text-[#FFF8E8]">
              {retoHoy.descripcionProducto.trim() || "Producto del reto"}
            </p>
            {retoHoy.skuBarcode.trim() ? (
              <p className="mt-0.5 font-mono text-[9px] text-[#9A8B74]">SKU {retoHoy.skuBarcode}</p>
            ) : null}
            {retoHoy.descripcionReto.trim() ? (
              <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-[#C4B49A]">{retoHoy.descripcionReto.trim()}</p>
            ) : null}
            <div className="mt-2 flex items-baseline justify-between gap-2">
              <span className="text-[10px] font-medium text-[#B8A88C]">
                <span className="tabular-nums font-bold text-[#FFE9B8]">{avanceRetoHoy.avance}</span>
                <span> / </span>
                <span className="tabular-nums">{Math.max(0, retoHoy.metaUnidades)}</span>
                <span>{etiquetaUnidadReto(retoHoy, retoHoy.cadencia)}</span>
              </span>
              <span className="text-sm font-black tabular-nums text-[#FFF8E8]">{pctRetoHoy}%</span>
            </div>
            <div className="relative mt-1 h-1.5 overflow-hidden rounded-full bg-[#1a1510] ring-1 ring-[#FFE08A]/20">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#8B6914] via-[#FFC81C] to-[#FFF2A8] motion-safe:transition-[width] motion-safe:duration-500 motion-safe:ease-out"
                style={{ width: `${pctRetoHoy}%` }}
              />
            </div>
          </div>
        ) : tieneError ? (
          <p className="mt-2 text-[10px] leading-snug text-[#D4A574]">
            {error?.trim() || "No se pudo cargar el reto. Reintentá al actualizar metas."}
          </p>
        ) : (
          <p className="mt-2 text-[10px] leading-snug text-[#9A8B74]">
            No hay reto diario ni campaña activa para tu punto en la fecha de hoy. Entrá a «Metas y bonificaciones» para
            ver el detalle.
          </p>
        )}
      </div>
      ) : null}

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
