"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export interface TurnoCierreExitoPremiumModalProps {
  open: boolean;
  titulo: string;
  lineas: string[];
  onClose: () => void;
}

export default function TurnoCierreExitoPremiumModal({
  open,
  titulo,
  lineas,
  onClose,
}: TurnoCierreExitoPremiumModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!mounted || !open) return null;

  const lineaPrincipal = lineas[0] ?? "";
  const lineaConfirmacion = lineas[1] ?? "";
  const lineaCierre = lineas[2] ?? "";

  return createPortal(
    <div className="fixed inset-0 z-[270] flex items-center justify-center p-4 sm:p-6" role="dialog" aria-modal="true">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/75 backdrop-blur-md"
        aria-label="Cerrar"
        onClick={onClose}
      />

      <div className="relative z-[1] w-full max-w-2xl">
        <div className="relative overflow-hidden rounded-3xl border border-white/15 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 p-6 shadow-[0_35px_90px_-30px_rgba(0,0,0,0.85)] sm:p-8">
          <div
            className="pointer-events-none absolute -left-16 -top-16 h-52 w-52 rounded-full bg-brand-yellow/25 blur-3xl"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -bottom-20 -right-20 h-56 w-56 rounded-full bg-primary-500/20 blur-3xl"
            aria-hidden
          />

          <div className="relative">
            <div className="mb-5 flex items-center gap-3">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-brand-yellow/40 bg-brand-yellow/15 text-brand-yellow shadow-inner">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 21h8M12 17v4M7 4h10v3a5 5 0 11-10 0V4zm-2 3h2m10 0h2" />
                </svg>
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-yellow/90">Cierre de turno</p>
                <h3 className="text-xl font-bold tracking-tight text-white sm:text-2xl">{titulo}</h3>
              </div>
            </div>

            {lineaPrincipal ? (
              <p className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-relaxed text-slate-100 sm:text-base">
                {lineaPrincipal}
              </p>
            ) : null}

            {lineaConfirmacion ? (
              <div className="mt-4 rounded-2xl border border-emerald-300/35 bg-emerald-500/10 px-4 py-3">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-400/20 text-emerald-200">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m5 13 4 4L19 7" />
                    </svg>
                  </span>
                  <p className="text-sm leading-relaxed text-emerald-100">{lineaConfirmacion}</p>
                </div>
              </div>
            ) : null}

            {lineaCierre ? <p className="mt-4 text-sm font-medium text-slate-300">{lineaCierre}</p> : null}

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex min-w-28 items-center justify-center rounded-xl border border-white/20 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-white/20"
              >
                Aceptar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
