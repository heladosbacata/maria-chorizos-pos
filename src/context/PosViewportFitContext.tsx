"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  computeViewportScale,
  etiquetaEscala,
  hasSeenViewportFitHint,
  markViewportFitHintSeen,
  pantallaConsideradaPequena,
  readStoredViewportFitMode,
  writeStoredViewportFitMode,
  type PosViewportFitMode,
} from "@/lib/posViewportFit";

type PosViewportFitContextValue = {
  mode: PosViewportFitMode;
  setMode: (mode: PosViewportFitMode) => void;
  scale: number;
  scaleLabel: string;
  pantallaPequena: boolean;
  showAutoAppliedBanner: boolean;
  dismissAutoAppliedBanner: () => void;
};

const PosViewportFitContext = createContext<PosViewportFitContextValue | null>(null);

export function PosViewportFitProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<PosViewportFitMode>("auto");
  const [scale, setScale] = useState(1);
  const [viewport, setViewport] = useState({ w: 1440, h: 900 });
  const [showAutoAppliedBanner, setShowAutoAppliedBanner] = useState(false);

  useEffect(() => {
    setModeState(readStoredViewportFitMode());
  }, []);

  const recompute = useCallback(() => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    setViewport({ w, h });
    const nextScale = computeViewportScale(mode, w, h);
    setScale(nextScale);
    document.documentElement.style.setProperty("--pos-ui-scale", String(nextScale));
    document.documentElement.dataset.posViewportFit = mode;
    if (nextScale < 0.999) {
      document.documentElement.classList.add("pos-viewport-scaled");
    } else {
      document.documentElement.classList.remove("pos-viewport-scaled");
    }
  }, []);

  useEffect(() => {
    recompute();
    window.addEventListener("resize", recompute);
    return () => window.removeEventListener("resize", recompute);
  }, [recompute, mode]);

  useEffect(() => {
    recompute();
    const pequena = pantallaConsideradaPequena(viewport.w, viewport.h);
    const autoAplicado = mode === "auto" && scale < 0.999 && pequena;
    if (autoAplicado && !hasSeenViewportFitHint()) {
      setShowAutoAppliedBanner(true);
    }
  }, [mode, scale, viewport.w, viewport.h, recompute]);

  const setMode = useCallback((next: PosViewportFitMode) => {
    writeStoredViewportFitMode(next);
    setModeState(next);
    setShowAutoAppliedBanner(false);
    markViewportFitHintSeen();
  }, []);

  const dismissAutoAppliedBanner = useCallback(() => {
    setShowAutoAppliedBanner(false);
    markViewportFitHintSeen();
  }, []);

  const value = useMemo<PosViewportFitContextValue>(
    () => ({
      mode,
      setMode,
      scale,
      scaleLabel: etiquetaEscala(scale),
      pantallaPequena: pantallaConsideradaPequena(viewport.w, viewport.h),
      showAutoAppliedBanner,
      dismissAutoAppliedBanner,
    }),
    [mode, setMode, scale, viewport.w, viewport.h, showAutoAppliedBanner, dismissAutoAppliedBanner]
  );

  return (
    <PosViewportFitContext.Provider value={value}>{children}</PosViewportFitContext.Provider>
  );
}

export function usePosViewportFit(): PosViewportFitContextValue {
  const ctx = useContext(PosViewportFitContext);
  if (!ctx) {
    throw new Error("usePosViewportFit debe usarse dentro de PosViewportFitProvider");
  }
  return ctx;
}

export function usePosViewportFitOptional(): PosViewportFitContextValue | null {
  return useContext(PosViewportFitContext);
}
