"use client";

import { useCallback, useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
import { contarFeEmitirPendientes } from "@/lib/pos-fe-retry-queue";
import { wmsPosDianConfigGet } from "@/lib/wms-pos-dian-client";

export type PosDianCajaEstado = {
  cargando: boolean;
  habilitado: boolean;
  emisorNit: string;
  error: string | null;
  /** Según contrato WMS: habilitado + NIT emisor con al menos 8 dígitos. */
  puedeEmitirFe: boolean;
  fePendientes: number;
  recargarDian: () => Promise<void>;
  refrescarFePendientes: () => void;
};

const DEFER_MS = 12_000;

export function usePosDianCajaEstado(uid: string | undefined, activo = true): PosDianCajaEstado {
  const [cargando, setCargando] = useState(true);
  const [habilitado, setHabilitado] = useState(false);
  const [emisorNit, setEmisorNit] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fePendientes, setFePendientes] = useState(0);

  const refrescarFePendientes = useCallback(() => {
    setFePendientes(contarFeEmitirPendientes());
  }, []);

  const recargarDian = useCallback(async () => {
    if (!uid?.trim() || !activo) {
      setCargando(false);
      return;
    }
    setCargando(true);
    setError(null);
    try {
      const token = await auth?.currentUser?.getIdToken();
      if (!token) {
        setError("Sin sesión para consultar DIAN.");
        return;
      }
      const r = await wmsPosDianConfigGet(token);
      if (!r.ok) {
        setError(r.error);
        setHabilitado(false);
        setEmisorNit("");
        return;
      }
      setHabilitado(r.habilitado);
      setEmisorNit(r.emisorNit.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar la configuración DIAN.");
    } finally {
      setCargando(false);
      refrescarFePendientes();
    }
  }, [uid, activo, refrescarFePendientes]);

  useEffect(() => {
    if (!uid?.trim() || !activo) {
      setCargando(false);
      return;
    }
    const t = window.setTimeout(() => void recargarDian(), DEFER_MS);
    return () => window.clearTimeout(t);
  }, [uid, activo, recargarDian]);

  useEffect(() => {
    refrescarFePendientes();
    const onVis = () => {
      if (document.visibilityState === "visible") refrescarFePendientes();
    };
    document.addEventListener("visibilitychange", onVis);
    const iv = window.setInterval(refrescarFePendientes, 60_000);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(iv);
    };
  }, [refrescarFePendientes]);

  const nitDigitos = emisorNit.replace(/\D/g, "");
  const puedeEmitirFe = habilitado && nitDigitos.length >= 8;

  return {
    cargando,
    habilitado,
    emisorNit,
    error,
    puedeEmitirFe,
    fePendientes,
    recargarDian,
    refrescarFePendientes,
  };
}
