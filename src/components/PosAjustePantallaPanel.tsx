"use client";

import { Monitor } from "lucide-react";
import { usePosViewportFit } from "@/context/PosViewportFitContext";
import { POS_VIEWPORT_FIT_MODES, type PosViewportFitMode } from "@/lib/posViewportFit";

export default function PosAjustePantallaPanel() {
  const { mode, setMode, scaleLabel, pantallaPequena, showAutoAppliedBanner, dismissAutoAppliedBanner } =
    usePosViewportFit();

  return (
    <div className="mb-3 w-full">
      {showAutoAppliedBanner ? (
        <div className="mb-2 rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-2 text-left">
          <p className="text-[11px] font-semibold leading-snug text-teal-950">
            Pantalla ajustada automáticamente ({scaleLabel})
          </p>
          <p className="mt-0.5 text-[10px] leading-snug text-teal-800/90">
            Ya no necesita hacer zoom en el navegador. Puede cambiar el tamaño abajo.
          </p>
          <button
            type="button"
            onClick={dismissAutoAppliedBanner}
            className="mt-1.5 text-[10px] font-semibold text-teal-700 underline hover:text-teal-900"
          >
            Entendido
          </button>
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-200/90 bg-gradient-to-b from-white to-slate-50/90 p-2.5 shadow-sm">
        <div className="mb-2 flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
            <Monitor className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-600">Tamaño pantalla</p>
            <p className="text-[10px] text-slate-500 leading-tight">
              {mode === "auto"
                ? `Automático · ${scaleLabel}${pantallaPequena ? " · pantalla compacta" : ""}`
                : `Fijo · ${scaleLabel}`}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1">
          {POS_VIEWPORT_FIT_MODES.map((opt) => {
            const active = mode === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                title={opt.label}
                onClick={() => setMode(opt.id as PosViewportFitMode)}
                className={`rounded-lg px-1 py-1.5 text-[10px] font-semibold leading-tight transition-colors ${
                  active
                    ? "bg-brand-yellow text-gray-900 ring-1 ring-amber-400/80"
                    : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
                }`}
              >
                {opt.short}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[9px] leading-snug text-slate-500">
          Use <strong className="font-semibold text-slate-600">Auto</strong> en portátiles 13&quot;. No use zoom del
          navegador (Ctrl + rueda).
        </p>
      </div>
    </div>
  );
}
