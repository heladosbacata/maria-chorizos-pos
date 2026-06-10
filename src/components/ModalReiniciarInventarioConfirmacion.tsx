"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export interface ModalReiniciarInventarioConfirmacionProps {
  open: boolean;
  puntoVenta: string;
  procesando: boolean;
  onCancelar: () => void;
  onConfirmar: () => void;
}

export default function ModalReiniciarInventarioConfirmacion({
  open,
  puntoVenta,
  procesando,
  onCancelar,
  onConfirmar,
}: ModalReiniciarInventarioConfirmacionProps) {
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

  return createPortal(
    <div
      className="fixed inset-0 z-[280] flex items-center justify-center p-4 sm:p-6"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="reinicio-inv-titulo"
      aria-describedby="reinicio-inv-desc"
    >
      <div
        className="inv-reset-backdrop absolute inset-0 bg-[#0a0c10]/88 backdrop-blur-[16px]"
        aria-hidden
        onClick={procesando ? undefined : onCancelar}
      />

      <div className="relative z-[1] w-full max-w-lg">
        <div className="inv-reset-card relative overflow-hidden rounded-3xl border border-red-500/20 bg-gradient-to-b from-slate-900/98 via-[#0c0f14] to-[#06080d] px-6 pb-8 pt-7 shadow-[0_28px_90px_-24px_rgba(127,29,29,0.55),0_0_0_1px_rgba(255,255,255,0.05)_inset] sm:px-8 sm:pb-9 sm:pt-8">
          <div
            className="pointer-events-none absolute -left-20 -top-20 h-52 w-52 rounded-full bg-red-600/25 blur-3xl inv-reset-glow"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -bottom-14 -right-14 h-44 w-44 rounded-full bg-amber-500/15 blur-3xl inv-reset-glow-delayed"
            aria-hidden
          />

          <div className="relative flex flex-col items-center text-center">
            <div className="relative mb-6 flex h-28 w-28 items-center justify-center">
              <div
                className="absolute inset-0 rounded-full border border-red-400/30 inv-reset-orbit-ring"
                aria-hidden
              />
              <div className="inv-reset-icon-float relative flex h-20 w-20 items-center justify-center rounded-2xl border border-red-500/35 bg-gradient-to-br from-red-950/80 to-red-900/40 shadow-[0_12px_40px_-8px_rgba(220,38,38,0.45)]">
                <svg viewBox="0 0 64 64" className="h-11 w-11 text-red-300" aria-hidden>
                  <path
                    fill="currentColor"
                    d="M32 6C18.7 6 8 16.7 8 30v6h4v-6c0-11 9-20 20-20s20 9 20 20v6h4v-6C56 16.7 45.3 6 32 6Zm-14 22v18c0 7.7 6.3 14 14 14h4c7.7 0 14-6.3 14-14V28H18Zm8 0h20v18c0 3.9-3.1 7-7 7h-6c-3.9 0-7-3.1-7-7V28Z"
                    opacity="0.35"
                  />
                  <text x="32" y="40" textAnchor="middle" fill="currentColor" fontSize="18" fontWeight="800">
                    0
                  </text>
                </svg>
              </div>
              <span className="inv-reset-sparkle absolute -right-1 top-2 text-xl text-red-300/90" aria-hidden>
                ✦
              </span>
            </div>

            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-red-300/90">Acción irreversible</p>
            <h2 id="reinicio-inv-titulo" className="mt-2 text-xl font-bold tracking-tight text-white sm:text-2xl">
              ¿Reiniciar todo el inventario a cero?
            </h2>
            <p id="reinicio-inv-desc" className="mt-3 max-w-md text-sm leading-relaxed text-slate-300">
              En el punto de venta <strong className="font-semibold text-white">{puntoVenta}</strong> todos los
              saldos quedarán en <strong className="text-red-200">cero</strong>. Se registrarán ajustes en el
              historial y se enviará un correo al franquiciado notificando esta acción.
            </p>

            <ul className="mt-5 w-full max-w-md space-y-2 rounded-2xl border border-white/8 bg-white/5 px-4 py-3 text-left text-xs text-slate-300">
              <li className="flex gap-2">
                <span className="text-red-400" aria-hidden>
                  •
                </span>
                <span>Los productos con stock actual desaparecerán del saldo visible (quedarán en 0).</span>
              </li>
              <li className="flex gap-2">
                <span className="text-red-400" aria-hidden>
                  •
                </span>
                <span>No borra ventas ni recibos; solo ajusta inventario y saldos ensamble WMS.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-red-400" aria-hidden>
                  •
                </span>
                <span>Después deberás volver a cargar inventario desde cero si necesitás stock.</span>
              </li>
            </ul>

            <div className="mt-8 flex w-full max-w-md flex-col-reverse gap-3 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={onCancelar}
                disabled={procesando}
                className="rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/10 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={onConfirmar}
                disabled={procesando}
                className="rounded-xl bg-gradient-to-r from-red-700 to-red-600 px-6 py-3 text-sm font-bold text-white shadow-[0_8px_28px_-6px_rgba(220,38,38,0.65)] transition hover:from-red-600 hover:to-red-500 disabled:opacity-60"
              >
                {procesando ? "Reiniciando inventario…" : "Sí, reiniciar inventario"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
