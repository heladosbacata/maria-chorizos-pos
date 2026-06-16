"use client";

type Props = {
  cargando: boolean;
  puedeEmitirFe: boolean;
  habilitado: boolean;
  emisorNit: string;
  error: string | null;
  fePendientes: number;
  onRecargar?: () => void;
};

export default function PosFeEstadoCajaPanel({
  cargando,
  puedeEmitirFe,
  habilitado,
  emisorNit,
  error,
  fePendientes,
  onRecargar,
}: Props) {
  if (cargando) {
    return (
      <p className="mt-2 rounded-lg border border-gray-100 bg-gray-50 px-2.5 py-2 text-[11px] text-gray-600">
        Consultando habilitación DIAN…
      </p>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      {puedeEmitirFe ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-[11px] leading-snug text-emerald-950">
          <span className="font-semibold">Facturación electrónica activa</span>
          {emisorNit ? ` · NIT emisor ${emisorNit}` : null}
        </p>
      ) : (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] leading-snug text-amber-950">
          {habilitado && !emisorNit.replace(/\D/g, "").length
            ? "Falta el NIT emisor en Habilitaciones DIAN."
            : error
              ? `DIAN no disponible: ${error}`
              : "La factura electrónica no está habilitada en este punto. Configurala en Espacio franquiciado → Habilitaciones DIAN."}
        </p>
      )}

      {fePendientes > 0 ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2 text-[11px] leading-snug text-rose-950">
          <span className="font-semibold">
            {fePendientes} factura{fePendientes === 1 ? "" : "s"} pendiente{fePendientes === 1 ? "" : "s"} de envío a DIAN
          </span>
          . Se reintentará al recuperar conexión; revisá también Ventas y comprobantes.
        </p>
      ) : null}

      {onRecargar ? (
        <button
          type="button"
          onClick={() => void onRecargar()}
          className="text-[11px] font-semibold text-primary-700 underline-offset-2 hover:underline"
        >
          Actualizar estado DIAN
        </button>
      ) : null}
    </div>
  );
}
