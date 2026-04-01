"use client";

import { createContext, useContext, type ReactNode } from "react";
import {
  useMetasRetosYVentasParaPunto,
  type UseMetasRetosYVentasParaPuntoResult,
} from "@/hooks/useMetasRetosYVentasParaPunto";

const MetasRetosCajaContext = createContext<UseMetasRetosYVentasParaPuntoResult | null>(null);

export function MetasRetosCajaProvider({
  puntoVenta,
  uid,
  children,
}: {
  puntoVenta: string | null | undefined;
  uid: string | null | undefined;
  children: ReactNode;
}) {
  const value = useMetasRetosYVentasParaPunto(puntoVenta, uid);
  return <MetasRetosCajaContext.Provider value={value}>{children}</MetasRetosCajaContext.Provider>;
}

export function useMetasRetosCaja(): UseMetasRetosYVentasParaPuntoResult {
  const ctx = useContext(MetasRetosCajaContext);
  if (!ctx) {
    throw new Error("useMetasRetosCaja debe usarse dentro de MetasRetosCajaProvider");
  }
  return ctx;
}
