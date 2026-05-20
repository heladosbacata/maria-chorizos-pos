"use client";

import { mediosTransferenciaParaCliente } from "@/lib/pos-domicilios-medios-transferencia";
import {
  MEDIOS_TRANSFERENCIA_VACIOS,
  type MediosTransferenciaConfig,
} from "@/types/pos-domicilios-medios-transferencia";

type Props = {
  open: boolean;
  onClose: () => void;
  medios: MediosTransferenciaConfig;
  titulo?: string;
};

export default function MediosTransferenciaClienteModal({
  open,
  onClose,
  medios,
  titulo = "Datos para transferencia",
}: Props) {
  if (!open) return null;

  const filas = mediosTransferenciaParaCliente(medios ?? MEDIOS_TRANSFERENCIA_VACIOS);

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="medios-transferencia-titulo"
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/55 backdrop-blur-sm"
        aria-label="Cerrar"
        onClick={onClose}
      />
      <div className="relative z-[1] w-full max-w-md overflow-hidden rounded-2xl border border-cyan-200 bg-white shadow-2xl">
        <div className="border-b border-cyan-100 bg-gradient-to-r from-cyan-700 to-teal-600 px-5 py-4 text-white">
          <h2 id="medios-transferencia-titulo" className="text-lg font-bold">
            {titulo}
          </h2>
          <p className="mt-1 text-xs text-cyan-100">
            Realizá la transferencia con estos datos y luego adjuntá el comprobante en el chat si te lo piden.
          </p>
        </div>
        <div className="max-h-[min(60vh,420px)] overflow-y-auto px-5 py-4">
          {filas.length === 0 ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
              El punto de venta aún no configuró cuentas para transferencia. Escribí en el chat o elegí otro medio de
              pago.
            </p>
          ) : (
            <ul className="space-y-3">
              {filas.map((f) => (
                <li
                  key={f.id}
                  className="rounded-xl border border-gray-200 bg-gray-50/80 px-4 py-3"
                >
                  <p className="text-xs font-bold uppercase tracking-wide text-cyan-800">{f.etiqueta}</p>
                  <p className="mt-1 break-all font-mono text-sm font-semibold text-gray-900">{f.valor}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="border-t border-gray-100 bg-gray-50 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg bg-cyan-700 py-2.5 text-sm font-semibold text-white hover:bg-cyan-800"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
