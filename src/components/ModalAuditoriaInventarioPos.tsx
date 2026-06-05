"use client";

import { useEffect } from "react";
import { fechaHoraColombia } from "@/lib/fecha-colombia";
import {
  etiquetaFuenteCatalogoAuditoria,
  type DatosAuditoriaInventarioPos,
} from "@/lib/inventario-auditoria-pos-data";
import { nombreArchivoAuditoriaInventarioPdf } from "@/lib/inventario-auditoria-pos-data";

export interface ModalAuditoriaInventarioPosProps {
  open: boolean;
  onClose: () => void;
  puntoVenta: string;
  datos: DatosAuditoriaInventarioPos | null;
  pdfUrl: string | null;
  busy: boolean;
  errorMsg: string | null;
  onRegenerar: () => void;
  onDescargar: () => void;
}

export default function ModalAuditoriaInventarioPos({
  open,
  onClose,
  puntoVenta,
  datos,
  pdfUrl,
  busy,
  errorMsg,
  onRegenerar,
  onDescargar,
}: ModalAuditoriaInventarioPosProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  const r = datos?.resumen;
  const listo = Boolean(pdfUrl && datos);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-auditoria-inventario-titulo"
    >
      <div className="absolute inset-0 bg-black/60" onClick={() => !busy && onClose()} aria-hidden="true" />
      <div className="relative flex h-[min(96vh,900px)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-[#FFE08A]/40 bg-white shadow-2xl">
        <div className="shrink-0 bg-gradient-to-br from-[#1a1610] via-[#0f0d08] to-[#0c0b08] px-4 py-3 text-white sm:px-5 sm:py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#FFC81C]">Inventarios</p>
              <h2 id="modal-auditoria-inventario-titulo" className="mt-1 text-lg font-bold">
                Auditoría de inventario
              </h2>
              <p className="mt-0.5 truncate text-xs text-white/75">{puntoVenta}</p>
              {datos ? (
                <p className="mt-1 text-[11px] text-white/65">
                  {etiquetaFuenteCatalogoAuditoria(datos.fuenteCatalogo)}
                  {datos.incluyeCatalogoPos ? " + POS" : ""} · Generado{" "}
                  {fechaHoraColombia(new Date(datos.generadoIso))}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="rounded-lg p-1.5 text-white/80 hover:bg-white/10 disabled:opacity-50"
              aria-label="Cerrar"
            >
              ✕
            </button>
          </div>
          {r ? (
            <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
              <span className="rounded-md bg-white/10 px-2 py-1">
                <strong className="text-[#FFE08A]">{r.productosCatalogo}</strong> productos
              </span>
              <span className="rounded-md bg-red-500/25 px-2 py-1">
                <strong>{r.criticos}</strong> críticos
              </span>
              <span className="rounded-md bg-amber-500/25 px-2 py-1">
                <strong>{r.advertencias}</strong> advertencias
              </span>
              <span className="rounded-md bg-white/10 px-2 py-1">
                <strong>{r.saldoNegativo}</strong> saldo negativo
              </span>
              <span className="rounded-md bg-white/10 px-2 py-1">
                <strong>{r.duplicadosCatalogo}</strong> duplicados catálogo
              </span>
              <span className="rounded-md bg-white/10 px-2 py-1">
                <strong>{r.descripcionesSimilares}</strong> nombres similares
              </span>
            </div>
          ) : null}
        </div>

        <div className="relative min-h-0 flex-1 bg-slate-100">
          {busy && !listo ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
              <div
                className="h-10 w-10 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent"
                aria-hidden
              />
              <p className="text-sm font-medium text-slate-700">Generando informe y PDF…</p>
              <p className="max-w-sm text-xs text-slate-500">
                Leyendo catálogo, saldos legacy/ensamble y hasta {datos?.limiteMovimientos ?? 500} movimientos.
              </p>
            </div>
          ) : errorMsg ? (
            <div className="flex h-full items-center justify-center p-6">
              <p className="max-w-md rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
                {errorMsg}
              </p>
            </div>
          ) : pdfUrl ? (
            <iframe
              title="Vista previa auditoría inventario PDF"
              src={pdfUrl}
              className="h-full w-full border-0 bg-white"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-600">Sin vista previa.</div>
          )}
        </div>

        <div className="flex shrink-0 flex-col gap-2 border-t border-gray-200 bg-gray-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <p className="text-xs text-gray-600">
            {listo && datos
              ? `Archivo: ${nombreArchivoAuditoriaInventarioPdf(datos.puntoVenta, datos.generadoIso)}`
              : "El PDF incluye duplicados de SKU, saldos y recomendaciones por producto."}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
            >
              Cerrar
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onRegenerar}
              className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50"
            >
              {busy ? "Actualizando…" : "Actualizar informe"}
            </button>
            <button
              type="button"
              disabled={busy || !listo}
              onClick={onDescargar}
              className="rounded-xl border border-emerald-700 bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              Descargar PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
