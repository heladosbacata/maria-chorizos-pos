"use client";

export interface ModalCobroSinInternetProps {
  open: boolean;
  onGuardarEnCaja: () => void;
  onVolver: () => void;
}

/**
 * Cuando `fetch` al WMS falla (sin red, servidor caído, CORS, etc.). El texto no culpa solo al “internet”.
 * z-index por encima de RegistrarPagoPanel (z-100).
 */
export default function ModalCobroSinInternet({ open, onGuardarEnCaja, onVolver }: ModalCobroSinInternetProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-end justify-center bg-black/45 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-cobro-sin-internet-titulo"
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6">
        <h2 id="modal-cobro-sin-internet-titulo" className="text-lg font-semibold text-slate-900">
          La venta no pudo salir ahora
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          Cada cobro se envía al sistema de la empresa. Esta vez no hubo comunicación: puede ser el internet de la
          tienda o que el sistema de la oficina no esté disponible. No es que la caja esté “mala”: puedes guardar la
          venta aquí y seguir cobrando; cuando haya comunicación, se manda sola.
        </p>
        <p className="mt-3 text-base font-semibold text-slate-900">¿La guardamos en esta caja?</p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onVolver}
            className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
          >
            No, cancelar
          </button>
          <button
            type="button"
            onClick={onGuardarEnCaja}
            className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-md transition-colors hover:bg-emerald-700"
          >
            Sí, guardar aquí
          </button>
        </div>
      </div>
    </div>
  );
}
