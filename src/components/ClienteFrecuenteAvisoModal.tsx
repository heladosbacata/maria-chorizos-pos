"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export interface ClienteFrecuenteAvisoModalProps {
  open: boolean;
  onCerrar: () => void;
}

function IconoTelefono({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3"
      />
    </svg>
  );
}

function IconoQr({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75v-.75zM16.5 6.75h.75v.75h-.75v-.75zM13.5 13.5h.75v.75h-.75v-.75zM19.5 19.5v-4.125a1.125 1.125 0 00-1.125-1.125H16.5M13.5 19.5v-2.25a1.125 1.125 0 011.125-1.125h2.25m-9-4.5h.75v.75h-.75v-.75z"
      />
    </svg>
  );
}

function IconoUsuarioPlus({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM3 19.235v-.25a6.375 6.375 0 0112.75 0v.25"
      />
    </svg>
  );
}

/**
 * Aviso animado al activar «Soy cliente frecuente»: guión para el cajero (app + registro + QR).
 */
export default function ClienteFrecuenteAvisoModal({ open, onCerrar }: ClienteFrecuenteAvisoModalProps) {
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
        className="relative z-[1] w-full max-w-md animate-cliente-frec-modal-in overflow-hidden rounded-3xl border border-amber-200/40 bg-gradient-to-b from-slate-900 via-slate-900 to-[#0c0e14] shadow-[0_24px_64px_-12px_rgba(0,0,0,0.65),0_0_0_1px_rgba(255,255,255,0.06)_inset,0_0_80px_-20px_rgba(255,200,28,0.2)]"
      >
        <div
          className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full bg-brand-yellow/25 blur-3xl animate-pyg-ambient"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-16 -left-12 h-40 w-40 rounded-full bg-amber-500/15 blur-3xl animate-pyg-ambient-delayed"
          aria-hidden
        />

        <div className="relative px-6 pb-6 pt-8">
          <div className="mb-6 flex justify-center gap-5 text-amber-300/95">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-400/30 bg-amber-500/10 shadow-lg shadow-amber-900/20 animate-pyg-float">
              <IconoTelefono className="h-7 w-7" />
            </div>
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-400/30 bg-amber-500/10 shadow-lg shadow-amber-900/20 animate-pyg-float [animation-delay:120ms]">
              <IconoUsuarioPlus className="h-7 w-7" />
            </div>
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-400/30 bg-amber-500/10 shadow-lg shadow-amber-900/20 animate-pyg-float [animation-delay:240ms]">
              <IconoQr className="h-7 w-7" />
            </div>
          </div>

          <div className="text-center">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400/90">Programa fidelización</p>
            <h2 id="cliente-frec-aviso-titulo" className="mt-2 text-xl font-extrabold tracking-tight text-white md:text-2xl">
              Indicale al cliente
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              Así podrá sumar o redimir puntos con el <span className="font-semibold text-amber-200">QR del comprobante</span>{" "}
              en la app.
            </p>
          </div>

          <div className="mt-5 rounded-2xl border border-amber-400/35 bg-amber-500/10 px-4 py-3 text-left text-sm leading-relaxed text-amber-50/95">
            <strong className="text-amber-200">Preguntale al cliente</strong> si{" "}
            <strong className="text-white">ya tiene su tarjeta de fidelización</strong>. Si ya la tiene, no hace falta
            darle otra; si no, entregale el sticker y guiá con los pasos siguientes.
          </div>

          <ol className="mt-6 space-y-4 text-left text-sm text-slate-200">
            <li className="flex gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm">
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-sm font-bold text-amber-300"
                aria-hidden
              >
                1
              </span>
              <span>
                <strong className="text-white">Descargar la app María Chorizos</strong> en su celular (tienda de
                aplicaciones).
              </span>
            </li>
            <li className="flex gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm">
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-sm font-bold text-amber-300"
                aria-hidden
              >
                2
              </span>
              <span>
                <strong className="text-white">Registrarse</strong> en la app con sus datos.
              </span>
            </li>
            <li className="flex gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm">
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-sm font-bold text-amber-300"
                aria-hidden
              >
                3
              </span>
              <span>
                Al tener el ticket impreso, <strong className="text-white">escanear el código QR</strong> desde la app
                para sumar o redimir puntos.
              </span>
            </li>
          </ol>

          <button
            type="button"
            onClick={onCerrar}
            className="mt-8 w-full rounded-2xl bg-gradient-to-r from-amber-400 to-brand-yellow py-3.5 text-sm font-bold text-slate-900 shadow-lg shadow-amber-900/30 transition-transform hover:scale-[1.01] active:scale-[0.99]"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
