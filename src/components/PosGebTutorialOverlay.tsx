"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import type { PosGebTutorialModulo, PosGebTutorialStep } from "@/lib/pos-geb-tutorial-steps";

type Rect = { top: number; left: number; width: number; height: number };

type Props = {
  open: boolean;
  steps: PosGebTutorialStep[];
  stepIndex: number;
  onStepIndexChange: (next: number) => void;
  onComplete: () => void;
  onNavigateModule: (m: PosGebTutorialModulo) => void;
};

const PAD = 10;

export default function PosGebTutorialOverlay({
  open,
  steps,
  stepIndex,
  onStepIndexChange,
  onComplete,
  onNavigateModule,
}: Props) {
  const [hole, setHole] = useState<Rect | null>(null);
  const step = steps[stepIndex];

  const updateHole = useCallback(() => {
    if (!open || !step) {
      setHole(null);
      return;
    }
    const el = document.querySelector(`[data-pos-tutorial="${step.target}"]`) as HTMLElement | null;
    if (!el) {
      setHole(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setHole({
      top: r.top - PAD,
      left: r.left - PAD,
      width: r.width + PAD * 2,
      height: r.height + PAD * 2,
    });
    el.scrollIntoView({ block: "center", behavior: "smooth", inline: "nearest" });
  }, [open, step]);

  useEffect(() => {
    if (!open || !step) return;
    onNavigateModule(step.modulo);
  }, [open, step, onNavigateModule]);

  useLayoutEffect(() => {
    updateHole();
  }, [updateHole, stepIndex]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(updateHole, 320);
    const onResize = () => updateHole();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [open, updateHole]);

  if (!open || !step) return null;

  const isLast = stepIndex >= steps.length - 1;
  const placement = step.placement ?? "bottom";

  let cardTop = "50%";
  let cardLeft = "50%";
  let cardTransform = "translate(-50%, -50%)";
  if (hole) {
    const cx = hole.left + hole.width / 2;
    const clampedLeft = Math.max(24, Math.min(cx, window.innerWidth - 24));
    const spaceBelow = window.innerHeight - (hole.top + hole.height);
    const preferBelow = placement === "bottom" && spaceBelow > 200;
    if (preferBelow) {
      cardTop = `${hole.top + hole.height + 16}px`;
      cardLeft = `${clampedLeft}px`;
      cardTransform = "translate(-50%, 0)";
    } else {
      cardTop = `${Math.max(16, hole.top - 12)}px`;
      cardLeft = `${clampedLeft}px`;
      cardTransform = "translate(-50%, -100%)";
    }
  }

  return (
    <div className="fixed inset-0 z-[101]" role="dialog" aria-modal="true" aria-labelledby="pos-geb-tour-titulo">
      <div className="absolute inset-0 z-[1] bg-transparent" aria-hidden />
      {/* Capa oscura con recorte simulado vía sombras */}
      {hole ? (
        <div
          className="pointer-events-none fixed z-0 rounded-xl border-2 border-brand-yellow shadow-[0_0_0_9999px_rgba(15,23,42,0.82)] ring-4 ring-brand-yellow/30"
          style={{
            top: hole.top,
            left: hole.left,
            width: hole.width,
            height: hole.height,
            boxShadow: "0 0 0 9999px rgba(15,23,42,0.82), 0 0 40px rgba(255,200,28,0.25)",
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-slate-950/82 backdrop-blur-[2px]" aria-hidden />
      )}

      <div
        className="pointer-events-auto fixed z-[3] max-h-[min(70vh,380px)] w-[min(100vw-2rem,420px)] overflow-y-auto rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 p-5 text-white shadow-2xl"
        style={{ top: cardTop, left: cardLeft, transform: cardTransform }}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="rounded-full bg-brand-yellow/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-yellow">
            Visita guiada · {stepIndex + 1}/{steps.length}
          </span>
          <button
            type="button"
            onClick={onComplete}
            className="text-xs font-medium text-slate-400 underline-offset-2 hover:text-white hover:underline"
          >
            Saltar tour
          </button>
        </div>
        <h2 id="pos-geb-tour-titulo" className="text-lg font-bold leading-snug text-white">
          {step.title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">{step.body}</p>
        {!hole && (
          <p className="mt-2 text-xs text-amber-200/90">
            No encontramos el elemento en pantalla; podés seguir con «Siguiente» o cambiar de módulo en el menú.
          </p>
        )}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          {stepIndex > 0 ? (
            <button
              type="button"
              onClick={() => onStepIndexChange(stepIndex - 1)}
              className="rounded-xl border border-white/20 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/10"
            >
              Atrás
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              if (isLast) onComplete();
              else onStepIndexChange(stepIndex + 1);
            }}
            className="rounded-xl bg-gradient-to-r from-brand-yellow to-amber-300 px-5 py-2.5 text-sm font-bold text-gray-900 shadow-lg hover:opacity-95"
          >
            {isLast ? "¡Listo, a vender!" : "Siguiente"}
          </button>
        </div>
      </div>
    </div>
  );
}
