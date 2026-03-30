"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fechaColombia } from "@/lib/fecha-colombia";
import { auth } from "@/lib/firebase";
import {
  avanceUnidadesReto,
  etiquetaRangoPeriodo,
  ymdReferenciaMetas,
} from "@/lib/metas-retos-avance-ventas";
import { formatPesosCop } from "@/lib/pesos-cop-input";
import { listarVentasPosCloud } from "@/lib/pos-ventas-cloud-client";
import {
  listarVentasPuntoVentaEnEsteEquipo,
  mergeVentasReporteNubeLocal,
  type VentaGuardadaLocal,
} from "@/lib/pos-ventas-local-storage";
import {
  fetchMetasRetosActivas,
  type MetaRetoActiva,
} from "@/lib/wms-metas-retos-activas";

export interface MetasBonificacionesModuleProps {
  puntoVenta: string | null;
  /** Para unir ventas locales de este equipo y, si hay token, las de `posVentasCloud` del mismo PV. */
  uid: string | null;
}

const POLL_METAS_MS = 60_000;
const POLL_VENTAS_MS = 30_000;

function etiquetaCadencia(c: MetaRetoActiva["cadencia"]): string {
  if (c === "semanal") return "Semanal";
  if (c === "mensual") return "Mensual";
  return "Diario";
}

function etiquetaAlcance(a: MetaRetoActiva["alcancePuntoVenta"]): string {
  return a === "seleccion" ? "Puntos seleccionados" : "Todos los puntos de venta";
}

function formatearRangoYmd(inicio: string, fin: string): string {
  if (!inicio && !fin) return "—";
  if (inicio === fin) return inicio;
  if (inicio && fin) return `${inicio} → ${fin}`;
  return inicio || fin || "—";
}

