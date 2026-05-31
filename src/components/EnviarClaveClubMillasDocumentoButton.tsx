"use client";

import { useCallback, useState } from "react";
import { KeyRound } from "lucide-react";
import { recuperarClaveClubMillasPorDocumento } from "@/lib/recuperar-clave-club-millas-documento";

export type ResultadoEnvioClaveClubMillas = { ok: true; message: string } | { ok: false; message: string };

export interface EnviarClaveClubMillasDocumentoButtonProps {
  documento: string;
  disabled?: boolean;
  className?: string;
  /** dark = modal plan de millas (fondo oscuro); default = panel claro */
  variant?: "default" | "dark";
  /** Resultado del envío (sin alertas del navegador). */
  onResultado?: (r: ResultadoEnvioClaveClubMillas) => void;
}

/** Envía la clave del plan de millas al correo registrado en WMS (tras validar documento). */
export default function EnviarClaveClubMillasDocumentoButton({
  documento,
  disabled = false,
  className = "",
  variant = "default",
  onResultado,
}: EnviarClaveClubMillasDocumentoButtonProps) {
  const [enviando, setEnviando] = useState(false);

  const onClick = useCallback(async () => {
    if (enviando || disabled || !documento.trim()) return;

    setEnviando(true);
    try {
      const r = await recuperarClaveClubMillasPorDocumento(documento);
      const payload: ResultadoEnvioClaveClubMillas = r.ok
        ? { ok: true, message: r.message }
        : { ok: false, message: r.message };
      onResultado?.(payload);
    } finally {
      setEnviando(false);
    }
  }, [documento, disabled, enviando, onResultado]);

  const variantClass =
    variant === "dark"
      ? "rounded-xl border border-emerald-400/45 bg-black/25 px-3 py-2.5 text-sm font-semibold text-emerald-50 shadow-inner shadow-black/20 hover:bg-emerald-500/20"
      : "rounded-lg border border-emerald-600 bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-900 hover:bg-emerald-100";

  return (
    <button
      type="button"
      disabled={disabled || enviando}
      onClick={() => void onClick()}
      className={`inline-flex w-full items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50 ${variantClass} ${className}`}
    >
      <KeyRound className="h-4 w-4 shrink-0" aria-hidden />
      {enviando ? "Enviando correo…" : "Reenviar clave del plan por correo"}
    </button>
  );
}
