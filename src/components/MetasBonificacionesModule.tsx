"use client";

import { fechaColombia } from "@/lib/fecha-colombia";
import { formatPesosCop } from "@/lib/pesos-cop-input";

export interface MetasBonificacionesModuleProps {
  puntoVenta: string | null;
}

/** Datos de demostración hasta que el WMS entregue metas estandarizadas por PV. */
const DEMO_META_HOY = {
  titulo: "Arepas de peto",
  metaUnidades: 30,
  avanceUnidades: 18,
  bonoCop: 5000,
};

export default function MetasBonificacionesModule({ puntoVenta }: MetasBonificacionesModuleProps) {
  const pv = (puntoVenta ?? "").replace(/\u00a0/g, " ").trim() || "—";
  const hoy = fechaColombia(new Date(), { weekday: "long", day: "numeric", month: "long" });
  const pct = Math.min(
    100,
    Math.round((DEMO_META_HOY.avanceUnidades / Math.max(1, DEMO_META_HOY.metaUnidades)) * 100)
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2">
            <h2 className="text-xl font-bold text-gray-900 md:text-2xl">Metas y bonificaciones</h2>
            <span className="animate-pulse rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900 ring-1 ring-amber-300/60">
              Vista previa
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-600">
            Punto de venta: <span className="font-medium text-gray-800">{pv}</span>
          </p>
        </div>
        <p className="rounded-lg border border-dashed border-primary-200 bg-primary-50/80 px-3 py-2 text-xs text-primary-900">
          Mañana conectamos esta pantalla al <strong className="font-semibold">WMS</strong> para que las metas y bonos sean
          los mismos en todos los equipos.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_min(320px,100%)]">
        <section className="relative overflow-hidden rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50/90 via-white to-orange-50/70 p-6 shadow-md ring-1 ring-amber-100">
          <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-brand-yellow/25 blur-3xl animate-metas-glow" />
          <div className="pointer-events-none absolute bottom-0 left-1/4 h-24 w-24 rounded-full bg-primary-200/20 blur-2xl animate-metas-float" />

          <div className="relative flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-amber-800/90">Meta del día</p>
              <p className="mt-0.5 text-sm capitalize text-gray-600">{hoy}</p>
            </div>
            <div className="flex items-center gap-2 rounded-xl bg-white/80 px-3 py-2 shadow-sm ring-1 ring-amber-200/60">
              <span className="text-2xl animate-metas-float" aria-hidden>
                🎯
              </span>
              <div className="text-right">
                <p className="text-[10px] font-medium uppercase text-gray-500">Progreso</p>
                <p className="text-lg font-bold tabular-nums text-gray-900">{pct}%</p>
              </div>
            </div>
          </div>

          <h3 className="relative mt-5 text-lg font-bold text-gray-900 md:text-xl">
            Vender{" "}
            <span className="bg-gradient-to-r from-primary-600 to-amber-600 bg-clip-text text-transparent">
              {DEMO_META_HOY.metaUnidades} {DEMO_META_HOY.titulo}
            </span>
          </h3>
          <p className="relative mt-2 text-sm text-gray-600">
            Ejemplo ilustrativo: al completar la meta, el equipo puede acceder a un bono definido por la operación.
          </p>

          <div className="relative mt-6">
            <div className="mb-2 flex justify-between text-xs font-medium text-gray-600">
              <span>
                Llevás{" "}
                <span className="tabular-nums text-gray-900">{DEMO_META_HOY.avanceUnidades}</span> /{" "}
                <span className="tabular-nums">{DEMO_META_HOY.metaUnidades}</span>
              </span>
              <span className="text-amber-800">¡Seguí así!</span>
            </div>
            <div className="relative h-4 overflow-hidden rounded-full bg-amber-100/90 ring-1 ring-amber-200/80">
              <div
                className="relative h-full rounded-full bg-gradient-to-r from-brand-yellow via-amber-400 to-primary-500 transition-all duration-700 ease-out"
                style={{ width: `${pct}%` }}
              >
                <div className="absolute inset-0 w-full bg-gradient-to-r from-transparent via-white/40 to-transparent animate-metas-shimmer" />
              </div>
            </div>
          </div>
        </section>

        <aside className="flex flex-col gap-4">
          <div className="relative overflow-hidden rounded-2xl border border-emerald-200/90 bg-gradient-to-b from-emerald-50 to-white p-5 shadow-md ring-1 ring-emerald-100">
            <div className="absolute right-3 top-3 text-3xl opacity-90 animate-metas-float" aria-hidden>
              🏆
            </div>
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-800">Bono al cumplir</p>
            <p className="mt-3 text-3xl font-extrabold tabular-nums text-emerald-900">
              ${formatPesosCop(DEMO_META_HOY.bonoCop, false)}
            </p>
            <p className="mt-2 text-xs text-emerald-800/90">Monto de ejemplo — lo confirmará el WMS.</p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase text-gray-500">Próximos retos</p>
            <ul className="mt-3 space-y-3">
              {[1, 2, 3].map((i) => (
                <li key={i} className="flex items-center gap-3 rounded-lg bg-gray-50/80 px-3 py-2.5 animate-pulse">
                  <div className="h-10 w-10 shrink-0 rounded-lg bg-gray-200/80" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="h-2.5 w-3/4 rounded bg-gray-200" />
                    <div className="h-2 w-1/2 rounded bg-gray-100" />
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-center text-[11px] text-gray-400">Espacio reservado para metas semanales (WMS)</p>
          </div>
        </aside>
      </div>

      <div className="rounded-xl border border-gray-200 bg-gray-50/80 px-4 py-3 text-center text-xs text-gray-600">
        <span className="inline-flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary-500" />
          </span>
          Estructura lista para enlazar API del WMS (metas, avance en vivo y reglas de bonificación).
        </span>
      </div>
    </div>
  );
}
