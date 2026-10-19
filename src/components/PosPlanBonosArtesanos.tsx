"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ymdColombia } from "@/lib/fecha-colombia";
import { formatPesosCop } from "@/lib/pesos-cop-input";
import {
  listarLogrosPlanBonosHoy,
  publicarLogroPlanBonos,
} from "@/lib/plan-bonos-artesanos-client";
import {
  PLAN_BONOS_ARTESANOS_METAS,
  PLAN_BONOS_ESCALA_MAX_COP,
  marcarCelebradoLocal,
  marcarVistoRemoto,
  metasAlcanzadas,
  registrarBonoEnBilletera,
  siguienteMetaPendiente,
  storageKeyLogroLocal,
  yaCelebradoLocal,
  yaVistoRemoto,
  type PlanBonosLogroPublicado,
  type PlanBonosMeta,
} from "@/lib/plan-bonos-artesanos";
import { puntoVentaCoincide } from "@/lib/punto-venta-clave";

type Props = {
  puntoVenta?: string | null;
  /** Venta acumulada del turno (borrador: proxy de venta del día). */
  ventaActual: number;
  getIdToken: () => Promise<string | null>;
  /** Nombre del artesano/cajero en turno (historial franquiciado). */
  artesanoNombre?: string | null;
};

type Celebracion =
  | { tipo: "local"; meta: PlanBonosMeta; venta: number }
  | { tipo: "remoto"; logro: PlanBonosLogroPublicado };

const POLL_REMOTO_MS = 25_000;
/** Aviso previo: visible hasta el 23-oct inclusive; desaparece el 24-oct-2026 (Colombia). */
const AVISO_DISPONIBLE_HASTA_YMD = "2026-10-24";

function dinero(n: number): string {
  return `$${formatPesosCop(n, false)}`;
}

/** Posición en la barra con margen lateral para que iconos/textos no se corten. */
function posBarraPct(montoCOP: number, maxCOP = PLAN_BONOS_ESCALA_MAX_COP): number {
  const raw = Math.min(100, Math.max(0, (montoCOP / maxCOP) * 100));
  const inset = 12;
  return inset + (raw / 100) * (100 - inset * 2);
}

function colorTono(tono: PlanBonosMeta["tono"]): string {
  if (tono === "oro") return "from-amber-300 via-yellow-400 to-amber-500";
  if (tono === "plata") return "from-slate-200 via-slate-100 to-slate-300";
  return "from-amber-700 via-orange-600 to-amber-800";
}

function IconoMetaMedalla({ tono, activo }: { tono: PlanBonosMeta["tono"]; activo: boolean }) {
  const grad =
    tono === "oro"
      ? { a: "#FDE68A", b: "#F59E0B", c: "#B45309" }
      : tono === "plata"
        ? { a: "#F8FAFC", b: "#CBD5E1", c: "#64748B" }
        : { a: "#FDBA74", b: "#C2410C", c: "#7C2D12" };
  const id = `plan-bonos-medal-${tono}`;
  return (
    <svg
      viewBox="0 0 32 36"
      className={`h-7 w-7 drop-shadow-md transition-opacity ${activo ? "opacity-100" : "opacity-75"}`}
      aria-hidden
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={grad.a} />
          <stop offset="55%" stopColor={grad.b} />
          <stop offset="100%" stopColor={grad.c} />
        </linearGradient>
      </defs>
      <path d="M10 2h4l1.2 7H8.8L10 2zm8 0h4l1.2 7h-6.4L18 2z" fill={grad.b} opacity="0.95" />
      <circle cx="16" cy="22" r="12" fill={`url(#${id})`} stroke="#FFF8E8" strokeWidth="1.2" />
      <circle cx="16" cy="22" r="7.2" fill="none" stroke="#FFF8E8" strokeWidth="1" opacity="0.55" />
      <text
        x="16"
        y="25.5"
        textAnchor="middle"
        fontSize="9"
        fontWeight="800"
        fill="#1a1510"
        fontFamily="system-ui,sans-serif"
      >
        {tono === "oro" ? "1M" : tono === "plata" ? "700" : "500"}
      </text>
    </svg>
  );
}

