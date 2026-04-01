"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buscarAyudaPosGeb,
  type PosGebHelpArticle,
} from "@/lib/pos-help-knowledge";
import type { PosGebTutorialModulo } from "@/lib/pos-geb-tutorial-steps";

type Props = {
  open: boolean;
  onClose: () => void;
  onIrAModulo: (modulo: PosGebTutorialModulo, dataTutorialTarget?: string) => void;
  esContador: boolean;
};

export default function PosGebAyudaMotorModal({ open, onClose, onIrAModulo, esContador }: Props) {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<PosGebHelpArticle | null>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setSelected(null);
    }
  }, [open]);

  const resultados = useMemo(() => buscarAyudaPosGeb(q), [q]);

  if (!open) return null;

  const modulosNoContador: PosGebTutorialModulo[] = [
    "ventas",
    "turnos",
    "cargueInventario",
    "inventarios",
    "mas",
  ];

  const filtrarContador = (lista: PosGebHelpArticle[]) => {
    if (!esContador) return lista;
    return lista.filter(
      (a) => !a.moduloSugerido || !modulosNoContador.includes(a.moduloSugerido)
    );
  };

  const mostrar = filtrarContador(selected ? [selected] : resultados);

  return (
    <div
      className="fixed inset-0 z-[102] flex items-start justify-center overflow-y-auto p-4 pt-[8vh] sm:pt-[10vh]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pos-geb-ayuda-titulo"
    >
      <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-slate-900 to-slate-950 shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div>
            <h2 id="pos-geb-ayuda-titulo" className="text-lg font-bold text-white">
              Ayuda GEB
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Motor de búsqueda: escribí qué querés hacer y te guiamos.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white"
            aria-label="Cerrar ayuda"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5">
          <div className="relative">
            <svg
              className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="search"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setSelected(null);
              }}
              placeholder="Ej.: abrir turno, anular recibo, inventario…"
              className="w-full rounded-xl border border-white/10 bg-slate-800/80 py-3 pl-11 pr-4 text-sm text-white placeholder:text-slate-500 focus:border-brand-yellow/50 focus:outline-none focus:ring-2 focus:ring-brand-yellow/20"
              autoFocus
            />
          </div>

          <ul className="mt-4 max-h-[min(52vh,420px)] space-y-2 overflow-y-auto pr-1">
            {mostrar.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => setSelected(a)}
                  className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
                    selected?.id === a.id
                      ? "border-brand-yellow/60 bg-brand-yellow/10"
                      : "border-white/5 bg-slate-800/40 hover:border-white/15 hover:bg-slate-800/70"
                  }`}
                >
                  <span className="font-semibold text-white">{a.title}</span>
                  <span className="mt-1 block text-xs text-slate-400">{a.summary}</span>
                </button>
                {selected?.id === a.id && (
                  <div className="mt-2 rounded-xl border border-white/10 bg-slate-950/60 p-4">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-brand-yellow/90">
                      Pasos sugeridos
                    </p>
                    <ol className="mt-2 list-decimal space-y-2 pl-4 text-sm text-slate-200">
                      {a.pasos.map((p, i) => (
                        <li key={i} className="leading-relaxed">
                          {p}
                        </li>
                      ))}
                    </ol>
                    {a.moduloSugerido && (!esContador || a.moduloSugerido !== "mas") ? (
                      <button
                        type="button"
                        onClick={() => {
                          onIrAModulo(a.moduloSugerido!, a.dataTutorialTarget);
                          onClose();
                        }}
                        className="mt-4 w-full rounded-xl bg-brand-yellow py-2.5 text-sm font-bold text-gray-900 hover:opacity-95"
                      >
                        Ver en pantalla
                      </button>
                    ) : a.moduloSugerido === "mas" && esContador ? (
                      <p className="mt-3 text-xs text-slate-500">El menú «Más» no está disponible en la vista contador.</p>
                    ) : null}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
