"use client";

import { useCallback, useState } from "react";
import { Mail } from "lucide-react";
import { reenviarBienvenidaClubMillasCliente } from "@/lib/reenviar-bienvenida-club-millas-cliente";

export interface ReenviarClaveClubMillasButtonProps {
  clienteId: string;
  /** Si false, el botón no se muestra (ej. sin correo). */
  habilitado?: boolean;
  disabled?: boolean;
  /** compact = solo icono en tabla; default = texto corto */
  variant?: "compact" | "default";
  className?: string;
}

export default function ReenviarClaveClubMillasButton({
  clienteId,
  habilitado = true,
  disabled = false,
  variant = "default",
  className = "",
}: ReenviarClaveClubMillasButtonProps) {
  const [enviando, setEnviando] = useState(false);

  const onClick = useCallback(async () => {
    if (enviando || disabled || !habilitado) return;
    const ok = window.confirm(
      "¿Enviar al correo registrado del cliente la clave de 4 dígitos del Club de Millas?\n\n" +
        "El cliente podrá ingresar en club-de-millas con su documento y esa clave."
    );
    if (!ok) return;

    setEnviando(true);
    try {
      const r = await reenviarBienvenidaClubMillasCliente(clienteId);
      if (!r.ok) {
        window.alert(r.message);
        return;
      }
      const partes: string[] = [];
      if (r.correoEnviado) partes.push("Correo enviado.");
      else if (r.correoError) partes.push(`Correo: ${r.correoError}`);
      if (r.wmsSincronizado) partes.push("Clave sincronizada en el plan de millas.");
      else if (r.wmsError) partes.push(`WMS: ${r.wmsError}`);
      window.alert(
        partes.length > 0
          ? partes.join("\n")
          : "Proceso completado. Pedile al cliente que revise su bandeja y spam."
      );
    } finally {
      setEnviando(false);
    }
  }, [clienteId, disabled, enviando, habilitado]);

  if (!habilitado) return null;

  if (variant === "compact") {
    return (
      <button
        type="button"
        disabled={disabled || enviando}
        onClick={() => void onClick()}
        title="Reenviar clave del plan de millas por correo"
        aria-label="Reenviar clave club de millas"
        className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      >
        <Mail className="h-4 w-4" strokeWidth={2} aria-hidden />
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled || enviando}
      onClick={() => void onClick()}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-emerald-600 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {enviando ? "Enviando…" : "Clave club por correo"}
    </button>
  );
}
