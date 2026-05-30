"use client";

import { useCallback, useEffect, useState } from "react";
import {
  wmsAnunciosCampanaActiva,
  type PosAnuncioCampanaCliente,
} from "@/lib/wms-anuncios-client";

type Props = {
  className?: string;
};

/**
 * Banner superior de caja con la misma campaña publicitaria que se carga
 * para los anuncios de cajeros. Formato esperado: 970 x 250.
 */
export default function PosAnuncioCajaBanner({ className = "" }: Props) {
  const [campana, setCampana] = useState<PosAnuncioCampanaCliente | null>(null);

  const cargarCampana = useCallback(async () => {
    const r = await wmsAnunciosCampanaActiva();
    setCampana(r.ok ? r.campana : null);
  }, []);

  useEffect(() => {
    void cargarCampana();
    const id = window.setInterval(() => void cargarCampana(), 60_000);
    return () => window.clearInterval(id);
  }, [cargarCampana]);

  if (!campana?.imageUrl?.trim()) return null;

  return (
    <div
      className={`overflow-hidden rounded-xl border border-[#FFE9B8]/30 bg-black/25 shadow-inner ${className}`}
      aria-label={campana.titulo || "Anuncio para cajeros"}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={campana.imageUrl}
        alt={campana.titulo || "Anuncio para cajeros"}
        className="aspect-[970/250] w-full bg-black/20 object-cover"
        loading="eager"
      />
    </div>
  );
}
