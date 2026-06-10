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

const TEXTO_CONFIRMACION = "REINICIAR";

export default function ModalReiniciarInventarioConfirmacion({
  open,
  puntoVenta,
  procesando,
  onCancelar,
  onConfirmar,
}: ModalReiniciarInventarioConfirmacionProps) {
  const [mounted, setMounted] = useState(false);
  const [paso, setPaso] = useState<"advertencia" | "confirmacion">("advertencia");
  const [aceptoRiesgo, setAceptoRiesgo] = useState(false);
  const [textoConfirmacion, setTextoConfirmacion] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setPaso("advertencia");
      setAceptoRiesgo(false);
      setTextoConfirmacion("");
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const textoOk = textoConfirmacion.trim().toUpperCase() === TEXTO_CONFIRMACION;
  const puedeConfirmarFinal = aceptoRiesgo && textoOk && !procesando;

  const cancelar = () => {
    if (procesando) return;
    onCancelar();
  };

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
        className="absolute inset-0 bg-black/70 backdrop-blur-[2px]"
        aria-hidden
        onClick={procesando ? undefined : cancelar}
      />

      <div className="relative z-[1] w-full max-w-lg">
        {paso === "advertencia" ? (
          <div className="inv-reset-card relative overflow-hidden rounded-2xl border-2 border-red-500 bg-gradient-to-b from-red-950 via-red-900 to-red-950 p-6 text-white shadow-2xl shadow-red-600/50 ring-4 ring-red-500/30 sm:p-8">
            <div className="pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full bg-red-500/30 blur-2xl" aria-hidden />

            <div className="relative flex flex-col items-center text-center">
              <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/25 ring-2 ring-red-300/50">
                <span className="text-2xl font-black text-white" aria-hidden>
                  0
                </span>
              </div>

              <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-100">Acción irreversible</p>
              <h2 id="reinicio-inv-titulo" className="mt-2 text-xl font-bold leading-tight text-white sm:text-2xl">
                ¿Reiniciar todo el inventario a cero?
              </h2>
              <p id="reinicio-inv-desc" className="mt-3 max-w-md text-sm leading-relaxed text-red-50">
                En el punto de venta <strong className="font-bold text-white">{puntoVenta}</strong> todos los saldos
                quedarán en <strong className="font-bold text-white">cero</strong>. Se registrarán ajustes en el
                historial y se enviará un correo al franquiciado notificando esta acción.
              </p>

              <ul className="mt-5 w-full max-w-md space-y-2 rounded-xl border border-red-400/40 bg-red-950/60 px-4 py-3 text-left text-sm text-red-50">
                <li className="flex gap-2">
                  <span className="font-bold text-white" aria-hidden>
                    •
                  </span>
                  <span>Los productos con stock actual desaparecerán del saldo visible (quedarán en 0).</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-bold text-white" aria-hidden>
                    •
                  </span>
                  <span>No borra ventas ni recibos; solo ajusta inventario y saldos ensamble WMS.</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-bold text-white" aria-hidden>
                    •
                  </span>
                  <span>Después deberás volver a cargar inventario desde cero si necesitás stock.</span>
                </li>
              </ul>

              <div className="mt-8 flex w-full max-w-md flex-col-reverse gap-3 sm:flex-row sm:justify-center">
                <button
                  type="button"
                  onClick={cancelar}
                  disabled={procesando}
                  className="rounded-xl border border-red-300/60 bg-red-950/70 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-900 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => setPaso("confirmacion")}
                  disabled={procesando}
                  className="rounded-xl bg-white px-6 py-3 text-sm font-bold text-red-900 shadow-md transition hover:bg-red-50 disabled:opacity-50"
                >
                  Sí, continuar
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="inv-reset-card relative overflow-hidden rounded-2xl border border-red-400/70 bg-gray-950 p-6 text-white shadow-2xl shadow-red-900/40 ring-1 ring-red-500/40 sm:p-8">
            <div className="flex items-start gap-3 border-b border-gray-700 pb-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-600/30 ring-1 ring-red-500/50">
                <svg className="h-6 w-6 text-red-200" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </span>
              <div className="min-w-0 text-left">
                <h2 id="reinicio-inv-titulo" className="text-lg font-bold text-white">
                  Confirmación final
                </h2>
                <p className="mt-1 text-sm text-gray-300">
                  Último paso antes de poner en cero el inventario de{" "}
                  <strong className="font-semibold text-white">{puntoVenta}</strong>.
                </p>
              </div>
            </div>

            <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-gray-700 bg-gray-900/80 px-4 py-3 text-left">
              <input
                type="checkbox"
                checked={aceptoRiesgo}
                onChange={(e) => setAceptoRiesgo(e.target.checked)}
                disabled={procesando}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-500 text-red-600 focus:ring-red-500"
              />
              <span className="text-sm leading-snug text-gray-100">
                Confirmo que entiendo que esta acción es <strong className="text-white">irreversible</strong> y que
                deberé cargar inventario de nuevo si lo necesito.
              </span>
            </label>

            <div className="mt-4 text-left">
              <label htmlFor="reinicio-inv-texto" className="mb-1.5 block text-sm font-medium text-gray-200">
                Escribí <span className="font-mono font-bold text-white">{TEXTO_CONFIRMACION}</span> para habilitar el
                botón:
              </label>
              <input
                id="reinicio-inv-texto"
                type="text"
                value={textoConfirmacion}
                onChange={(e) => setTextoConfirmacion(e.target.value)}
                disabled={procesando}
                autoComplete="off"
                spellCheck={false}
                placeholder={TEXTO_CONFIRMACION}
                className="w-full rounded-xl border border-gray-600 bg-gray-900 px-4 py-3 font-mono text-sm text-white placeholder:text-gray-500 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/40 disabled:opacity-50"
              />
            </div>

            <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  if (procesando) return;
                  setPaso("advertencia");
                  setAceptoRiesgo(false);
                  setTextoConfirmacion("");
                }}
                disabled={procesando}
                className="rounded-xl border border-gray-600 bg-gray-800 px-5 py-3 text-sm font-semibold text-gray-100 transition hover:bg-gray-700 disabled:opacity-50"
              >
                Volver
              </button>
              <button
                type="button"
                onClick={onConfirmar}
                disabled={!puedeConfirmarFinal}
                className="rounded-xl bg-red-600 px-6 py-3 text-sm font-bold text-white shadow-[0_8px_28px_-6px_rgba(220,38,38,0.65)] transition hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-red-900/50 disabled:text-red-200/70"
              >
                {procesando ? "Reiniciando inventario…" : "Sí, reiniciar inventario"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