export default function MetasBonificacionesModule({ puntoVenta, uid }: MetasBonificacionesModuleProps) {
  const pv = (puntoVenta ?? "").replace(/\u00a0/g, " ").trim();
  const u = (uid ?? "").trim();
  const pvMostrar = pv || "—";
  const hoyTexto = fechaColombia(new Date(), { weekday: "long", day: "numeric", month: "long" });

  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retos, setRetos] = useState<MetaRetoActiva[]>([]);
  const [fechaRef, setFechaRef] = useState<string | null>(null);
  const [actualizadoEn, setActualizadoEn] = useState<Date | null>(null);

  const [ventasNube, setVentasNube] = useState<VentaGuardadaLocal[] | null>(null);
  const [ventasNubeAviso, setVentasNubeAviso] = useState<string | null>(null);
  const [ventasTick, setVentasTick] = useState(0);

  const abortRef = useRef<AbortController | null>(null);

  const refrescarVentas = useCallback(() => setVentasTick((t) => t + 1), []);

  const cargar = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setCargando(true);
    setError(null);
    try {
      const r = await fetchMetasRetosActivas(pv || null, ac.signal);
      if (!r.ok) {
        setError(r.message);
        setRetos([]);
        setFechaRef(null);
        return;
      }
      setRetos(r.data.retos);
      setFechaRef(r.data.fechaReferencia ?? null);
      setActualizadoEn(new Date());
      refrescarVentas();
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError("Error inesperado al cargar metas.");
      setRetos([]);
    } finally {
      setCargando(false);
    }
  }, [pv, refrescarVentas]);

  useEffect(() => {
    void cargar();
    return () => abortRef.current?.abort();
  }, [cargar]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void cargar();
    }, POLL_METAS_MS);
    return () => window.clearInterval(id);
  }, [cargar]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") void cargar();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [cargar]);

  useEffect(() => {
    if (!u || !pv) {
      setVentasNube(null);
      setVentasNubeAviso(null);
      return;
    }
    let cancelled = false;
    setVentasNubeAviso(null);
    (async () => {
      try {
        const token = await auth?.currentUser?.getIdToken();
        if (!token || cancelled) return;
        const rows = await listarVentasPosCloud(token);
        if (!cancelled) {
          setVentasNube(rows);
          setVentasNubeAviso(null);
        }
      } catch (e) {
        if (!cancelled) {
          setVentasNube([]);
          setVentasNubeAviso(
            e instanceof Error
              ? e.message
              : "No se pudieron cargar ventas desde la nube; el avance usa solo tickets de este equipo."
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [u, pv, ventasTick]);

  useEffect(() => {
    if (!u || !pv) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") refrescarVentas();
    }, POLL_VENTAS_MS);
    return () => window.clearInterval(id);
  }, [u, pv, refrescarVentas]);

  useEffect(() => {
    if (!u || !pv) return;
    const onVis = () => {
      if (document.visibilityState === "visible") refrescarVentas();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [u, pv, refrescarVentas]);

  const ventas = useMemo(() => {
    void ventasTick;
    if (!pv) return [];
    const local = listarVentasPuntoVentaEnEsteEquipo(pv);
    if (ventasNube === null) return local;
    return mergeVentasReporteNubeLocal(local, ventasNube);
  }, [pv, ventasTick, ventasNube]);

  const ymdRef = useMemo(() => ymdReferenciaMetas(fechaRef), [fechaRef]);

  const onClickActualizar = () => {
    void cargar();
    refrescarVentas();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 md:text-2xl">Metas y bonificaciones</h2>
          <p className="mt-1 text-sm text-gray-600">
            Punto de venta: <span className="font-medium text-gray-800">{pvMostrar}</span>
            {pv ? null : (
              <span className="ml-1 text-amber-800">
                (sin PV en el perfil: solo se listan retos de alcance global)
              </span>
            )}
          </p>
          <p className="mt-0.5 text-xs capitalize text-gray-500">{hoyTexto}</p>
          {fechaRef ? (
            <p className="mt-1 text-xs text-gray-500">
              Fecha de referencia WMS (Colombia):{" "}
              <span className="font-mono font-medium text-gray-700">{fechaRef}</span>
            </p>
          ) : null}
          {actualizadoEn && !cargando ? (
            <p className="mt-0.5 text-[11px] text-gray-400">
              Última actualización metas: {actualizadoEn.toLocaleTimeString("es-CO", { timeStyle: "short" })}
            </p>
          ) : null}
          {ventasNubeAviso ? (
            <p className="mt-2 max-w-xl rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-2 text-xs text-amber-950">
              {ventasNubeAviso}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onClickActualizar}
            disabled={cargando}
            className="rounded-lg border border-primary-300 bg-white px-4 py-2 text-sm font-semibold text-primary-800 shadow-sm hover:bg-primary-50 disabled:opacity-50"
          >
            {cargando ? "Actualizando…" : "Actualizar"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-semibold text-amber-900">No se pudieron cargar los retos</p>
          <p className="mt-1 text-amber-900/95">{error}</p>
        </div>
      ) : null}

      {cargando && retos.length === 0 && !error ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="animate-pulse rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
            >
              <div className="h-4 w-2/3 rounded bg-gray-200" />
              <div className="mt-4 h-3 w-full rounded bg-gray-100" />
              <div className="mt-2 h-3 w-4/5 rounded bg-gray-100" />
            </div>
          ))}
        </div>
      ) : null}

      {!cargando && !error && retos.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50/80 px-6 py-10 text-center">
          <p className="text-sm font-medium text-gray-800">No hay retos activos para mostrar</p>
          <p className="mt-2 text-sm text-gray-600">
            En el WMS deben estar en estado <strong className="font-semibold">activo</strong> y la fecha de hoy (Colombia)
            debe estar entre el inicio y el fin del reto.
            {pv
              ? " Si tu PV no aparece en un reto de «selección», no se listará aquí."
              : " Asigná un punto de venta en tu perfil para ver retos dirigidos a tu franquicia."}
          </p>
        </div>
      ) : null}

      {retos.length > 0 ? (
        <ul className="grid list-none gap-5 p-0 sm:grid-cols-2 xl:grid-cols-3">
          {retos.map((reto) => {
            const { avance, rango } = avanceUnidadesReto(reto, ventas, ymdRef);
            const meta = Math.max(0, Number(reto.metaUnidades) || 0);
            const pct = meta > 0 ? Math.min(100, Math.round((avance / meta) * 100)) : 0;
            const periodoTxt = rango ? etiquetaRangoPeriodo(rango.desde, rango.hasta) : "—";

            return (
              <li
                key={reto.id}
                className="relative overflow-hidden rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50/90 via-white to-orange-50/60 p-5 shadow-md ring-1 ring-amber-100"
              >
                <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-brand-yellow/20 blur-2xl" />
                <div className="relative flex gap-4">
                  <div className="shrink-0">
                    {reto.urlImagen ? (
                      // eslint-disable-next-line @next/next/no-img-element -- URL externa del WMS/catálogo
                      <img
                        src={reto.urlImagen}
                        alt=""
                        className="h-16 w-16 rounded-xl border border-amber-200/80 bg-white object-cover"
                        loading="lazy"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    ) : (
                      <div
                        className="flex h-16 w-16 items-center justify-center rounded-xl border border-amber-200/80 bg-white text-2xl text-amber-700/90"
                        aria-hidden
                      >
                        🎯
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-900/80">
                      {etiquetaCadencia(reto.cadencia)} · {etiquetaAlcance(reto.alcancePuntoVenta)}
                    </p>
                    <h3 className="mt-1 text-base font-bold leading-snug text-gray-900 md:text-lg">
                      {reto.descripcionProducto || "Producto"}
                    </h3>
                    {reto.skuBarcode ? (
                      <p className="mt-0.5 font-mono text-xs text-gray-500">SKU: {reto.skuBarcode}</p>
                    ) : null}
                  </div>
                </div>

                <div className="relative mt-4 border-t border-amber-100/80 pt-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-600">Avance en el periodo</span>
                    <span className="text-lg font-bold tabular-nums text-gray-900">{pct}%</span>
                  </div>
                  <div className="mb-1 flex justify-between text-xs font-medium text-gray-600">
                    <span>
                      <span className="tabular-nums text-emerald-800">{avance}</span> /{" "}
                      <span className="tabular-nums">{meta}</span> unidades
                    </span>
                    {avance >= meta && meta > 0 ? (
                      <span className="font-semibold text-emerald-700">Meta alcanzada</span>
                    ) : (
                      <span className="text-amber-800">Seguí sumando</span>
                    )}
                  </div>
                  <div className="relative h-3 overflow-hidden rounded-full bg-amber-100/90 ring-1 ring-amber-200/80">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-brand-yellow via-amber-400 to-primary-500 transition-all duration-500 ease-out"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="mt-2 text-[11px] text-gray-500">
                    Periodo contable ({etiquetaCadencia(reto.cadencia).toLowerCase()}):{" "}
                    <span className="font-mono text-gray-700">{periodoTxt}</span>
                  </p>
                </div>

                <dl className="relative mt-4 grid gap-2 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-amber-100/80 pt-3">
                    <dt className="text-gray-600">Meta (unidades)</dt>
                    <dd className="text-lg font-bold tabular-nums text-gray-900">{reto.metaUnidades}</dd>
                  </div>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <dt className="text-gray-600">Bono</dt>
                    <dd className="text-lg font-extrabold tabular-nums text-emerald-800">
                      ${formatPesosCop(reto.bonoCOP, false)} COP
                    </dd>
                  </div>
                  <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
                    <dt className="text-gray-500">Vigencia campaña</dt>
                    <dd className="font-mono text-gray-800">{formatearRangoYmd(reto.fechaInicio, reto.fechaFin)}</dd>
                  </div>
                </dl>

                {reto.notas ? (
                  <p className="relative mt-3 rounded-lg border border-amber-100 bg-white/70 px-3 py-2 text-xs text-gray-700">
                    {reto.notas}
                  </p>
                ) : null}

                <p className="relative mt-3 text-[11px] leading-relaxed text-gray-500">
                  El avance suma líneas de venta de este punto de venta con el mismo SKU que el reto (tickets en este equipo y,
                  si hay conexión, en la nube del POS). Las anuladas no cuentan.
                </p>
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className="rounded-xl border border-gray-200 bg-gray-50/80 px-4 py-3 text-center text-xs text-gray-600">
        Retos desde el WMS:{" "}
        <code className="rounded bg-white px-1 py-0.5 text-[10px] text-gray-800">
          GET /api/pos/metas-retos/activas
        </code>
        . Avance desde ventas POS (local + nube). Base WMS:{" "}
        <code className="rounded bg-white px-1 py-0.5 text-[10px]">NEXT_PUBLIC_WMS_URL</code>.
      </div>
    </div>
  );
}
