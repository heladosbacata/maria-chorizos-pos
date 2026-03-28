"use client";

export interface ModalInformeCierreCorreoProps {
  open: boolean;
  onClose: () => void;
  para: string;
  onParaChange: (v: string) => void;
  cc: string;
  onCcChange: (v: string) => void;
  defaultsLoading: boolean;
  submitting: boolean;
  onConfirm: () => void;
  errorMsg: string | null;
}

/**
 * Paso previo al cierre: destinatario (franquiciado) y copia opcional para el informe por Resend.
 */
export default function ModalInformeCierreCorreo({
  open,
  onClose,
  para,
  onParaChange,
  cc,
  onCcChange,
  defaultsLoading,
  submitting,
  onConfirm,
  errorMsg,
}: ModalInformeCierreCorreoProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-informe-correo-titulo"
    >
      <div className="absolute inset-0 bg-black/50" onClick={() => !submitting && onClose()} aria-hidden="true" />
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h2 id="modal-informe-correo-titulo" className="text-lg font-semibold text-gray-900">
            Enviar cierre por correo
          </h2>
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
            aria-label="Cerrar"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-5 py-4">
          <p className="text-sm text-gray-600">
            Se adjunta el informe de cierre de turno. Puedes cambiar el destinatario y añadir copia (varios correos
            separados por coma).
          </p>
          {defaultsLoading ? (
            <p className="mt-4 text-sm text-gray-500">Cargando correo sugerido…</p>
          ) : (
            <div className="mt-4 space-y-3">
              <div>
                <label htmlFor="informe-correo-para" className="mb-1 block text-xs font-medium text-gray-700">
                  Correo del franquiciado (destinatario)
                </label>
                <input
                  id="informe-correo-para"
                  type="email"
                  autoComplete="email"
                  value={para}
                  onChange={(e) => onParaChange(e.target.value)}
                  disabled={submitting}
                  placeholder="correo@ejemplo.com"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50"
                />
              </div>
              <div>
                <label htmlFor="informe-correo-cc" className="mb-1 block text-xs font-medium text-gray-700">
                  Con copia (opcional)
                </label>
                <input
                  id="informe-correo-cc"
                  type="text"
                  value={cc}
                  onChange={(e) => onCcChange(e.target.value)}
                  disabled={submitting}
                  placeholder="otro@ejemplo.com, contador@ejemplo.com"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50"
                />
              </div>
            </div>
          )}
          {errorMsg ? (
            <p className="mt-3 text-sm text-red-600" role="alert">
              {errorMsg}
            </p>
          ) : null}
        </div>
        <div className="flex gap-3 border-t border-gray-200 bg-gray-50 px-5 py-4">
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            className="flex-1 rounded-lg border border-blue-300 bg-white py-2.5 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50"
          >
            Volver
          </button>
          <button
            type="button"
            disabled={submitting || defaultsLoading || !para.trim()}
            onClick={onConfirm}
            className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? "Enviando…" : "Enviar y cerrar turno"}
          </button>
        </div>
      </div>
    </div>
  );
}
