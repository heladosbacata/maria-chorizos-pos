"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { auth } from "@/lib/firebase";
import { fechaColombia, ymdColombia, ymdColombiaMenosDias } from "@/lib/fecha-colombia";
import { parsePesosCopInput } from "@/lib/pesos-cop-input";
import { listarVentasPosCloud } from "@/lib/pos-ventas-cloud-client";
import {
  esVentaVigente,
  listarVentasPuntoVentaEnEsteEquipo,
  mergeVentasReporteNubeLocal,
  type VentaGuardadaLocal,
} from "@/lib/pos-ventas-local-storage";
import {
  suscripcionCambiosComprasGastos,
  totalRegistradoComprasGastosEnMes,
} from "@/lib/compras-gastos-franquicia-storage";
import {
  guardarGastosPyg,
  leerGastosPyg,
  totalGastos,
  type PygGastosMensuales,
} from "@/lib/pyg-franquicia-storage";

export interface PygFranquiciaPanelProps {
  puntoVenta: string | null;
  uid: string | null;
  onVolver?: () => void;
  /** Navega al registro de compras y gastos (Más → Compras y gastos) */
  onIrAComprasGastos?: () => void;
}

function formatCop(n: number): string {
  return n.toLocaleString("es-CO", { maximumFractionDigits: 0, minimumFractionDigits: 0 });
}

function ymDesdeYmd(ymd: string): string {
  return ymd.slice(0, 7);
}

/** Primer día del mes en YYYY-MM-DD */
function primerDiaMes(ym: string): string {
  return `${ym}-01`;
}

/** Último día del mes (Colombia-safe) */
function ultimoDiaMes(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return `${ym}-28`;
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return ymdColombiaMenosDias(next, 1);
}

