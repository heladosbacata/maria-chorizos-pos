"use client";

import { useEffect, useMemo, useState } from "react";
import { auth } from "@/lib/firebase";
import { ymdColombia, ymdColombiaMenosDias } from "@/lib/fecha-colombia";
import { listarVentasPosCloud } from "@/lib/pos-ventas-cloud-client";
import {
  esVentaVigente,
  listarVentasPuntoVentaEnEsteEquipo,
  mergeVentasReporteNubeLocal,
  type VentaGuardadaLocal,
} from "@/lib/pos-ventas-local-storage";
import { leerGastosPyg } from "@/lib/pyg-franquicia-storage";
import {
  guardarPersonalLocal,
  guardarRentaLocal,
  leerPersonalGuardado,
  leerRentaGuardada,
} from "@/lib/pyg-simplificado";
import { descargarPygSimplificadoPdf } from "@/lib/pyg-simplificado-pdf";
import PygTablaSencilla from "@/components/PygTablaSencilla";

export interface PygFranquiciaPanelProps {
  puntoVenta: string | null;
  uid: string | null;
  onVolver?: () => void;
  /** @deprecated El PyG simplificado ya no enlaza a compras/gastos */
  onIrAComprasGastos?: () => void;
}

function inicioMesIso(ymd = ymdColombia()): string {
  return `${ymd.slice(0, 7)}-01`;
}

function inicioMesAnteriorIso(): string {
  const d = new Date(`${ymdColombia()}T12:00:00-05:00`);
  return new Date(d.getFullYear(), d.getMonth() - 1, 1).toISOString().slice(0, 10);
}

function finMesAnteriorIso(): string {
  const d = new Date(`${ymdColombia()}T12:00:00-05:00`);
  return new Date(d.getFullYear(), d.getMonth(), 0).toISOString().slice(0, 10);
}

function ingresosEnPeriodo(ventas: VentaGuardadaLocal[], desde: string, hasta: string): number {
  let bruto = 0;
  for (const v of ventas) {
    if (!esVentaVigente(v)) continue;
    const fy = (v.fechaYmd ?? "").trim();
    if (!fy || fy < desde || fy > hasta) continue;
    bruto += Number(v.total) || 0;
  }
  return Math.round(bruto);
}

export default function PygFranquiciaPanel({
  puntoVenta,
  uid,
  onVolver,
}: PygFranquiciaPanelProps) {
  const pv = (puntoVenta ?? "").replace(/\u00a0/g, " ").trim();
  const u = (uid ?? "").trim();
  const hoy = ymdColombia();

  const [desde, setDesde] = useState(inicioMesIso);
  const [hasta, setHasta] = useState(hoy);
  const [ventasNube, setVentasNube] = useState<VentaGuardadaLocal[] | null>(null);
  const [ventasTick, setVentasTick] = useState(0);
  const [nubeAviso, setNubeAviso] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  useEffect(() => {
    if (!pv || !u) return;
    const renta = leerRentaGuardada(u, pv);
    const personal = leerPersonalGuardado(u, pv);
    if (renta > 0 || personal !== null) return;

    const legacy = leerGastosPyg(pv, desde.slice(0, 7));
    if (legacy.arriendo > 0) guardarRentaLocal(u, pv, legacy.arriendo);
    if (legacy.personal > 0) guardarPersonalLocal(u, pv, legacy.personal);
  }, [pv, u, desde]);

  useEffect(() => {
    if (!u || !pv) {
      setVentasNube(null);
      return;
    }
    let cancel = false;
    (async () => {
      try {
        const token = await auth?.currentUser?.getIdToken();
        if (!token || cancel) return;
        const rows = await listarVentasPosCloud(token);
        if (!cancel) {
          setVentasNube(rows);
          setNubeAviso(null);
        }
      } catch (e) {
        if (!cancel) {
          setVentasNube([]);
          setNubeAviso(
            e instanceof Error ? e.message : "Solo se muestran ventas registradas en este equipo."
          );
        }
      }
    })();
    return () => {
      cancel = true;
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

  const ingresos = useMemo(
    () => ingresosEnPeriodo(ventas, desde, hasta),
    [ventas, desde, hasta]
  );

  async function descargarPdf() {
    if (!u || !pv) return;
    setPdfLoading(true);
    try {
      await descargarPygSimplificadoPdf({
        puntoNombre: pv,
        ingresos,
        desde,
        hasta,
        uid: u,
        puntoVenta: pv,
      });
    } catch {
      window.alert("No se pudo generar el PDF. Intenta de nuevo.");
    } finally {
      setPdfLoading(false);
    }
  }

  if (!pv || !u) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50/90 p-8 text-center text-amber-950">
        <p className="text-lg font-semibold">Sin punto de venta</p>
        <p className="mt-2 text-sm">Asigná un punto de venta en tu perfil para ver tu PyG.</p>
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
    <div className="relative mx-auto max-w-5xl space-y-6 pb-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
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
          <h2 className="text-2xl font-extrabold tracking-tight text-gray-900 md:text-3xl">
            PyG del punto de venta
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            Ventas reales del POS · cálculo sencillo para el día a día
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pdfLoading}
            onClick={() => void descargarPdf()}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-200 px-4 py-2 text-sm font-bold text-gray-900 shadow-sm hover:bg-amber-300 disabled:opacity-60"
          >
            {pdfLoading ? "Generando PDF…" : "Descargar PDF"}
          </button>
          <button
            type="button"
            onClick={() => setVentasTick((t) => t + 1)}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Actualizar ventas
          </button>
        </div>
      </header>

      {nubeAviso ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50/95 px-4 py-2 text-xs text-amber-950">
          {nubeAviso}
        </p>
      ) : null}

      <div className="flex flex-wrap items-end gap-4 border-b border-gray-200 pb-5">
        <label className="grid gap-1 text-sm">
          <span className="font-semibold text-gray-700">Desde</span>
          <input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-semibold text-gray-700">Hasta</span>
          <input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        <div className="flex flex-wrap gap-2 pb-1">
          {[
            {
              label: "Mes actual",
              fn: () => {
                setDesde(inicioMesIso());
                setHasta(hoy);
              },
            },
            {
              label: "Mes anterior",
              fn: () => {
                setDesde(inicioMesAnteriorIso());
                setHasta(finMesAnteriorIso());
              },
            },
            {
              label: "7 días",
              fn: () => {
                setDesde(ymdColombiaMenosDias(hoy, 7));
                setHasta(hoy);
              },
            },
          ].map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={chip.fn}
              className="rounded-full border border-gray-300 bg-gray-50 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      <PygTablaSencilla
        ingresos={ingresos}
        desde={desde}
        hasta={hasta}
        uid={u}
        puntoVenta={pv}
      />

      <footer className="rounded-xl border border-dashed border-gray-300 bg-gray-50/80 px-4 py-3 text-center text-xs text-gray-600">
        Herramienta de gestión interna: los <strong className="font-semibold text-gray-800">ingresos</strong>{" "}
        se calculan con tickets del POS (local + nube). Los <strong className="font-semibold text-gray-800">gastos</strong>{" "}
        son estimaciones cargadas por el franquiciado. <strong className="font-semibold text-gray-800">No reemplaza</strong>{" "}
        el trabajo de un contador ni reportes fiscales oficiales.
      </footer>
    </div>
  );
}
