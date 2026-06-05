"use client";

import { useCallback, useEffect, useRef } from "react";
import { domiciliosListar } from "@/lib/pos-domicilios-api";
import {
  emitirDomiciliosContadorNuevos,
  emitirDomiciliosPedidoNuevo,
  EVENT_DOMICILIOS_FORZAR_REFRESH,
} from "@/lib/pos-domicilios-nuevos-event";
import { reproducirTonoDomicilios, type VolumenSonidoDomicilios } from "@/lib/pos-domicilios-sonido";

type Props = {
  puntoVenta: string | null | undefined;
  /** Si false, no suena ni muestra overlay (ej. sin turno abierto). */
  activo?: boolean;
  /** En Domicilios el módulo maneja sonido y chat; aquí solo actualizamos contador. */
  moduloDomiciliosActivo?: boolean;
  /** Solo actualiza badge del menú; el anuncio grande lo maneja PosDomiciliosNuevoPedidoAlerta. */
  soloContador?: boolean;
};

function keySonidosDomicilios(puntoVenta: string): string {
  return `pos_mc_domicilios_sonido_v1:${puntoVenta.trim().toLowerCase() || "global"}`;
}

function keyVolumenDomicilios(puntoVenta: string): string {
  return `pos_mc_domicilios_volumen_v1:${puntoVenta.trim().toLowerCase() || "global"}`;
}

function leerSonidosActivos(puntoVenta: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = localStorage.getItem(keySonidosDomicilios(puntoVenta));
    return raw == null || raw !== "off";
  } catch {
    return true;
  }
}

function leerVolumen(puntoVenta: string): VolumenSonidoDomicilios {
  if (typeof window === "undefined") return "medio";
  try {
    const raw = localStorage.getItem(keyVolumenDomicilios(puntoVenta));
    return raw === "bajo" ? "bajo" : "medio";
  } catch {
    return "medio";
  }
}

/** Sondea pedidos web/QR aunque el cajero esté en Ventas u otro módulo. */
export default function PosDomiciliosNuevosWatcher({
  puntoVenta,
  activo = true,
  moduloDomiciliosActivo = false,
  soloContador = false,
}: Props) {
  const pv = (puntoVenta ?? "").trim();
  const pedidosNuevosPrevRef = useRef<string[]>([]);
  const primeraCargaRef = useRef(true);

  const revisar = useCallback(async () => {
    if (!pv || !activo) return;
    const res = await domiciliosListar(pv);
    const nuevos = res.data.filter((p) => p.estado === "NUEVO");
    const ids = nuevos.map((p) => p.id);
    emitirDomiciliosContadorNuevos({ cantidad: ids.length, ids });

    if (primeraCargaRef.current) {
      primeraCargaRef.current = false;
      pedidosNuevosPrevRef.current = ids;
      return;
    }

    const prev = pedidosNuevosPrevRef.current;
    const llegados = ids.filter((id) => !prev.includes(id));
    pedidosNuevosPrevRef.current = ids;

    if (moduloDomiciliosActivo || soloContador || llegados.length === 0) return;

    const pedidosRecien = nuevos.filter((p) => llegados.includes(p.id));
    const masReciente = [...pedidosRecien].sort(
      (a, b) => new Date(b.creadoEnIso).getTime() - new Date(a.creadoEnIso).getTime()
    )[0];
    if (!masReciente) return;

    if (leerSonidosActivos(pv)) {
      reproducirTonoDomicilios("crear", leerVolumen(pv));
    }
    emitirDomiciliosPedidoNuevo({ pedido: masReciente, cantidadNuevos: ids.length });
  }, [pv, activo, moduloDomiciliosActivo, soloContador]);

  useEffect(() => {
    primeraCargaRef.current = true;
    pedidosNuevosPrevRef.current = [];
  }, [pv]);

  useEffect(() => {
    if (!pv || !activo) return;
    let cancel = false;
    const tick = () => {
      if (cancel) return;
      void revisar().catch(() => undefined);
    };
    tick();
    const t = window.setInterval(tick, 12_000);
    const onRefresh = () => tick();
    window.addEventListener(EVENT_DOMICILIOS_FORZAR_REFRESH, onRefresh);
    return () => {
      cancel = true;
      window.clearInterval(t);
      window.removeEventListener(EVENT_DOMICILIOS_FORZAR_REFRESH, onRefresh);
    };
  }, [pv, activo, revisar]);

  return null;
}
