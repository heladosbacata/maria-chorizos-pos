"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

const CONFETTI_COLORS = ["#FFC81C", "#C41E3A", "#22c55e", "#3b82f6", "#a855f7", "#f97316", "#ec4899"];

export interface CargueCelebracionExitoProps {
  /** Cantidad de productos registrados; null = oculto */
  cantidadProductos: number | null;
  onCerrar: () => void;
}

/**
 * Overlay de celebración tras un cargue de inventario exitoso (confeti CSS + mensaje).
 */
export default function CargueCelebracionExito({ cantidadProductos, onCerrar }: CargueCelebracionExitoProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (cantidadProductos == null || cantidadProductos <= 0) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [cantidadProductos]);

  const piezas = useMemo(() => {
    const n = 56;
    return Array.from({ length: n }, (_, i) => {
      const left = ((i * 17 + 7) % 100) + (i % 3) * 0.4;
      const delay = (i % 14) * 0.06;
      const duration = 2.4 + (i % 6) * 0.2;
      const drift = (i % 21 - 10) * 12;
      const rot = 180 + (i % 5) * 180;
      const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
      const w = 6 + (i % 4);
      const h = 5 + (i % 3);
      const rounded = i % 2 === 0;
      return { left, delay, duration, drift, rot, color, w, h, rounded, i };
    });
  }, []);

  if (!mounted || cantidadProductos == null || cantidadProductos <= 0) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cargue-celebracion-titulo"
      aria-describedby="cargue-celebracion-texto"
    >
      <button
        type="button"
        className="absolute inset-0 bg-gray-900/45 backdrop-blur-[2px]"
        aria-label="Cerrar celebración"
        onClick={onCerrar}
      />
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {piezas.map((p) => (
          <span
            key={p.i}
            className="cargue-celebracion-piece absolute opacity-95 shadow-sm"
            style={{
              left: `${p.left}%`,
              top: "-14px",
              width: p.w,
              height: p.h,
              backgroundColor: p.color,
              borderRadius: p.rounded ? "9999px" : "2px",
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
              ["--cargue-drift" as string]: `${p.drift}px`,
              ["--cargue-rot" as string]: `${p.rot}deg`,
            }}
          />
        ))}
      </div>
      <div className="relative z-10 flex w-full max-w-md flex-col items-center rounded-2xl border-2 border-amber-200/80 bg-gradient-to-b from-amber-50 via-white to-white px-6 py-8 shadow-2xl">
        <span className="text-5xl" aria-hidden>
          🎉
        </span>
        <h2 id="cargue-celebracion-titulo" className="mt-3 text-center text-2xl font-bold text-gray-900">
          ¡Cargue listo!
        </h2>
        <p id="cargue-celebracion-texto" className="mt-4 text-center text-lg leading-relaxed text-gray-800">
          Ya tenés más productos para continuar vendiendo y cumpliendo tus metas.
        </p>
        <p className="mt-3 text-center text-sm font-medium text-emerald-800">
          {cantidadProductos === 1
            ? "1 producto quedó en tu inventario."
            : `${cantidadProductos} productos quedaron en tu inventario.`}
        </p>
        <p className="mt-1 text-center text-xs text-gray-500">También podés verlo en Inventarios → Historial.</p>
        <button
          type="button"
          onClick={onCerrar}
          className="pointer-events-auto mt-8 w-full rounded-xl bg-brand-yellow py-3.5 text-base font-bold text-gray-900 shadow-md transition-opacity hover:opacity-90"
        >
          Continuar
        </button>
      </div>
    </div>,
    document.body
  );
}
