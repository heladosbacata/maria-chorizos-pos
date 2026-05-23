"use client";

import type { NivelDetalleReporteVentas } from "@/lib/ventas-reporte-pos-data";
import { etiquetaNivelDetalle } from "@/lib/ventas-reporte-pos-data";

const NIVELES: {
  id: NivelDetalleReporteVentas;
  titulo: string;
  descripcion: string;
}[] = [
  {
    id: "resumen",
    titulo: "Resumen ejecutivo",
    descripcion: "Totales, ticket promedio y desglose por tipo de documento. Ideal para una vista rápida.",
  },
  {
    id: "transacciones",
    titulo: "Con listado de ventas",
    descripcion: "Incluye cada cobro, cotización o remisión del período con cliente y valor.",
  },
  {
    id: "detallado",
    titulo: "Detallado con productos",
    descripcion:
      "Todo lo anterior más ranking de productos vendidos y el detalle de ítems por cada documento.",
  },
];

export interface ModalReporteVentasPosProps {
  open: boolean;
  onClose: () => void;
  puntoVenta: string;
  desdeYmd: string;
  hastaYmd: string;
  cantidadDocumentos: number;
  /** Documentos en el rango filtrado (para el PDF). */
  cantidadEnRango: number;
  totalVigente: number;
  nivel: NivelDetalleReporteVentas;
  onNivelChange: (n: NivelDetalleReporteVentas) => void;
  emailPara: string;
  onEmailParaChange: (v: string) => void;
  emailCc: string;
  onEmailCcChange: (v: string) => void;
  busy: "idle" | "pdf" | "correo";
  onDescargarPdf: () => void;
  onEnviarCorreo: () => void;
  errorMsg: string | null;
  exitoMsg: string | null;
}

export default function ModalReporteVentasPos({
  open,
  onClose,
  puntoVenta,
  desdeYmd,
  hastaYmd,
  cantidadDocumentos,
  cantidadEnRango,
  totalVigente,
  nivel,
  onNivelChange,
  emailPara,
  onEmailParaChange,
  emailCc,
  onEmailCcChange,
  busy,
  onDescargarPdf,
  onEnviarCorreo,
  errorMsg,
  exitoMsg,
}: ModalReporteVentasPosProps) {
  if (!open) return null;

  const ocupado = busy !== "idle";

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-reporte-ventas-titulo"
    >
      <div className="absolute inset-0 bg-black/55" onClick={() => !ocupado && onClose()} aria-hidden="true" />
      <div className="relative flex max-h-[min(92vh,760px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[#FFE08A]/40 bg-white shadow-2xl">
        <div className="shrink-0 bg-gradient-to-br from-[#1a1610] via-[#0f0d08] to-[#0c0b08] px-5 py-4 text-white">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#FFC81C]">Reporte premium</p>
              <h2 id="modal-reporte-ventas-titulo" className="mt-1 text-lg font-bold">
                Reporte de ventas en PDF
              </h2>
              <p className="mt-1 text-xs text-white/75">
                {puntoVenta} · {desdeYmd === hastaYmd ? desdeYmd : `${desdeYmd} → ${hastaYmd}`}
              </p>
            </div>
            <button
              type="button"
              disabled={ocupado}
              onClick={onClose}
              className="rounded-lg p-1.5 text-white/80 hover:bg-white/10 disabled:opacity-50"
              aria-label="Cerrar"
            >
              ✕
            </button>
          </div>
          <p className="mt-3 rounded-lg bg-white/10 px-3 py-2 text-sm">
            <strong className="text-[#FFE08A]">{cantidadEnRango}</strong> documento
            {cantidadEnRango === 1 ? "" : "s"} en el rango · Total vigente{" "}
            <strong>{totalVigente.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 })}</strong>
            {cantidadDocumentos !== cantidadEnRango ? (
              <span className="mt-1 block text-xs text-white/70">
                ({cantidadDocumentos} guardados en total; ampliá fechas si el rango está vacío)
              </span>
            ) : null}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <p className="text-sm font-semibold text-gray-900">Nivel de detalle</p>
          <p className="mt-0.5 text-xs text-gray-600">Elegí cuánta información incluir en el PDF.</p>
          <div className="mt-3 space-y-2">
            {NIVELES.map((opt) => {
              const sel = nivel === opt.id;
              return (
                <label
                  key={opt.id}
                  className={`flex cursor-pointer gap-3 rounded-xl border-2 p-3 transition-colors ${
                    sel
                      ? "border-[#FFC81C] bg-amber-50/80 shadow-sm"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="nivel-reporte-ventas"
                    checked={sel}
                    disabled={ocupado}
                    onChange={() => onNivelChange(opt.id)}
                    className="mt-1 h-4 w-4 border-gray-300 text-emerald-700 focus:ring-emerald-500"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-gray-900">{opt.titulo}</span>
                    <span className="mt-0.5 block text-xs text-gray-600">{opt.descripcion}</span>
                    {sel ? (
                      <span className="mt-1 inline-block text-[10px] font-medium uppercase tracking-wide text-emerald-800">
                        {etiquetaNivelDetalle(opt.id)}
                      </span>
                    ) : null}
                  </span>
                </label>
              );
            })}
          </div>

          <div className="mt-5 border-t border-gray-100 pt-4">
            <p className="text-sm font-semibold text-gray-900">Enviar por correo (opcional)</p>
            <p className="mt-0.5 text-xs text-gray-600">Se adjunta el mismo PDF. Si dejás vacío, solo descargás.</p>
            <label className="mt-3 block">
              <span className="text-xs font-medium text-gray-700">Para</span>
              <input
                type="email"
                value={emailPara}
                onChange={(e) => onEmailParaChange(e.target.value)}
                disabled={ocupado}
                placeholder="franquiciado@ejemplo.com"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-gray-50"
              />
            </label>
            <label className="mt-2 block">
              <span className="text-xs font-medium text-gray-700">Con copia (opcional)</span>
              <input
                type="text"
                value={emailCc}
                onChange={(e) => onEmailCcChange(e.target.value)}
                disabled={ocupado}
                placeholder="correo1@ejemplo.com, otro@ejemplo.com"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-gray-50"
              />
            </label>
          </div>

          {errorMsg ? (
            <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
              {errorMsg}
            </p>
          ) : null}
          {exitoMsg ? (
            <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900" role="status">
              {exitoMsg}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col gap-2 border-t border-gray-200 bg-gray-50 px-5 py-4 sm:flex-row">
          <button
            type="button"
            disabled={ocupado}
            onClick={onClose}
            className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50 sm:flex-1"
          >
            Cerrar
          </button>
          <button
            type="button"
            disabled={ocupado || cantidadEnRango === 0}
            onClick={onDescargarPdf}
            className="rounded-xl border border-emerald-700 bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50 sm:flex-1"
          >
            {busy === "pdf" ? "Generando PDF…" : "Descargar PDF"}
          </button>
          <button
            type="button"
            disabled={ocupado || cantidadEnRango === 0 || !emailPara.trim()}
            onClick={onEnviarCorreo}
            className="rounded-xl bg-[#FFC81C] px-4 py-2.5 text-sm font-semibold text-gray-900 hover:opacity-90 disabled:opacity-50 sm:flex-1"
          >
            {busy === "correo" ? "Enviando…" : "Enviar por correo"}
          </button>
        </div>
      </div>
    </div>
  );
}