function CelebracionOverlay({
  data,
  onCerrar,
}: {
  data: Celebracion;
  onCerrar: () => void;
}) {
  const esLocal = data.tipo === "local";
  const meta = esLocal ? data.meta : null;
  const logro = !esLocal ? data.logro : null;
  const tono = esLocal ? meta!.tono : logro!.tono;
  const titulo = esLocal
    ? "¡Felicitaciones, artesanos!"
    : `¡${logro!.puntoVenta} alcanzó una meta!`;
  const subtitulo = esLocal
    ? `${meta!.etiqueta}: venta de ${dinero(meta!.umbralCOP)} · bono ${dinero(meta!.bonoCOP)}`
    : `${logro!.etiqueta}: llegó a ${dinero(logro!.umbralCOP)} y gana ${dinero(logro!.bonoCOP)} hoy`;

  return (
    <div className="fixed inset-0 z-[240] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
      <style>{`
        @keyframes plan-bonos-confetti {
          0% { transform: translate3d(0,0,0) rotate(0) scale(.5); opacity: 0; }
          15% { opacity: 1; }
          100% { transform: translate3d(var(--mx), var(--my), 0) rotate(var(--mr)) scale(1); opacity: 0; }
        }
        @keyframes plan-bonos-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.04); }
        }
      `}</style>
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        {Array.from({ length: 28 }).map((_, i) => (
          <span
            key={i}
            className="absolute left-1/2 top-1/2 h-2 w-2 rounded-sm"
            style={{
              ["--mx" as string]: `${Math.cos(i * 0.8) * (120 + (i % 5) * 30)}px`,
              ["--my" as string]: `${Math.sin(i * 0.8) * (90 + (i % 6) * 24)}px`,
              ["--mr" as string]: `${100 + i * 40}deg`,
              animation: `plan-bonos-confetti ${1.7 + (i % 4) * 0.15}s ease-out ${i * 0.03}s infinite`,
              backgroundColor: ["#FFC81C", "#f59e0b", "#22c55e", "#f8fafc", "#fb923c"][i % 5],
            }}
          />
        ))}
      </div>

      <section
        className="relative w-full max-w-lg overflow-hidden rounded-[1.75rem] border border-[#FFE08A]/50 bg-gradient-to-br from-[#1a1510] via-[#2a2118] to-[#120e0b] p-6 text-center shadow-[0_40px_100px_-30px_rgba(0,0,0,0.9)]"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="plan-bonos-celeb-title"
      >
        <div
          className={`mx-auto flex h-24 w-24 items-center justify-center rounded-[1.5rem] bg-gradient-to-br ${colorTono(tono)} text-5xl shadow-xl`}
          style={{ animation: "plan-bonos-pulse 2s ease-in-out infinite" }}
          aria-hidden
        >
          {tono === "oro" ? "👑" : tono === "plata" ? "🥈" : "🥉"}
        </div>
        <p className="mt-4 text-[10px] font-black uppercase tracking-[0.28em] text-[#FFC81C]">
          Plan de bonos · Artesanos
        </p>
        <h2 id="plan-bonos-celeb-title" className="mt-2 text-2xl font-black tracking-tight text-[#FFF8E8] sm:text-3xl">
          {titulo}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-[#E8DCC4]">{subtitulo}</p>
        {esLocal ? (
          <p className="mt-2 text-xs text-[#9A8B74]">
            Venta del turno: <strong className="text-[#FFE9B8]">{dinero(data.venta)}</strong>
          </p>
        ) : (
          <p className="mt-2 text-xs text-[#9A8B74]">Aviso en vivo para todos los POS del día.</p>
        )}
        <button
          type="button"
          onClick={onCerrar}
          className="mt-6 rounded-full border border-[#FFC81C]/60 bg-[#FFC81C] px-6 py-2.5 text-sm font-black uppercase tracking-wide text-gray-950 shadow-lg hover:brightness-105"
        >
          Continuar
        </button>
      </section>
    </div>
  );
}

/**
 * Borrador: barra horizontal de metas del plan de bonos artesanos + celebración
 * local y aviso a otros POS vía Firestore.
 */
export default function PosPlanBonosArtesanos({
  puntoVenta,
  ventaActual,
  getIdToken,
  artesanoNombre,
}: Props) {
  const pv = puntoVenta?.trim() || "";
  const artesano = artesanoNombre?.trim() || "";
  const ymd = ymdColombia();
  const mostrarAvisoDisponible = ymd < AVISO_DISPONIBLE_HASTA_YMD;
  const venta = Math.max(0, Math.round(Number.isFinite(ventaActual) ? ventaActual : 0));
  const siguiente = siguienteMetaPendiente(venta);
  const alcanzadas = useMemo(() => metasAlcanzadas(venta), [venta]);

  const [celebracion, setCelebracion] = useState<Celebracion | null>(null);
  const celebracionRef = useRef<Celebracion | null>(null);
  const publicandoRef = useRef<Set<string>>(new Set());
  celebracionRef.current = celebracion;

  const cerrarCelebracion = useCallback(() => {
    setCelebracion((prev) => {
      if (prev?.tipo === "local") {
        marcarCelebradoLocal(storageKeyLogroLocal(pv, ymd, prev.meta.id));
      } else if (prev?.tipo === "remoto") {
        marcarVistoRemoto(prev.logro.id);
      }
      return null;
    });
  }, [pv, ymd]);

  /** Celebraciones locales pendientes (una a la vez). */
  useEffect(() => {
    if (!pv || celebracion) return;
    const pendientes = alcanzadas.filter(
      (m) => !yaCelebradoLocal(storageKeyLogroLocal(pv, ymd, m.id))
    );
    if (pendientes.length === 0) return;
    setCelebracion({ tipo: "local", meta: pendientes[0], venta });
  }, [alcanzadas, celebracion, pv, venta, ymd]);

  /** Publica logro + acumula en billetera quincenal. */
  useEffect(() => {
    if (!pv || celebracion?.tipo !== "local") return;
    const meta = celebracion.meta;
    registrarBonoEnBilletera(pv, meta, ymd, artesano || undefined);
    const key = `${ymd}:${meta.id}`;
    if (publicandoRef.current.has(key)) return;
    publicandoRef.current.add(key);
    void (async () => {
      try {
        const token = await getIdToken();
        if (!token) return;
        await publicarLogroPlanBonos(token, {
          metaId: meta.id,
          ventaAlcanzada: venta,
          puntoVenta: pv,
        });
      } finally {
        publicandoRef.current.delete(key);
      }
    })();
  }, [artesano, celebracion, getIdToken, pv, venta, ymd]);

  /** Si ya se celebró hoy (reload), asegura el bono en la billetera de la quincena. */
  useEffect(() => {
    if (!pv) return;
    for (const m of alcanzadas) {
      if (yaCelebradoLocal(storageKeyLogroLocal(pv, ymd, m.id))) {
        registrarBonoEnBilletera(pv, m, ymd, artesano || undefined);
      }
    }
  }, [alcanzadas, artesano, pv, ymd]);

  /** Poll de logros de otros puntos. */
  useEffect(() => {
    if (!pv) return;
    let cancelled = false;

    const poll = async () => {
      if (celebracionRef.current) return;
      const token = await getIdToken();
      if (!token || cancelled) return;
      const r = await listarLogrosPlanBonosHoy(token);
      if (!r.ok || cancelled || celebracionRef.current) return;
      const ajeno = r.logros.find(
        (l) =>
          !puntoVentaCoincide(l.puntoVenta, pv) &&
          !yaVistoRemoto(l.id) &&
          Date.now() - l.createdAtMs < 1000 * 60 * 60 * 12
      );
      if (ajeno) {
        setCelebracion({ tipo: "remoto", logro: ajeno });
      }
    };

    void poll();
    const id = window.setInterval(() => void poll(), POLL_REMOTO_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [getIdToken, pv]);

  if (!pv) return null;

  const falta = siguiente ? Math.max(0, siguiente.umbralCOP - venta) : 0;

  return (
    <>
      <section
        className="mb-3 rounded-2xl border border-[#FFE08A]/40 bg-gradient-to-r from-[#1a1510] via-[#241c14] to-[#15110d] px-3 py-3 shadow-[0_10px_28px_-14px_rgba(0,0,0,0.55)] sm:px-5"
        aria-label="Plan de bonos artesanos"
        data-pos-plan-bonos="1"
      >
        {mostrarAvisoDisponible ? (
          <p
            className="mb-2 rounded-lg border border-[#FFC81C]/45 bg-[#FFC81C]/15 px-2.5 py-1.5 text-center text-[11px] font-bold leading-snug text-[#FFF4DC]"
            role="status"
          >
            Bonos disponibles desde el <span className="text-[#FFC81C]">23 de octubre 2026</span>
          </p>
        ) : null}
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#FFC81C]">
              Plan de bonos · Artesanos
            </p>
            <p className="mt-0.5 text-sm font-bold text-[#FFF8E8]">
              Venta actual:{" "}
              <span className="tabular-nums text-[#FFC81C]">{dinero(venta)}</span>
            </p>
          </div>
          <p className="text-[11px] font-semibold text-[#F5E6C8]">
            {siguiente
              ? `Faltan ${dinero(falta)} para ${siguiente.etiqueta.toLowerCase()}`
              : "¡Bono de oro desbloqueado hoy!"}
          </p>
        </div>

        {/* Pista + metas centradas (con margen para no cortar oro) */}
        <div className="relative mt-4">
          <div className="relative h-[7.5rem]">
            <div className="absolute left-0 right-0 top-[3.15rem] h-3 overflow-hidden rounded-full border border-[#FFE9B8]/40 bg-[#0f0c09]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#B45309] via-[#FFC81C] to-[#FDE68A] transition-[width] duration-700 ease-out"
                style={{ width: `${posBarraPct(venta)}%` }}
              />
            </div>

            {PLAN_BONOS_ARTESANOS_METAS.map((m) => {
              const left = posBarraPct(m.umbralCOP);
              const ok = venta >= m.umbralCOP;
              return (
                <div
                  key={m.id}
                  className="absolute top-0 flex w-[6.25rem] -translate-x-1/2 flex-col items-center text-center"
                  style={{ left: `${left}%` }}
                >
                  <IconoMetaMedalla tono={m.tono} activo={ok} />
                  <span
                    className={`mt-0.5 text-[9px] font-black uppercase tracking-wider ${
                      ok ? "text-[#FFC81C]" : "text-[#F5E6C8]"
                    }`}
                  >
                    {m.tono}
                  </span>
                  <span
                    className={`mt-2 h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-[#1a1510] ${
                      ok ? "bg-[#FFC81C] shadow-[0_0_8px_rgba(255,200,28,0.75)]" : "bg-[#C4B49A]"
                    }`}
                    aria-hidden
                  />
                  <p className="mt-1 w-full text-[10px] font-bold tabular-nums leading-tight text-[#FFF4DC]">
                    {dinero(m.umbralCOP)}
                  </p>
                  <p
                    className={`mt-0.5 w-full text-[13px] font-black tabular-nums leading-none tracking-tight drop-shadow-[0_0_8px_rgba(255,200,28,0.45)] sm:text-sm ${
                      ok ? "text-[#FFC81C]" : "text-[#FFE08A]"
                    }`}
                  >
                    +{dinero(m.bonoCOP)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        <p className="mt-2 text-[10px] leading-snug text-[#E8D5B0]">
          Borrador: al cruzar cada meta sale felicitación en pantalla y se avisa a los demás POS del día.
        </p>
      </section>

      {celebracion ? <CelebracionOverlay data={celebracion} onCerrar={cerrarCelebracion} /> : null}
    </>
  );
}
