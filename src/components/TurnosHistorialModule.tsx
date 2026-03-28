"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { TurnoCerradoV1 } from "@/lib/turno-historial-local";
import { listarTurnosCerrados } from "@/lib/turno-historial-local";
import {
  sumarMediosPagoVentas,
  type MediosPagoVentaGuardados,
} from "@/lib/medios-pago-venta";
import {
  agregarProductosEnVentas,
  listarVentasPuntoVenta,
  ventasDelTurnoActivos,
} from "@/lib/pos-ventas-local-storage";
import { fechaHoraColombia, finDiaColombiaMs, inicioDiaColombiaMs } from "@/lib/fecha-colombia";
import {
  csvAgregadoProductos,
  nombreArchivoInformeTurno,
  textoInformeTurno,
  triggerDescargaTexto,
} from "@/lib/turno-informe-texto";

function fmtCop(n: number): string {
  return n.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtFechaCorta(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return fechaHoraColombia(d, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function turnoCierreEnRango(t: TurnoCerradoV1, desde: string, hasta: string): boolean {
  const c = new Date(t.cierreIso).getTime();
  if (Number.isNaN(c)) return false;
  const d0 = desde.trim();
  const d1 = hasta.trim();
  if (d0) {
    const start = inicioDiaColombiaMs(d0);
    if (Number.isNaN(start) || c < start) return false;
  }
  if (d1) {
    const end = finDiaColombiaMs(d1);
    if (Number.isNaN(end) || c > end) return false;
  }
  return true;
}

/** Turno abierto ahora mismo (pendiente de cierre). */
export type TurnoActivoHistorialProps = {
  inicio: Date;
  cajeroNombre: string;
  turnoSesionId: string;
  /** Total acumulado enviado al WMS en este turno (sidebar). */
  totalVentasAcumuladoWms: number;
};

type TurnosHistorialModuleProps = {
  uid: string;
  puntoVenta: string;
  turnoActivo?: TurnoActivoHistorialProps | null;
};

export default function TurnosHistorialModule({
  uid,
  puntoVenta,
  turnoActivo = null,
}: TurnosHistorialModuleProps) {
  const pv = puntoVenta.trim();
  const [lista, setLista] = useState<TurnoCerradoV1[]>([]);
  const [filtroFechaDesde, setFiltroFechaDesde] = useState("");
  const [filtroFechaHasta, setFiltroFechaHasta] = useState("");
  const [detalle, setDetalle] = useState<TurnoCerradoV1 | null>(null);
  const [detalleTurnoActivo, setDetalleTurnoActivo] = useState(false);

  const recargar = useCallback(() => {
    if (!uid || !pv) {
      setLista([]);
      return;
    }
    setLista(listarTurnosCerrados(uid, pv));
  }, [uid, pv]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  useEffect(() => {
    if (!turnoActivo) setDetalleTurnoActivo(false);
  }, [turnoActivo]);

  const filtroActivo = Boolean(filtroFechaDesde.trim() || filtroFechaHasta.trim());

  const listaFiltrada = useMemo(() => {
    if (!filtroActivo) return lista;
    return lista.filter((t) => turnoCierreEnRango(t, filtroFechaDesde, filtroFechaHasta));
  }, [lista, filtroActivo, filtroFechaDesde, filtroFechaHasta]);

  const sinTurnosCerrados = lista.length === 0;
  const sinResultadosEnFiltro = filtroActivo && lista.length > 0 && listaFiltrada.length === 0;

  const ventasTurnoEnCurso = useMemo(() => {
    if (!uid.trim() || !turnoActivo || !pv) return [];
    return ventasDelTurnoActivos(
      listarVentasPuntoVenta(uid, pv),
      turnoActivo.turnoSesionId,
      turnoActivo.inicio
    );
  }, [uid, turnoActivo, pv, turnoActivo?.totalVentasAcumuladoWms]);

  const mediosTurnoEnCurso = useMemo(() => {
    const rows = ventasTurnoEnCurso
      .map((v) => v.mediosPago)
      .filter((m): m is MediosPagoVentaGuardados => Boolean(m));
    return rows.length
      ? sumarMediosPagoVentas(rows)
      : ({
          efectivo: 0,
          tarjeta: 0,
          pagosLinea: 0,
          otros: 0,
          detalleLineas: [] as { tipo: string; monto: number }[],
        } satisfies MediosPagoVentaGuardados);
  }, [ventasTurnoEnCurso]);

  const agregadoTurnoEnCurso = useMemo(
    () => agregarProductosEnVentas(ventasTurnoEnCurso),
    [ventasTurnoEnCurso]
  );

  const sumaTicketsTurnoEnCurso = useMemo(
    () => ventasTurnoEnCurso.reduce((s, v) => s + v.total, 0),
    [ventasTurnoEnCurso]
  );

  const tituloDetalle = useMemo(() => {
    if (!detalle) return "";
    return `Turno ${fmtFechaCorta(detalle.inicioIso)} → ${fmtFechaCorta(detalle.cierreIso)}`;
  }, [detalle]);

  const descargar = (t: TurnoCerradoV1) => {
    triggerDescargaTexto(nombreArchivoInformeTurno(t), textoInformeTurno(t));
  };

  const descargarCsv = (t: TurnoCerradoV1) => {
    const csv = csvAgregadoProductos(t.agregadoProductos);
    const nombre = nombreArchivoInformeTurno(t).replace(/\.txt$/i, ".csv");
    triggerDescargaTexto(nombre, "\uFEFF" + csv);
  };

  if (!pv) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
        No hay punto de venta asignado; no se puede listar el historial de turnos.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-gray-900">Historial de turnos</h2>
            <p className="mt-1 text-sm text-gray-600">
              Turno activo (si hay uno abierto), turnos cerrados en este equipo y sus resúmenes. Al cerrar un turno se
              guarda el detalle y se puede descargar el informe. Opcionalmente puedes acotar los turnos cerrados por
              fecha de cierre.
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-gray-100 pt-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="turnos-filtro-desde" className="text-xs font-medium text-gray-600">
              Cierre desde
            </label>
            <input
              id="turnos-filtro-desde"
              type="date"
              value={filtroFechaDesde}
              onChange={(e) => setFiltroFechaDesde(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="turnos-filtro-hasta" className="text-xs font-medium text-gray-600">
              Cierre hasta
            </label>
            <input
              id="turnos-filtro-hasta"
              type="date"
              value={filtroFechaHasta}
              onChange={(e) => setFiltroFechaHasta(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>
          {filtroActivo ? (
            <button
              type="button"
              onClick={() => {
                setFiltroFechaDesde("");
                setFiltroFechaHasta("");
              }}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Quitar filtro
            </button>
          ) : null}
          <button
            type="button"
            onClick={recargar}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Actualizar
          </button>
        </div>
        {filtroActivo && lista.length > 0 ? (
          <p className="mt-2 text-xs text-gray-500">
            Mostrando {listaFiltrada.length} de {lista.length}{" "}
            {lista.length === 1 ? "turno cerrado" : "turnos cerrados"} (por fecha de cierre).
          </p>
        ) : null}
      </div>

      {turnoActivo && (
        <div className="overflow-x-auto rounded-xl border-2 border-emerald-300/80 bg-gradient-to-br from-emerald-50/90 via-white to-teal-50/40 shadow-[0_8px_30px_-12px_rgba(5,120,90,0.2)]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-200/70 bg-emerald-600/10 px-4 py-2">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-40" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
              </span>
              <span className="text-xs font-bold uppercase tracking-wide text-emerald-900">
                Turno activo · pendiente de cierre
              </span>
            </div>
            <p className="text-xs text-emerald-800/90">
              Cierra el turno desde el menú izquierdo cuando termines.
            </p>
          </div>
          <table className="min-w-full text-sm">
            <thead className="bg-white/60 text-left text-xs font-semibold uppercase tracking-wide text-emerald-900/70">
              <tr>
                <th className="px-4 py-2">Estado</th>
                <th className="px-4 py-2">Apertura</th>
                <th className="px-4 py-2">Cajero</th>
                <th className="px-4 py-2 text-right">Ventas (turno)</th>
                <th className="px-4 py-2 text-right">Tickets</th>
                <th className="px-4 py-2 text-center">Detalle</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-emerald-100 bg-white/40">
                <td className="px-4 py-3">
                  <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-900">
                    En curso
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-900">
                  {fmtFechaCorta(turnoActivo.inicio.toISOString())}
                </td>
                <td className="max-w-[12rem] truncate px-4 py-3 text-gray-800" title={turnoActivo.cajeroNombre}>
                  {turnoActivo.cajeroNombre}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <span className="font-semibold text-gray-900">
                    $ {fmtCop(turnoActivo.totalVentasAcumuladoWms)}
                  </span>
                  {Math.abs(turnoActivo.totalVentasAcumuladoWms - sumaTicketsTurnoEnCurso) > 0.02 ? (
                    <span className="mt-0.5 block text-[11px] font-normal text-gray-500">
                      Tickets locales: $ {fmtCop(sumaTicketsTurnoEnCurso)}
                    </span>
                  ) : null}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-gray-800">{ventasTurnoEnCurso.length}</td>
                <td className="px-4 py-3 text-center">
                  <button
                    type="button"
                    onClick={() => setDetalleTurnoActivo(true)}
                    className="inline-flex rounded-lg border border-emerald-200 bg-white p-2 text-emerald-800 shadow-sm hover:bg-emerald-50"
                    title="Ver ventas y medios de pago del turno en curso"
                    aria-label="Ver detalle del turno activo"
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                      />
                    </svg>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {sinTurnosCerrados && !turnoActivo ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/80 p-10 text-center text-sm text-gray-600">
          Aún no hay turnos cerrados registrados en este navegador para <strong className="text-gray-800">{pv}</strong>.
        </div>
      ) : !sinTurnosCerrados ? (
        <div className="space-y-2">
          {turnoActivo ? (
            <h3 className="text-sm font-semibold text-gray-800">Turnos cerrados</h3>
          ) : null}
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Cierre</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Cajero</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-700">Ventas</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-700">Tickets</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-700">Dif. cierre</th>
                <th className="px-4 py-3 text-center font-semibold text-gray-700">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sinResultadosEnFiltro ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-600">
                    No hay turnos cerrados en el rango de fechas elegido.{" "}
                    <button
                      type="button"
                      onClick={() => {
                        setFiltroFechaDesde("");
                        setFiltroFechaHasta("");
                      }}
                      className="font-medium text-primary-600 underline hover:text-primary-700"
                    >
                      Quitar filtro
                    </button>
                  </td>
                </tr>
              ) : null}
              {listaFiltrada.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50/80">
                  <td className="whitespace-nowrap px-4 py-3 text-gray-800">{fmtFechaCorta(t.cierreIso)}</td>
                  <td className="max-w-[10rem] truncate px-4 py-3 text-gray-700" title={t.cajero.nombreDisplay}>
                    {t.cajero.nombreDisplay}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-gray-900">
                    $ {fmtCop(t.totalVentasRegistradas)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-gray-700">{t.numTickets}</td>
                  <td
                    className={`whitespace-nowrap px-4 py-3 text-right font-medium ${
                      Math.abs(t.cierre.diferencia) > 0.009 ? "text-red-600" : "text-gray-800"
                    }`}
                  >
                    $ {fmtCop(t.cierre.diferencia)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex flex-wrap items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => setDetalle(t)}
                        className="inline-flex rounded-lg border border-gray-200 p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                        title="Ver detalle"
                        aria-label="Ver detalle del turno"
                      >
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                          />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => descargar(t)}
                        className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
                      >
                        TXT
                      </button>
                      <button
                        type="button"
                        onClick={() => descargarCsv(t)}
                        className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
                      >
                        CSV
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      ) : turnoActivo ? (
        <p className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 text-center text-sm text-gray-600">
          Cuando cierres turnos, aparecerán aquí abajo en el historial.
        </p>
      ) : null}

      {detalleTurnoActivo && turnoActivo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="detalle-turno-activo-titulo"
        >
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setDetalleTurnoActivo(false)}
            aria-hidden="true"
          />
          <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-emerald-100 bg-emerald-50/50 px-5 py-4">
              <h2 id="detalle-turno-activo-titulo" className="text-lg font-semibold text-gray-900">
                Turno en curso · desde {fmtFechaCorta(turnoActivo.inicio.toISOString())}
              </h2>
              <button
                type="button"
                onClick={() => setDetalleTurnoActivo(false)}
                className="rounded p-1 text-gray-500 hover:bg-gray-100"
                aria-label="Cerrar"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-sm text-gray-700">
              <p className="rounded-lg border border-amber-100 bg-amber-50/80 px-3 py-2 text-xs text-amber-900">
                Este turno sigue abierto. Los totales de cierre se confirman al cerrarlo desde el menú lateral.
              </p>
              <p className="mt-3 text-gray-600">
                Punto: <span className="font-medium text-gray-900">{pv}</span> · Cajero:{" "}
                <span className="font-medium text-gray-900">{turnoActivo.cajeroNombre}</span>
              </p>
              <p className="mt-1 text-gray-600">
                Total ventas acumulado (turno):{" "}
                <span className="font-semibold text-gray-900">$ {fmtCop(turnoActivo.totalVentasAcumuladoWms)}</span>
              </p>
              <div className="mt-4 rounded-lg border border-gray-100 bg-gray-50 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Medios de pago (tickets hasta ahora)</p>
                <p className="mt-1">Efectivo: $ {fmtCop(mediosTurnoEnCurso.efectivo)}</p>
                <p>Tarjeta / datáfono: $ {fmtCop(mediosTurnoEnCurso.tarjeta)}</p>
                <p>Pagos en línea: $ {fmtCop(mediosTurnoEnCurso.pagosLinea)}</p>
                <p>Otros: $ {fmtCop(mediosTurnoEnCurso.otros)}</p>
              </div>
              <h3 className="mt-5 font-semibold text-gray-900">Productos vendidos (turno actual)</h3>
              <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded border border-gray-100 bg-white p-2 text-xs">
                {agregadoTurnoEnCurso.length === 0 ? (
                  <li className="text-gray-500">Aún no hay tickets locales en este turno.</li>
                ) : (
                  agregadoTurnoEnCurso.map((p) => (
                    <li key={p.clave} className="flex justify-between gap-2 border-b border-gray-50 pb-1 last:border-0">
                      <span className="min-w-0 flex-1 truncate">{p.descripcion}</span>
                      <span className="shrink-0 text-gray-600">
                        ×{p.cantidad} → $ {fmtCop(p.subtotal)}
                      </span>
                    </li>
                  ))
                )}
              </ul>
              <h3 className="mt-4 font-semibold text-gray-900">Tickets</h3>
              <ul className="mt-2 space-y-3 text-xs">
                {ventasTurnoEnCurso.length === 0 ? (
                  <li className="text-gray-500">Sin tickets registrados aún en este navegador.</li>
                ) : (
                  ventasTurnoEnCurso.map((v) => (
                    <li key={v.id} className="rounded border border-gray-100 bg-gray-50/80 p-2">
                      <p className="font-medium text-gray-900">
                        $ {fmtCop(v.total)} · {fmtFechaCorta(v.isoTimestamp)}
                      </p>
                      {v.pagoResumen?.trim() ? (
                        <p className="mt-0.5 text-gray-600">{v.pagoResumen.trim()}</p>
                      ) : null}
                      <ul className="mt-1 space-y-0.5 pl-2 text-gray-600">
                        {v.lineas.map((li) => (
                          <li key={li.lineId}>
                            {li.descripcion}
                            {li.detalleVariante ? ` (${li.detalleVariante})` : ""} × {li.cantidad}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))
                )}
              </ul>
            </div>
            <div className="border-t border-gray-200 bg-gray-50 px-5 py-3">
              <button
                type="button"
                onClick={() => setDetalleTurnoActivo(false)}
                className="rounded-lg bg-gray-800 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-900"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {detalle && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="detalle-turno-titulo"
        >
          <div className="absolute inset-0 bg-black/50" onClick={() => setDetalle(null)} aria-hidden="true" />
          <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <h2 id="detalle-turno-titulo" className="text-lg font-semibold text-gray-900">
                {tituloDetalle}
              </h2>
              <button
                type="button"
                onClick={() => setDetalle(null)}
                className="rounded p-1 text-gray-500 hover:bg-gray-100"
                aria-label="Cerrar"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-sm text-gray-700">
              <p className="text-gray-600">
                Punto: <span className="font-medium text-gray-900">{detalle.puntoVenta}</span> · Cajero:{" "}
                <span className="font-medium text-gray-900">{detalle.cajero.nombreDisplay}</span>
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Medios (tickets)</p>
                  <p className="mt-1">Efectivo: $ {fmtCop(detalle.totalesMediosVentas.efectivo)}</p>
                  <p>Tarjeta / datáfono: $ {fmtCop(detalle.totalesMediosVentas.tarjeta)}</p>
                  <p>Pagos en línea: $ {fmtCop(detalle.totalesMediosVentas.pagosLinea)}</p>
                  <p>Otros: $ {fmtCop(detalle.totalesMediosVentas.otros)}</p>
                </div>
                <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Cierre declarado</p>
                  <p className="mt-1">Efectivo real: $ {fmtCop(detalle.cierre.efectivoReal)}</p>
                  <p>Tarjeta: $ {fmtCop(detalle.cierre.tarjeta)}</p>
                  <p>En línea: $ {fmtCop(detalle.cierre.pagosLinea)}</p>
                  <p>Otros: $ {fmtCop(detalle.cierre.otrosMedios)}</p>
                </div>
              </div>
              <h3 className="mt-5 font-semibold text-gray-900">Productos vendidos</h3>
              <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded border border-gray-100 bg-white p-2 text-xs">
                {detalle.agregadoProductos.map((p) => (
                  <li key={p.clave} className="flex justify-between gap-2 border-b border-gray-50 pb-1 last:border-0">
                    <span className="min-w-0 flex-1 truncate">{p.descripcion}</span>
                    <span className="shrink-0 text-gray-600">
                      ×{p.cantidad} → $ {fmtCop(p.subtotal)}
                    </span>
                  </li>
                ))}
              </ul>
              <h3 className="mt-4 font-semibold text-gray-900">Tickets</h3>
              <ul className="mt-2 space-y-3 text-xs">
                {detalle.ventas.map((v) => (
                  <li key={v.id} className="rounded border border-gray-100 bg-gray-50/80 p-2">
                    <p className="font-medium text-gray-900">
                      $ {fmtCop(v.total)} · {fmtFechaCorta(v.isoTimestamp)}
                    </p>
                    {v.pagoResumen?.trim() ? (
                      <p className="mt-0.5 text-gray-600">{v.pagoResumen.trim()}</p>
                    ) : null}
                    <ul className="mt-1 space-y-0.5 pl-2 text-gray-600">
                      {v.lineas.map((li) => (
                        <li key={li.lineId}>
                          {li.descripcion}
                          {li.detalleVariante ? ` (${li.detalleVariante})` : ""} × {li.cantidad}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-wrap gap-2 border-t border-gray-200 bg-gray-50 px-5 py-3">
              <button
                type="button"
                onClick={() => descargar(detalle)}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Descargar informe (TXT)
              </button>
              <button
                type="button"
                onClick={() => descargarCsv(detalle)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-100"
              >
                Descargar productos (CSV)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
