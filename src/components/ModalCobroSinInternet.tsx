"use client";

export interface ModalCobroSinInternetProps {
  open: boolean;
  onGuardarEnCaja: () => void;
  onVolver: () => void;
}

/**
 * Aviso cuando falla el envío del cobro por red. Texto pensado para cajeros (sin términos técnicos).
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
          No hay internet
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          Ahora no pudimos enviar este cobro por internet (revisa el WiFi o los datos del equipo).
        </p>
        <p className="mt-2 text-sm font-medium text-slate-800">¿Guardar el cobro en esta caja de todas formas?</p>
        <ul className="mt-3 list-inside list-disc space-y-1.5 text-sm text-slate-600">
          <li>
            <span className="font-medium text-slate-800">Sí:</span> el cobro queda registrado aquí y puedes seguir
            vendiendo. Cuando vuelva la conexión, se envía solo a la oficina.
          </li>
          <li>
            <span className="font-medium text-slate-800">No:</span> no se guarda; puedes intentar otra vez cuando
            haya internet.
          </li>
        </ul>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onVolver}
            className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
          >
            No, volver
          </button>
          <button
            type="button"
            onClick={onGuardarEnCaja}
            className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-md transition-colors hover:bg-emerald-700"
          >
            Sí, guardar en esta caja
          </button>
        </div>
      </div>
    </div>
  );
}
