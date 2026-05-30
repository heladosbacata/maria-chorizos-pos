"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  millasGanadasPorMontoCop,
  millasSaldoProyectadoTrasCompra,
} from "@/lib/club-millas-calculo-venta";
import type { PlanMillasClienteResumen } from "@/lib/plan-millas-validar-resumen";

export interface ClienteFrecuenteAvisoModalProps {
  open: boolean;
  onCerrar: () => void;
  /** Datos devueltos por el WMS al validar documento (nombre, millas, documento). */
  planMillasResumen?: PlanMillasClienteResumen | null;
  /** Total de la venta en COP (entero) para proyectar millas tras esta compra. */
  totalCompraCop?: number;
}

function formatPuntos(n: number): string {
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(n);
}

/**
 * Tras validar documento en el WMS: solo resumen del cliente y puntos/millas acumulados.
 */
export default function ClienteFrecuenteAvisoModal({
  open,
  onCerrar,
  planMillasResumen,
  totalCompraCop = 0,
}: ClienteFrecuenteAvisoModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!mounted || !open) return null;

  const nombre = planMillasResumen?.nombre?.trim();
  const documento = planMillasResumen?.documento?.trim();
  const puntos = planMillasResumen?.millas;
  const tienePuntos = typeof puntos === "number";
  const millasActuales = tienePuntos ? Math.trunc(puntos) : undefined;
  const montoCop = Math.max(0, Math.round(totalCompraCop));
  const millasGanadas = millasGanadasPorMontoCop(montoCop);
  const millasDespues = millasSaldoProyectadoTrasCompra(millasActuales, montoCop);

  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cliente-frec-aviso-titulo"
    >
      <button
        type="button"
        className="absolute inset-0 animate-cliente-frec-backdrop-in bg-slate-950/55 backdrop-blur-[6px]"
        aria-label="Cerrar"
        onClick={onCerrar}
      />

      <div
        data-pos-modal="plan-millas-cliente-v2"
        className="relative z-[1] w-full max-w-md animate-cliente-frec-modal-in overflow-hidden rounded-3xl border border-emerald-400/35 bg-gradient-to-b from-slate-900 via-slate-900 to-[#0c0e14] shadow-[0_24px_64px_-12px_rgba(0,0,0,0.65),0_0_0_1px_rgba(255,255,255,0.06)_inset,0_0_80px_-20px_rgba(16,185,129,0.18)]"
      >
        <div
          className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full bg-emerald-500/20 blur-3xl animate-pyg-ambient"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-16 -left-12 h-40 w-40 rounded-full bg-emerald-600/10 blur-3xl animate-pyg-ambient-delayed"
          aria-hidden
        />

        <div className="relative px-6 pb-6 pt-8">
          <div className="text-center">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-400/90">Plan de millas</p>
            <h2 id="cliente-frec-aviso-titulo" className="mt-2 text-xl font-extrabold tracking-tight text-white md:text-2xl">
              Cliente frecuente
            </h2>
          </div>

          {nombre || documento || tienePuntos ? (
            <div className="mt-6 rounded-2xl border border-emerald-400/45 bg-emerald-500/15 px-5 py-5 text-left text-sm text-emerald-50 shadow-inner shadow-black/20">
              <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-300/95">Datos en el programa</p>
              {nombre ? <p className="mt-2 text-lg font-bold leading-snug text-white">{nombre}</p> : null}
              {documento ? (
                <p className="mt-2 text-emerald-100/95">
                  Documento:{" "}
                  <span className="font-mono font-semibold text-white">{documento}</span>
                </p>
              ) : null}
              <div className="mt-5 border-t border-emerald-400/25 pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-200/90">Millas ahora</p>
                {tienePuntos ? (
                  <p className="mt-1 text-4xl font-extrabold tabular-nums tracking-tight text-brand-yellow">
                    {formatPuntos(millasActuales!)}
                  </p>
                ) : (
                  <p className="mt-1 text-2xl font-bold tabular-nums text-slate-400">—</p>
                )}
                {millasDespues !== undefined ? (
                  <div className="mt-4 rounded-xl border border-emerald-400/30 bg-black/20 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-200/90">
                      Queda con (esta compra)
                    </p>
                    <p className="mt-1 text-4xl font-extrabold tabular-nums tracking-tight text-white">
                      {formatPuntos(millasDespues)}
                    </p>
                    <p className="mt-2 text-xs text-emerald-100/90">
                      {millasGanadas > 0
                        ? `+ ${formatPuntos(millasGanadas)} milla(s) por esta venta`
                        : "Esta venta no alcanza el mínimo ($9.000) para sumar millas"}
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="mt-6 text-center text-sm text-slate-400">No hay datos del cliente para mostrar.</p>
          )}

          <button
            type="button"
            onClick={onCerrar}
            className="mt-8 w-full rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-400 py-3.5 text-sm font-bold text-slate-900 shadow-lg shadow-emerald-900/30 transition-transform hover:scale-[1.01] active:scale-[0.99]"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
