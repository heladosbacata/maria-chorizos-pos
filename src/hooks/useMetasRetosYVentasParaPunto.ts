"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { auth } from "@/lib/firebase";
import { ymdReferenciaMetas } from "@/lib/metas-retos-avance-ventas";
import { listarVentasPosCloud } from "@/lib/pos-ventas-cloud-client";
import type { VentaGuardadaLocal } from "@/lib/pos-ventas-local-storage";
import { EVENT_POS_VENTA_LOCAL_REGISTRADA } from "@/lib/pos-metas-ventas-event";
import { ventasParaMetasAvance } from "@/lib/pos-ventas-metas-sync";
import { puntoVentaCoincide } from "@/lib/punto-venta-clave";
import { fetchMetasRetosActivas, type MetaRetoActiva } from "@/lib/wms-metas-retos-activas";

const POLL_METAS_MS = 60_000;
const POLL_VENTAS_MS = 20_000;

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
  const loadGenRef = useRef(0);

  const refrescarVentas = useCallback(() => setVentasTick((t) => t + 1), []);

  const cargarVentasNube = useCallback(async () => {
    if (!u || !pv) {
      setVentasNube(null);
      return;
    }
    try {
      const token = await auth?.currentUser?.getIdToken();
      if (!token) return;
      const rows = await listarVentasPosCloud(token);
      setVentasNube(rows.filter((v) => puntoVentaCoincide(v.puntoVenta, pv)));
    } catch (e) {
      setVentasNube([]);
      if (process.env.NODE_ENV === "development") {
        console.warn("[Metas] Ventas nube no disponibles; avance con tickets locales.", e);
      }
    }
  }, [u, pv]);

  const cargar = useCallback(async () => {
    const gen = ++loadGenRef.current;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setCargando(true);
    setError(null);
    try {
      const r = await fetchMetasRetosActivas(pv || null, ac.signal);
      if (gen !== loadGenRef.current) return;
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
      if (gen !== loadGenRef.current) return;
      setError("Error inesperado al cargar metas.");
      setRetos([]);
    } finally {
      if (gen === loadGenRef.current) setCargando(false);
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
    void cargarVentasNube();
  }, [cargarVentasNube, ventasTick]);

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

  useEffect(() => {
    if (!pv) return;
    const onVenta = () => {
      refrescarVentas();
      void cargarVentasNube();
    };
    window.addEventListener(EVENT_POS_VENTA_LOCAL_REGISTRADA, onVenta);
    return () => window.removeEventListener(EVENT_POS_VENTA_LOCAL_REGISTRADA, onVenta);
  }, [pv, refrescarVentas, cargarVentasNube]);

  const ventas = useMemo(() => {
    void ventasTick;
    return ventasParaMetasAvance(pv, ventasNube);
  }, [pv, ventasTick, ventasNube]);

  const ymdRef = useMemo(() => ymdReferenciaMetas(fechaRef), [fechaRef]);

  const refrescar = useCallback(() => {
    void cargar();
    refrescarVentas();
    void cargarVentasNube();
  }, [cargar, refrescarVentas, cargarVentasNube]);

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
