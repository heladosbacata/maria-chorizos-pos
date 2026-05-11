"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { PlanMillasClienteResumen } from "@/lib/plan-millas-validar-resumen";
import { consultarDocumentoPlanMillasWms } from "@/lib/wms-fidelizacion-consulta-documento";

export interface ClienteFrecuenteDocumentoModalProps {
  open: boolean;
  /** Si el cliente ya está elegido en la venta, se prellena el campo. */
  documentoInicial?: string;
  onCancel: () => void;
  /**
   * Tras validar en WMS que está registrado: descuento sticker + abrir aviso al cajero.
   * Recibe el resumen que devolvió el proxy (nombre, millas, documento) si el WMS lo incluye en el JSON.
   * Si devuelve false, el modal no se cierra.
   */
  onClienteRegistradoEnPlanMillas: (
    resumen: PlanMillasClienteResumen | undefined
  ) => boolean | void | Promise<boolean | void>;
}

export default function ClienteFrecuenteDocumentoModal({
  open,
  documentoInicial,
  onCancel,
  onClienteRegistradoEnPlanMillas,
}: ClienteFrecuenteDocumentoModalProps) {
  const [mounted, setMounted] = useState(false);
  const [documento, setDocumento] = useState("");
  const [validando, setValidando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoNoRegistrado, setInfoNoRegistrado] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setInfoNoRegistrado(false);
    setDocumento(documentoInicial?.trim() ? String(documentoInicial).trim() : "");
  }, [open, documentoInicial]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!mounted || !open) return null;

  const cerrar = () => {
    if (validando) return;
    onCancel();
  };

  const validar = async () => {
    setError(null);
    setInfoNoRegistrado(false);
    setValidando(true);
    try {
      const r = await consultarDocumentoPlanMillasWms(documento);
      if (!r.ok) {
        setError(r.message);
        return;
      }
      if (!r.registrado) {
        setInfoNoRegistrado(true);
        setError(null);
        return;
      }
      const activado = await Promise.resolve(onClienteRegistradoEnPlanMillas(r.clientePlanMillas));
      if (activado === false) return;
      onCancel();
    } finally {
      setValidando(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[105] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cliente-frec-doc-titulo"
    >
      <button type="button" className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" aria-label="Cerrar" onClick={cerrar} />
      <div className="relative z-[1] w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <h2 id="cliente-frec-doc-titulo" className="text-lg font-bold text-slate-900">
          Cliente frecuente — plan de millas
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Ingresá el <strong className="text-slate-800">número de documento</strong> del cliente. Validamos en el WMS si ya está en el plan de millas.
        </p>
        <label className="mt-4 block">
          <span className="text-sm font-medium text-slate-700">Documento</span>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={documento}
            onChange={(e) => setDocumento(e.target.value)}
            disabled={validando}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
            placeholder="Ej. cédula o NIT sin puntos"
          />
        </label>
        {infoNoRegistrado ? (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            <strong className="font-semibold">Acción para el artesano:</strong> invitá al cliente a registrarse en el plan de millas (app María Chorizos) y volvé a intentar cuando ya figure en el sistema.
          </div>
        ) : null}
        {error ? <p className="mt-3 text-sm font-medium text-rose-700">{error}</p> : null}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={validando}
            onClick={cerrar}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={validando || !documento.trim()}
            onClick={() => void validar()}
            className="rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {validando ? "Validando…" : "Validar y continuar"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
