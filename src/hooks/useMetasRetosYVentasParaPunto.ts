"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { auth } from "@/lib/firebase";
import { ymdReferenciaMetas } from "@/lib/metas-retos-avance-ventas";
import { listarVentasPosCloud } from "@/lib/pos-ventas-cloud-client";
import {
  listarVentasPuntoVentaEnEsteEquipo,
  mergeVentasReporteNubeLocal,
  type VentaGuardadaLocal,
} from "@/lib/pos-ventas-local-storage";
import { fetchMetasRetosActivas, type MetaRetoActiva } from "@/lib/wms-metas-retos-activas";

const POLL_METAS_MS = 60_000;
const POLL_VENTAS_MS = 30_000;

export type UseMetasRetosYVentasParaPuntoResult = {
  pvNorm: string;
  retos: MetaRetoActiva[];
  ventas: VentaGuardadaLocal[];
  ymdRef: string;
  fechaRefApi: string | null;
  cargando: boolean;
  error: string | null;
  actualizadoEn: Date | null;
  refrescar: () => void;
};

/**
 * Retos activos del WMS + ventas (local + nube) para calcular avance en metas del punto de venta.
 * Compartido entre el módulo «Metas y bonificaciones» y el resumen del banner de caja.
 */
export function useMetasRetosYVentasParaPunto(
  puntoVenta: string | null | undefined,
  uid: string | null | undefined
): UseMetasRetosYVentasParaPuntoResult {
  const pv = (puntoVenta ?? "").replace(/\u00a0/g, " ").trim();
  const u = (uid ?? "").trim();

  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retos, setRetos] = useState<MetaRetoActiva[]>([]);
  const [fechaRef, setFechaRef] = useState<string | null>(null);
  const [actualizadoEn, setActualizadoEn] = useState<Date | null>(null);

  const [ventasNube, setVentasNube] = useState<VentaGuardadaLocal[] | null>(null);
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
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const token = await auth?.currentUser?.getIdToken();
        if (!token || cancelled) return;
        const rows = await listarVentasPosCloud(token);
        if (!cancelled) {
          setVentasNube(rows);
        }
      } catch (e) {
        if (!cancelled) {
          setVentasNube([]);
          if (process.env.NODE_ENV === "development") {
            console.warn("[Metas] Ventas nube no disponibles; avance con tickets locales.", e);
          }
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

  const refrescar = useCallback(() => {
    void cargar();
    refrescarVentas();
  }, [cargar, refrescarVentas]);

  return {
    pvNorm: pv,
    retos,
    ventas,
    ymdRef,
    fechaRefApi: fechaRef,
    cargando,
    error,
    actualizadoEn,
    refrescar,
  };
}
