"use client";

import { useCallback } from "react";
import PosTurnoPausadoPantalla from "@/components/PosTurnoPausadoPantalla";
import { auth } from "@/lib/firebase";

/** Vigila la pausa en todo /caja, también mientras la caja todavía está identificando al cajero. */
export default function PosTurnoPausaLayout() {
  const getIdToken = useCallback(async () => {
    const current = auth?.currentUser;
    if (!current) return null;
    return current.getIdToken();
  }, []);

  return <PosTurnoPausadoPantalla getIdToken={getIdToken} />;
}