function mesAnterior(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, "0")}`;
}

function mesSiguiente(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  if (m === 12) return `${y + 1}-01`;
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}

function etiquetaMes(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  const d = new Date(`${y}-${String(m).padStart(2, "0")}-15T12:00:00-05:00`);
  return fechaColombia(d, { month: "long", year: "numeric" });
}

function ingresosDelMes(ventas: VentaGuardadaLocal[], ym: string): { bruto: number; tickets: number } {
  let bruto = 0;
  let tickets = 0;
  const desde = primerDiaMes(ym);
  const hasta = ultimoDiaMes(ym);
  for (const v of ventas) {
    if (!esVentaVigente(v)) continue;
    const fy = (v.fechaYmd ?? "").trim();
    if (!fy || fy < desde || fy > hasta) continue;
    bruto += Number(v.total) || 0;
    tickets += 1;
  }
  return { bruto: Math.round(bruto * 100) / 100, tickets };
}

export default function PygFranquiciaPanel({
  puntoVenta,
  uid,
  onVolver,
  onIrAComprasGastos,
}: PygFranquiciaPanelProps) {
  const pv = (puntoVenta ?? "").replace(/\u00a0/g, " ").trim();
  const u = (uid ?? "").trim();
  const ymHoy = ymDesdeYmd(ymdColombia(new Date()));

  const [ym, setYm] = useState(ymHoy);
  const [gastos, setGastos] = useState<PygGastosMensuales>(() =>
    pv ? leerGastosPyg(pv, ymHoy) : { arriendo: 0, personal: 0, servicios: 0, otros: 0 }
  );
  const [ventasNube, setVentasNube] = useState<VentaGuardadaLocal[] | null>(null);
  const [ventasTick, setVentasTick] = useState(0);
  const [nubeAviso, setNubeAviso] = useState<string | null>(null);
  const [cgTick, setCgTick] = useState(0);

  useEffect(() => suscripcionCambiosComprasGastos(() => setCgTick((t) => t + 1)), []);

  useEffect(() => {
    if (!pv) return;
    setGastos(leerGastosPyg(pv, ym));
  }, [pv, ym]);

  useEffect(() => {
    if (!pv) return;
    const t = window.setTimeout(() => guardarGastosPyg(pv, ym, gastos), 250);
    return () => window.clearTimeout(t);
  }, [pv, ym, gastos]);

  useEffect(() => {
    if (!u || !pv) {
      setVentasNube(null);
      return;
    }
    let c = false;
    (async () => {
      try {
        const token = await auth?.currentUser?.getIdToken();
        if (!token || c) return;
        const rows = await listarVentasPosCloud(token);
        if (!c) {
          setVentasNube(rows);
          setNubeAviso(null);
        }
      } catch (e) {
        if (!c) {
          setVentasNube([]);
          setNubeAviso(
            e instanceof Error ? e.message : "Solo se muestran ventas registradas en este equipo."
          );
        }
      }
    })();
    return () => {
      c = true;
    };
  }, [u, pv, ventasTick]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") setVentasTick((t) => t + 1);
    }, 45_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") setVentasTick((t) => t + 1);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const ventas = useMemo(() => {
    void ventasTick;
    if (!pv) return [];
    const local = listarVentasPuntoVentaEnEsteEquipo(pv);
    if (ventasNube === null) return local;
    return mergeVentasReporteNubeLocal(local, ventasNube);
  }, [pv, ventasTick, ventasNube]);

  const { bruto: ingresos, tickets } = useMemo(() => ingresosDelMes(ventas, ym), [ventas, ym]);
  const gastosCategorias = useMemo(() => totalGastos(gastos), [gastos]);
  const gastosRegistroMes = useMemo(() => {
    void cgTick;
    if (!pv) return 0;
    return totalRegistradoComprasGastosEnMes(pv, ym);
  }, [pv, ym, cgTick]);
  const gastosTot = Math.round((gastosCategorias + gastosRegistroMes) * 100) / 100;
  const resultado = Math.round((ingresos - gastosTot) * 100) / 100;
  const margenPct = ingresos > 0 ? Math.min(100, Math.round((resultado / ingresos) * 1000) / 10) : null;
  const ratioGasto = ingresos > 0 ? Math.min(100, Math.round((gastosTot / ingresos) * 1000) / 10) : 0;

  const setCampo = useCallback((campo: keyof PygGastosMensuales, raw: string) => {
    const n = parsePesosCopInput(raw);
    setGastos((g) => ({ ...g, [campo]: n }));
  }, []);

  const camposGasto: { key: keyof PygGastosMensuales; label: string; hint: string; icon: string }[] = [
    { key: "arriendo", label: "Arriendo del local", hint: "Canon mensual del punto de venta", icon: "🏢" },
    { key: "personal", label: "Gasto de personal", hint: "Nómina, auxilios y cargas del mes", icon: "👥" },
    { key: "servicios", label: "Servicios públicos", hint: "Luz, agua, gas, internet…", icon: "⚡" },
    { key: "otros", label: "Otros gastos fijos", hint: "Mercadeo, logística, mantenimiento…", icon: "📋" },
  ];

  if (!pv) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50/90 p-8 text-center text-amber-950">
        <p className="text-lg font-semibold">Sin punto de venta</p>
        <p className="mt-2 text-sm">Asigná un punto de venta en tu perfil para ver tu PYG.</p>
        {onVolver ? (
          <button
            type="button"
            onClick={onVolver}
            className="mt-6 rounded-xl border-2 border-amber-300 bg-white px-5 py-2.5 text-sm font-semibold text-amber-900 hover:bg-amber-100"
          >
            Volver
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="relative mx-auto max-w-5xl space-y-8 pb-10">
      {/* Fondo decorativo */}
      <div className="pointer-events-none absolute -left-20 -top-10 h-64 w-64 rounded-full bg-gradient-to-br from-emerald-200/40 to-cyan-200/30 blur-3xl animate-pyg-ambient" />
      <div className="pointer-events-none absolute -right-16 top-32 h-56 w-56 rounded-full bg-gradient-to-bl from-violet-200/35 to-primary-200/25 blur-3xl animate-pyg-ambient-delayed" />

      <header className="relative flex flex-wrap items-start justify-between gap-4">
        <div>
          {onVolver ? (
            <button
              type="button"
              onClick={onVolver}
              className="mb-3 inline-flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Configuración
            </button>
          ) : null}
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-900 to-slate-700 text-2xl shadow-lg shadow-slate-900/25 ring-2 ring-white/20 animate-pyg-float">
              📊
            </div>
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight text-gray-900 md:text-3xl">
                PYG del punto de venta
              </h2>
              <p className="mt-0.5 text-sm text-gray-600">
                Ingresos desde ventas en el POS · Gastos por categoría y registro de compras/gastos ·{" "}
                <span className="font-medium text-slate-700">Resultado del mes</span>
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Mes contable</p>
          <div className="flex items-center gap-1 rounded-2xl border border-gray-200/80 bg-white/90 p-1 shadow-sm backdrop-blur-sm">
            <button
              type="button"
              onClick={() => setYm((y) => mesAnterior(y))}
              className="rounded-xl p-2.5 text-gray-600 transition hover:bg-gray-100 hover:text-gray-900"
              aria-label="Mes anterior"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="min-w-[10rem] px-3 text-center text-sm font-bold capitalize text-gray-900">
              {etiquetaMes(ym)}
            </span>
            <button
              type="button"
              onClick={() => setYm((y) => mesSiguiente(y))}
              disabled={ym >= ymHoy}
              className="rounded-xl p-2.5 text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-35"
              aria-label="Mes siguiente"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
          <button
            type="button"
            onClick={() => setVentasTick((t) => t + 1)}
            className="text-xs font-semibold text-primary-700 underline-offset-2 hover:underline"
          >
            Actualizar ventas
          </button>
        </div>
      </header>

      {nubeAviso ? (
        <p className="relative rounded-xl border border-amber-200 bg-amber-50/95 px-4 py-2 text-xs text-amber-950">
          {nubeAviso}
        </p>
      ) : null}

      {/* KPIs */}
      <div className="relative grid gap-4 sm:grid-cols-3">
        <article className="group relative overflow-hidden rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-teal-50/80 p-5 shadow-md ring-1 ring-emerald-100/80 transition-transform duration-300 hover:-translate-y-0.5 hover:shadow-lg">
          <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-emerald-400/20 blur-2xl transition-all duration-500 group-hover:bg-emerald-400/30" />
          <div className="relative flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-emerald-800/80">Ingresos</p>
              <p className="mt-1 text-3xl font-black tabular-nums tracking-tight text-emerald-950">
                ${formatCop(ingresos)}
              </p>
              <p className="mt-2 text-xs text-emerald-800/90">
                {tickets} ticket{tickets === 1 ? "" : "s"} · ventas POS del mes
              </p>
            </div>
            <span className="text-3xl opacity-90 transition-transform duration-300 group-hover:scale-110" aria-hidden>
              💹
            </span>
          </div>
        </article>

        <article className="group relative overflow-hidden rounded-2xl border border-rose-200/80 bg-gradient-to-br from-rose-50 via-white to-orange-50/60 p-5 shadow-md ring-1 ring-rose-100/80 transition-transform duration-300 hover:-translate-y-0.5 hover:shadow-lg">
          <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-rose-400/20 blur-2xl transition-all duration-500 group-hover:bg-rose-400/30" />
          <div className="relative flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-rose-900/75">Gastos del mes</p>
              <p className="mt-1 text-3xl font-black tabular-nums tracking-tight text-rose-950">
                ${formatCop(gastosTot)}
              </p>
              <p className="mt-2 text-xs text-rose-800/90">
                Categorías: ${formatCop(gastosCategorias)}
                {gastosRegistroMes > 0 ? (
                  <>
                    {" "}
                    · Registro compras/gastos: ${formatCop(gastosRegistroMes)}
                  </>
                ) : null}
              </p>
            </div>
            <span className="text-3xl opacity-90 transition-transform duration-300 group-hover:scale-110" aria-hidden>
              📉
            </span>
          </div>
        </article>

        <article
          className={`group relative overflow-hidden rounded-2xl border p-5 shadow-md ring-1 transition-transform duration-300 hover:-translate-y-0.5 hover:shadow-lg ${
            resultado >= 0
              ? "border-sky-200/90 bg-gradient-to-br from-sky-50 via-white to-indigo-50/70 ring-sky-100/80"
              : "border-amber-300/90 bg-gradient-to-br from-amber-50 via-white to-red-50/50 ring-amber-200/80"
          }`}
        >
          <div
            className={`absolute -right-6 -top-6 h-24 w-24 rounded-full blur-2xl transition-all duration-500 ${
              resultado >= 0 ? "bg-sky-400/25 group-hover:bg-sky-400/35" : "bg-amber-400/25 group-hover:bg-amber-400/35"
            }`}
          />
          <div className="relative flex items-start justify-between gap-2">
            <div>
              <p
                className={`text-xs font-bold uppercase tracking-widest ${
                  resultado >= 0 ? "text-sky-900/75" : "text-amber-900/80"
                }`}
              >
                Resultado del mes
              </p>
              <p
                className={`mt-1 text-3xl font-black tabular-nums tracking-tight ${
                  resultado >= 0 ? "text-sky-950" : "text-amber-950"
                }`}
              >
                ${formatCop(resultado)}
              </p>
              {margenPct != null ? (
                <p className="mt-2 text-xs font-medium text-gray-700">
                  Margen sobre ingresos:{" "}
                  <span className={resultado >= 0 ? "text-emerald-700" : "text-red-700"}>{margenPct}%</span>
                </p>
              ) : (
                <p className="mt-2 text-xs text-gray-600">Sin ingresos en el mes: cargá gastos para planificar.</p>
              )}
            </div>
            <span className="text-3xl opacity-90 transition-transform duration-300 group-hover:scale-110" aria-hidden>
              {resultado >= 0 ? "🚀" : "⚠️"}
            </span>
          </div>
        </article>
      </div>

      {/* Barras comparativas */}
      {ingresos > 0 || gastosTot > 0 ? (
        <div className="relative rounded-2xl border border-gray-200/90 bg-white/95 p-6 shadow-sm backdrop-blur-sm">
          <h3 className="mb-5 flex items-center gap-2 text-sm font-bold text-gray-900">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-lg text-white shadow-inner">
              ⚖️
            </span>
            Gastos vs ingresos
          </h3>
          <div className="space-y-4">
            <div>
              <div className="mb-1 flex justify-between text-xs font-semibold text-emerald-900">
                <span>Ingresos del mes</span>
                <span className="tabular-nums">${formatCop(ingresos)}</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-emerald-100/90 ring-1 ring-emerald-200/60">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-700 ease-out"
                  style={{ width: `${ingresos > 0 ? 100 : 0}%` }}
                />
              </div>
            </div>
            <div>
              <div className="mb-1 flex justify-between text-xs font-semibold text-rose-900">
                <span>Gastos del mes</span>
                <span className="tabular-nums">
                  ${formatCop(gastosTot)}
                  {ingresos > 0 ? (
                    <span className="ml-1 font-normal text-gray-500">({ratioGasto}% de ingresos)</span>
                  ) : null}
                </span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-rose-100/90 ring-1 ring-rose-200/60">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-rose-500 to-orange-500 transition-all duration-700 ease-out"
                  style={{
                    width: `${ingresos > 0 ? Math.min(100, (gastosTot / ingresos) * 100) : gastosTot > 0 ? 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Formulario gastos */}
      <section className="relative rounded-2xl border border-gray-200/90 bg-gradient-to-b from-white to-gray-50/90 p-6 shadow-md">
        <h3 className="mb-1 flex items-center gap-2 text-lg font-bold text-gray-900">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary-600 text-white shadow-md">
            ✏️
          </span>
          Gastos del mes
        </h3>
        <p className="mb-6 text-sm text-gray-600">
          Completá montos en pesos colombianos. Se guardan automáticamente en este equipo por punto de venta y mes. Las{" "}
          <strong className="font-semibold text-gray-800">compras y gastos con fecha</strong> que registres en{" "}
          <strong className="font-semibold text-gray-800">Compras y gastos</strong> se suman aparte al total de gastos de
          arriba.
        </p>
        {onIrAComprasGastos ? (
          <div className="mb-6">
            <button
              type="button"
              onClick={onIrAComprasGastos}
              className="rounded-xl border-2 border-primary-500 bg-primary-50 px-4 py-2 text-sm font-semibold text-primary-900 hover:bg-primary-100"
            >
              Ir al registro de compras y gastos
            </button>
          </div>
        ) : null}
        <div className="grid gap-5 sm:grid-cols-2">
          {camposGasto.map((c) => (
            <label
              key={c.key}
              className="group block rounded-xl border border-gray-200/90 bg-white p-4 shadow-sm transition-all duration-200 hover:border-primary-200 hover:shadow-md"
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                <span className="text-lg transition-transform duration-200 group-hover:scale-110" aria-hidden>
                  {c.icon}
                </span>
                {c.label}
              </span>
              <span className="mt-0.5 block text-xs text-gray-500">{c.hint}</span>
              <div className="relative mt-3">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-gray-400">
                  $
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={gastos[c.key] === 0 ? "" : formatCop(gastos[c.key])}
                  onChange={(e) => setCampo(c.key, e.target.value)}
                  placeholder="0"
                  className="w-full rounded-xl border-2 border-gray-200 py-3 pl-7 pr-3 text-base font-semibold tabular-nums text-gray-900 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
                  autoComplete="off"
                />
              </div>
            </label>
          ))}
        </div>
      </section>

      <footer className="relative rounded-xl border border-dashed border-gray-300 bg-gray-50/80 px-4 py-3 text-center text-xs text-gray-600">
        Herramienta de gestión interna: los <strong className="font-semibold text-gray-800">ingresos</strong> se calculan con
        tickets del POS (local + nube). Los <strong className="font-semibold text-gray-800">gastos</strong> son estimaciones
        cargadas por el franquiciado. <strong className="font-semibold text-gray-800">No reemplaza</strong> el trabajo de un
        contador ni reportes fiscales oficiales.
      </footer>
    </div>
  );
}
