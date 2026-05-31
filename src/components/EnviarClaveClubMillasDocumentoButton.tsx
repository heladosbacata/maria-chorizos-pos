"use client";

import { useCallback, useState } from "react";
import { KeyRound } from "lucide-react";
import { recuperarClaveClubMillasPorDocumento } from "@/lib/recuperar-clave-club-millas-documento";

export interface EnviarClaveClubMillasDocumentoButtonProps {
  documento: string;
  disabled?: boolean;
  className?: string;
}

/** Envía la clave del plan de millas al correo registrado en WMS (tras validar documento). */
export default function EnviarClaveClubMillasDocumentoButton({
  documento,
  disabled = false,
  className = "",
}: EnviarClaveClubMillasDocumentoButtonProps) {
  const [enviando, setEnviando] = useState(false);

  const onClick = useCallback(async () => {
    if (enviando || disabled || !documento.trim()) return;
    const ok = window.confirm(
      "¿Enviar al correo registrado en el plan de millas la clave de acceso (4 dígitos) de este cliente?\n\n" +
        "Solo usá esto si el cliente olvidó su clave del Club de Millas."
    );
    if (!ok) return;

    setEnviando(true);
    try {
      const r = await recuperarClaveClubMillasPorDocumento(documento);
      window.alert(r.ok ? r.message : r.message);
    } finally {
      setEnviando(false);
    }
  }, [documento, disabled, enviando]);

  return (
    <button
      type="button"
      disabled={disabled || enviando}
      onClick={() => void onClick()}
      className={`inline-flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-600 bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-900 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      <KeyRound className="h-4 w-4 shrink-0" aria-hidden />
      {enviando ? "Enviando correo…" : "Reenviar clave del plan por correo"}
    </button>
  );
}
