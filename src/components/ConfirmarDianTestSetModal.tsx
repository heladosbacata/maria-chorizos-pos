"use client";

type Props = {
  open: boolean;
  testSetId: string;
  dianResolutionNumber: string;
  prefijoFactura: string;
  consecutivoDesde: string;
  consecutivoHasta: string;
  puntoVenta: string | null;
  guardando: boolean;
  onCancelar: () => void;
  onConfirmar: () => void;
};

export default function ConfirmarDianTestSetModal({
  open,
  testSetId,
  dianResolutionNumber,
  prefijoFactura,
  consecutivoDesde,
  consecutivoHasta,
  puntoVenta,
  guardando,
  onCancelar,
  onConfirmar,
}: Props) {
  if (!open) return null;

  const formatOrDash = (v: string) => (v.trim() ? v.trim() : "—");

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirmar-test-set-titulo"
    >
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl">
        <h2 id="confirmar-test-set-titulo" className="text-lg font-bold text-gray-900">
          ¿Confirmás estos datos DIAN?
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">
          Revisá que coincidan con tu resolución electrónica y el set de pruebas en la DIAN. Al confirmar, se enviará a{" "}
          <strong>Grupo Bacatá</strong> para registrar en Alegra y asociar prefijos.
        </p>
        <div className="mt-4 space-y-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-900/80">Punto de venta</p>
            <p className="font-medium text-amber-950">{puntoVenta?.trim() || "—"}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-900/80">Set de pruebas (TestSetId)</p>
            <p className="break-all font-mono font-semibold text-gray-900">{testSetId.trim()}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-900/80">Número de resolución</p>
            <p className="font-mono font-semibold text-gray-900">{formatOrDash(dianResolutionNumber)}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-900/80">Prefijo de facturación</p>
            <p className="font-mono font-semibold text-gray-900">{formatOrDash(prefijoFactura)}</p>
          </div>
          {consecutivoDesde.trim() || consecutivoHasta.trim() ? (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-900/80">
                Rango de consecutivos
              </p>
              <p className="font-mono text-gray-900">
                {consecutivoDesde.trim() || "—"} al {consecutivoHasta.trim() || "—"}
              </p>
            </div>
          ) : null}
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={guardando}
            onClick={onCancelar}
            className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
          >
            Corregir
          </button>
          <button
            type="button"
            disabled={guardando}
            onClick={onConfirmar}
            className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {guardando ? "Enviando…" : "Sí, enviar a Grupo Bacatá"}
          </button>
        </div>
      </div>
    </div>
  );
}
