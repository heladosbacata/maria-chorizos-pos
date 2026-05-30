"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Props = {
  open: boolean;
  children: ReactNode;
  /** Bloquea scroll del documento mientras el portal está abierto */
  lockScroll?: boolean;
  onEscape?: () => void;
};

/**
 * Renderiza hijos en document.body para que position:fixed use el viewport real.
 * Necesario en /caja porque PosViewportFitShell aplica transform:scale al árbol.
 */
export default function PosBodyPortal({ open, children, lockScroll = false, onEscape }: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open || !lockScroll) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, lockScroll]);

  useEffect(() => {
    if (!open || !onEscape) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onEscape();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onEscape]);

  if (!mounted || !open) return null;
  return createPortal(children, document.body);
}
