"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import type { PosGebTutorialModulo, PosGebTutorialStep } from "@/lib/pos-geb-tutorial-steps";

type Rect = { top: number; left: number; width: number; height: number };

type CardLayout = {
  left: string;
  top?: string;
  bottom?: string;
  transform: string;
  widthPx: number;
  maxHeightPx: number;
};

type Props = {
  open: boolean;
  steps: PosGebTutorialStep[];
  stepIndex: number;
  onStepIndexChange: (next: number) => void;
  onComplete: () => void;
  onNavigateModule: (m: PosGebTutorialModulo) => void;
};

const PAD = 10;
const MARGIN = 16;
const CARD_MAX_W = 420;
const ESTIMATED_CARD_H = 300;

function layoutCardInViewport(hole: Rect, step: PosGebTutorialStep): CardLayout {
  const vw = typeof window !== "undefined" ? window.innerWidth : 800;
  const vh = typeof window !== "undefined" ? window.innerHeight : 600;

  const cardW = Math.min(CARD_MAX_W, vw - MARGIN * 2);
  const halfW = cardW / 2;
  const cx = hole.left + hole.width / 2;
  /** Ancla horizontal: el centro del tooltip nunca sale del área segura (evita que translateX(-50%) lo empuje fuera). */
  const anchorX = Math.max(MARGIN + halfW, Math.min(cx, vw - MARGIN - halfW));

  const maxH = Math.min(380, vh - MARGIN * 2);
  const placement = step.placement ?? "bottom";
  const gap = 12;

  const belowTop = hole.top + hole.height + gap;
  const spaceBelow = vh - belowTop - MARGIN;
  const spaceAbove = hole.top - MARGIN;
  const preferBelow = placement === "bottom" && spaceBelow >= 100;

  if (preferBelow && spaceBelow >= spaceAbove * 0.35) {
    let top = belowTop;
    const room = vh - MARGIN - top;
    const useMaxH = Math.min(maxH, Math.max(160, room));
    if (top + ESTIMATED_CARD_H > vh - MARGIN) {
      top = Math.max(hole.top + hole.height + 6, vh - MARGIN - useMaxH);
    }
    return {
      left: `${anchorX}px`,
      top: `${top}px`,
      transform: "translateX(-50%)",
      widthPx: cardW,
      maxHeightPx: useMaxH,
    };
  }

  /** Encima del hueco: borde inferior del tooltip cerca de hole.top */
  const tooltipBottomY = hole.top - gap;
  let cardTop = tooltipBottomY - ESTIMATED_CARD_H;
  if (cardTop < MARGIN) {
    cardTop = MARGIN;
  }
  const useMaxH = Math.min(maxH, vh - MARGIN - cardTop);
  return {
    left: `${anchorX}px`,
    top: `${cardTop}px`,
    transform: "translateX(-50%)",
    widthPx: cardW,
    maxHeightPx: Math.max(160, useMaxH),
  };
}

function centeredCardLayout(): CardLayout {
  const vw = typeof window !== "undefined" ? window.innerWidth : 800;
  const vh = typeof window !== "undefined" ? window.innerHeight : 600;
  const cardW = Math.min(CARD_MAX_W, vw - MARGIN * 2);
  return {
    left: "50%",
    top: "50%",
    transform: "translate(-50%, -50%)",
    widthPx: cardW,
    maxHeightPx: Math.min(380, vh - MARGIN * 2),
  };
}

export default function PosGebTutorialOverlay({
  open,
  steps,
  stepIndex,
  onStepIndexChange,
  onComplete,
  onNavigateModule,
}: Props) {
  const [hole, setHole] = useState<Rect | null>(null);
  const [cardLayout, setCardLayout] = useState<CardLayout>(() => centeredCardLayout());
  const step = steps[stepIndex];

  const measureAndLayout = useCallback(() => {
    if (!open || !step) {
      setHole(null);
      setCardLayout(centeredCardLayout());
      return;
    }
    const el = document.querySelector(`[data-pos-tutorial="${step.target}"]`) as HTMLElement | null;
    if (!el) {
      setHole(null);
      setCardLayout(centeredCardLayout());
      return;
    }
    const r = el.getBoundingClientRect();
    const nextHole: Rect = {
      top: r.top - PAD,
      left: r.left - PAD,
      width: r.width + PAD * 2,
      height: r.height + PAD * 2,
    };
    setHole(nextHole);
    setCardLayout(layoutCardInViewport(nextHole, step));

    el.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
      inline: "nearest",
    });
  }, [open, step]);

  useEffect(() => {
    if (!open || !step) return;
    onNavigateModule(step.modulo);
  }, [open, step, onNavigateModule]);

  useLayoutEffect(() => {
    measureAndLayout();
  }, [measureAndLayout, stepIndex]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(measureAndLayout, 360);
    const onResize = () => measureAndLayout();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [open, measureAndLayout]);

  if (!open || !step) return null;

  const isLast = stepIndex >= steps.length - 1;

  return (
    <div className="fixed inset-0 z-[101]" role="dialog" aria-modal="true" aria-labelledby="pos-geb-tour-titulo">
      <div className="absolute inset-0 z-[1] bg-transparent" aria-hidden />
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
        className="pointer-events-auto fixed z-[3] overflow-y-auto rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 p-5 text-white shadow-2xl"
        style={{
          top: cardLayout.top,
          bottom: cardLayout.bottom,
          left: cardLayout.left,
          transform: cardLayout.transform,
          width: cardLayout.widthPx,
          maxWidth: cardLayout.widthPx,
          maxHeight: cardLayout.maxHeightPx,
        }}
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
