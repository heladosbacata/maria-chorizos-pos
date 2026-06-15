"use client";

export interface ModalInformeCierreCorreoProps {
  open: boolean;
  onClose: () => void;
  para: string;
  onParaChange: (v: string) => void;
  correosAdicionales: string[];
  correosSeleccionados: string[];
  onToggleCorreo: (email: string, seleccionado: boolean) => void;
  onQuitarCorreo: (email: string) => void;
  nuevoCorreo: string;
  onNuevoCorreoChange: (v: string) => void;
  onAgregarCorreo: () => void;
  errorAgregarCorreo: string | null;
  defaultsLoading: boolean;
  submitting: boolean;
  onConfirm: () => void;
  errorMsg: string | null;
}

/**
 * Paso previo al cierre: destinatario (franquiciado) y correos adicionales guardados para futuros cierres.
 */
export default function ModalInformeCierreCorreo({
  open,
  onClose,
  para,
  onParaChange,
  correosAdicionales,
  correosSeleccionados,
  onToggleCorreo,
  onQuitarCorreo,
  nuevoCorreo,
  onNuevoCorreoChange,
  onAgregarCorreo,
  errorAgregarCorreo,
  defaultsLoading,
  submitting,
  onConfirm,
  errorMsg,
}: ModalInformeCierreCorreoProps) {
  if (!open) return null;

  const selSet = new Set(correosSeleccionados.map((e) => e.trim().toLowerCase()));
  const cantidadSeleccionados = correosAdicionales.filter((e) =>
    selSet.has(e.trim().toLowerCase())
  ).length;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-informe-correo-titulo"
    >
      <div className="absolute inset-0 bg-black/50" onClick={() => !submitting && onClose()} aria-hidden="true" />
      <div className="relative flex max-h-[min(92vh,720px)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-5 py-4">
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
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <p className="text-sm text-gray-600">
            Se adjunta el informe de cierre de turno. El destinatario principal es el correo del franquiciado. Podés
            agregar otros correos: quedan guardados en este punto de venta y podés elegir cuáles reciben el informe en
            cada cierre.
          </p>
          {defaultsLoading ? (
            <p className="mt-4 text-sm text-gray-500">Cargando correo sugerido…</p>
          ) : (
            <div className="mt-4 space-y-4">
              <div>
                <label htmlFor="informe-correo-para" className="mb-1 block text-xs font-medium text-gray-700">
                  Correo del franquiciado (destinatario principal)
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
                <p className="mb-2 text-xs font-semibold text-gray-800">Correos adicionales del turno</p>
                <div className="flex gap-2">
                  <input
                    id="informe-correo-nuevo"
                    type="email"
                    autoComplete="email"
                    value={nuevoCorreo}
                    onChange={(e) => onNuevoCorreoChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        onAgregarCorreo();
                      }
                    }}
                    disabled={submitting}
                    placeholder="otro@ejemplo.com"
                    className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50"
                  />
                  <button
                    type="button"
                    disabled={submitting || !nuevoCorreo.trim()}
                    onClick={onAgregarCorreo}
                    className="shrink-0 rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-900 disabled:opacity-50"
                  >
                    Agregar
                  </button>
                </div>
                {errorAgregarCorreo ? (
                  <p className="mt-1.5 text-xs text-red-600" role="alert">
                    {errorAgregarCorreo}
                  </p>
                ) : null}
                {correosAdicionales.length === 0 ? (
                  <p className="mt-2 text-xs text-gray-500">
                    Sin correos adicionales guardados. Agregá uno y se enviará en los próximos cierres de turno.
                  </p>
                ) : (
                  <ul className="mt-2 max-h-40 space-y-1.5 overflow-y-auto">
                    {correosAdicionales.map((email) => {
                      const checked = selSet.has(email.trim().toLowerCase());
                      return (
                        <li
                          key={email}
                          className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-2 py-1.5"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={submitting}
                            onChange={(e) => onToggleCorreo(email, e.target.checked)}
                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            aria-label={`Enviar informe a ${email}`}
                          />
                          <span className="min-w-0 flex-1 truncate text-sm text-gray-800">{email}</span>
                          <button
                            type="button"
                            disabled={submitting}
                            onClick={() => onQuitarCorreo(email)}
                            className="shrink-0 rounded px-1.5 py-0.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                            aria-label={`Quitar ${email}`}
                          >
                            Quitar
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {correosAdicionales.length > 0 ? (
                  <p className="mt-2 text-[11px] text-gray-500">
                    {cantidadSeleccionados === 0
                      ? "Marcá al menos un correo adicional o solo se enviará al franquiciado y a servicio al cliente."
                      : `En este cierre se enviará a ${cantidadSeleccionados} correo(s) adicional(es) marcado(s).`}
                  </p>
                ) : null}
              </div>
            </div>
          )}
          {errorMsg ? (
            <p className="mt-3 text-sm text-red-600" role="alert">
              {errorMsg}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 gap-3 border-t border-gray-200 bg-gray-50 px-5 py-4">
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
