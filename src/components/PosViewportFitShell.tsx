"use client";

import type { ReactNode } from "react";
import { usePosViewportFit } from "@/context/PosViewportFitContext";

type Props = {
  children: ReactNode;
};

/**
 * Escala el contenido de /caja para que quepa en pantallas pequeñas sin zoom del navegador.
 */
export default function PosViewportFitShell({ children }: Props) {
  const { scale } = usePosViewportFit();

  if (scale >= 0.999) {
    return (
      <div className="flex h-dvh max-h-dvh min-h-0 w-full flex-col overflow-hidden bg-gray-100/90">
        {children}
      </div>
    );
  }

  const invPercent = 100 / scale;

  return (
    <div className="h-dvh max-h-dvh w-full overflow-hidden bg-gray-100/90">
      <div
        className="flex min-h-0 flex-col overflow-hidden"
        style={{
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          width: `${invPercent}%`,
          height: `${invPercent}dvh`,
        }}
      >
        {children}
      </div>
    </div>
  );
}
