"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fechaColombia } from "@/lib/fecha-colombia";
import { formatPesosCop } from "@/lib/pesos-cop-input";
import {
  fetchMetasRetosActivas,
  type MetaRetoActiva,
} from "@/lib/wms-metas-retos-activas";

export interface MetasBonificacionesModuleProps {
  puntoVenta: string | null;
}

const POLL_MS = 60_000;

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

export default function MetasBonificacionesModule({ puntoVenta }: MetasBonificacionesModuleProps) {
  const pv = (puntoVenta ?? "").replace(/\u00a0/g, " ").trim();
  const pvMostrar = pv || "—";
  const hoyTexto = fechaColombia(new Date(), { weekday: "long", day: "numeric", month: "long" });

  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retos, setRetos] = useState<MetaRetoActiva[]>([]);
  const [fechaRef, setFechaRef] = useState<string | null>(null);
  const [actualizadoEn, setActualizadoEn] = useState<Date | null>(null);

  const abortRef = useRef<AbortController | null>(null);

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
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError("Error inesperado al cargar metas.");
      setRetos([]);
    } finally {
      setCargando(false);
    }
  }, [pv]);

  useEffect(() => {
    void cargar();
    return () => abortRef.current?.abort();
  }, [cargar]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void cargar();
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [cargar]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") void cargar();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [cargar]);

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
              Última actualización: {actualizadoEn.toLocaleTimeString("es-CO", { timeStyle: "short" })}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void cargar()}
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
          {retos.map((reto) => (
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
                  <dt className="text-gray-500">Vigencia</dt>
                  <dd className="font-mono text-gray-800">{formatearRangoYmd(reto.fechaInicio, reto.fechaFin)}</dd>
                </div>
              </dl>

              {reto.notas ? (
                <p className="relative mt-3 rounded-lg border border-amber-100 bg-white/70 px-3 py-2 text-xs text-gray-700">
                  {reto.notas}
                </p>
              ) : null}

              <p className="relative mt-3 text-[11px] leading-relaxed text-gray-500">
                El avance por ventas en el periodo lo calculará una futura integración (WMS o agregados en el POS). Aquí
                ves la meta y el bono configurados.
              </p>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="rounded-xl border border-gray-200 bg-gray-50/80 px-4 py-3 text-center text-xs text-gray-600">
        Datos desde el WMS:{" "}
        <code className="rounded bg-white px-1 py-0.5 text-[10px] text-gray-800">
          GET /api/pos/metas-retos/activas
        </code>
        . Base del WMS:{" "}
        <code className="rounded bg-white px-1 py-0.5 text-[10px]">NEXT_PUBLIC_WMS_URL</code> (o{" "}
        <code className="rounded bg-white px-1 py-0.5 text-[10px]">NEXT_PUBLIC_WMS_API_URL</code>).
      </div>
    </div>
  );
}
