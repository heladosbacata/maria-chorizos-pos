"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fechaColombia,
  fechaHoraColombia,
  mediodiaColombiaDesdeYmd,
  ymdColombiaMenosDias,
} from "@/lib/fecha-colombia";
import { auth } from "@/lib/firebase";
import { listarVentasPosCloud } from "@/lib/pos-ventas-cloud-client";
import {
  listarAnulacionesFiltradasPorFecha,
  listarVentasPuntoVentaEnEsteEquipo,
  mergeVentasReporteNubeLocal,
  resumenPorDia,
  resumenUltimos7Dias,
  ymdDesdeFechaLocal,
  type ResumenDiaCajero,
  type VentaGuardadaLocal,
} from "@/lib/pos-ventas-local-storage";
import type { MovimientoCajaTurno, TipoMovimientoCaja } from "@/lib/turno-movimientos-caja";

export interface CajeroReportesDashboardProps {
  /** Firebase uid: sesión y carga de ventas en nube. El reporte agrega por punto de venta (todos los cajeros). */
  uid: string | null;
  puntoVenta: string | null;
  /** Contador / soporte: muestra el mensaje de error crudo si falla la lista en nube (p. ej. índice Firestore). En caja habitual se omite. */
  mostrarDetalleErrorNube?: boolean;
  turnoActivo?: {
    abierto: boolean;
    totalIngresoEfectivo: number;
    totalRetiroEfectivo: number;
    movimientosCaja: MovimientoCajaTurno[];
    onRegistrarMovimiento?: (input: { tipo: TipoMovimientoCaja; monto: number; motivo: string }) => {
      ok: true;
    } | { ok: false; message: string };
  } | null;
}

function formatMoney(n: number): string {
  return `$ ${n.toLocaleString("es-CO", { maximumFractionDigits: 0 })}`;
}

function medalla(i: number): string {
  if (i === 0) return "🥇";
  if (i === 1) return "🥈";
  if (i === 2) return "🥉";
  return "";
}

export default function CajeroReportesDashboard({
  uid,
  puntoVenta,
  mostrarDetalleErrorNube = false,
  turnoActivo = null,
}: CajeroReportesDashboardProps) {
  const u = (uid ?? "").trim();
  const pv = (puntoVenta ?? "").trim();
  const hoyYmd = useMemo(() => ymdDesdeFechaLocal(new Date()), []);
  const [diaSeleccionado, setDiaSeleccionado] = useState(hoyYmd);
  const [anulDesde, setAnulDesde] = useState(() => ymdColombiaMenosDias(hoyYmd, 29));
  const [anulHasta, setAnulHasta] = useState(hoyYmd);
  const [tick, setTick] = useState(0);
  const [ventasNube, setVentasNube] = useState<VentaGuardadaLocal[] | null>(null);
  const [nubeAviso, setNubeAviso] = useState<string | null>(null);
  /** `null` = cargando o aún no hubo intento con sesión+PV; `true` = GET nube OK; `false` = falló. */
  const [nubeSincronizada, setNubeSincronizada] = useState<boolean | null>(null);
  const [tipoMovimiento, setTipoMovimiento] = useState<TipoMovimientoCaja>("ingreso");
  const [montoMovimiento, setMontoMovimiento] = useState("");
  const [motivoMovimiento, setMotivoMovimiento] = useState("");

  useEffect(() => {
    if (!u || !pv) {
      setVentasNube(null);
      setNubeAviso(null);
      setNubeSincronizada(null);
      return;
    }
    let cancelled = false;
    setNubeAviso(null);
    setNubeSincronizada(null);
    (async () => {
      try {
        const token = await auth?.currentUser?.getIdToken();
        if (!token || cancelled) return;
        const rows = await listarVentasPosCloud(token);
        if (!cancelled) {
          setVentasNube(rows);
          setNubeAviso(null);
          setNubeSincronizada(true);
        }
      } catch (e) {
        if (!cancelled) {
          setVentasNube([]);
          setNubeSincronizada(false);
          const msg =
            e instanceof Error
              ? e.message
              : "No se pudieron cargar las ventas desde la nube; solo se muestran las guardadas en este equipo.";
          setNubeAviso(mostrarDetalleErrorNube ? msg : null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [u, pv, tick, mostrarDetalleErrorNube]);

  const ventas = useMemo(() => {
    void tick;
    const local = listarVentasPuntoVentaEnEsteEquipo(pv);
    if (ventasNube === null) return local;
    return mergeVentasReporteNubeLocal(local, ventasNube);
  }, [pv, tick, ventasNube]);

  const refrescar = useCallback(() => setTick((t) => t + 1), []);

  const resumenDia: ResumenDiaCajero = useMemo(
    () => resumenPorDia(ventas, diaSeleccionado),
    [ventas, diaSeleccionado]
  );

  const semana = useMemo(() => {
    const [y, m, d] = diaSeleccionado.split("-").map(Number);
    const base = new Date(y, m - 1, d);
    return resumenUltimos7Dias(ventas, base);
  }, [ventas, diaSeleccionado]);

  const maxCant = resumenDia.productos[0]?.cantidad ?? 1;

  const anulacionesLista = useMemo(
    () => listarAnulacionesFiltradasPorFecha(ventas, anulDesde, anulHasta),
    [ventas, anulDesde, anulHasta]
  );

  const ayerYmd = useMemo(() => {
    const [y, m, d] = hoyYmd.split("-").map(Number);
    const dt = new Date(y, m - 1, d - 1);
    return ymdDesdeFechaLocal(dt);
  }, [hoyYmd]);

  if (!u) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center text-amber-950">
        <p className="text-lg font-semibold">No hay sesión</p>
        <p className="mt-2 text-sm opacity-90">Inicia sesión para ver el resumen de ventas del punto en este equipo.</p>
      </div>
    );
  }

  if (!pv) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center text-amber-950">
        <p className="text-lg font-semibold">Falta el punto de venta</p>
        <p className="mt-2 text-sm opacity-90">Configura tu perfil para ver las ventas del punto.</p>
      </div>
    );
  }

  const fechaLegible = fechaColombia(mediodiaColombiaDesdeYmd(diaSeleccionado), {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const netoCajaTurno = (turnoActivo?.totalIngresoEfectivo ?? 0) - (turnoActivo?.totalRetiroEfectivo ?? 0);

  const registrarMovimientoCaja = () => {
    if (!turnoActivo?.abierto || !turnoActivo.onRegistrarMovimiento) {
      window.alert("No hay un turno abierto para registrar movimientos de caja.");
      return;
    }
    const montoNormalizado = Number(String(montoMovimiento).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."));
    const r = turnoActivo.onRegistrarMovimiento({
      tipo: tipoMovimiento,
      monto: Number.isFinite(montoNormalizado) ? montoNormalizado : 0,
      motivo: motivoMovimiento,
    });
    if (!r.ok) {
      window.alert(r.message);
      return;
    }
    setMontoMovimiento("");
    setMotivoMovimiento("");
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8 pb-10">
      <header className="text-center">
        <h2 className="text-3xl font-extrabold tracking-tight text-gray-900 md:text-4xl">Resumen de ventas del punto</h2>
        <p className="mt-2 text-base text-gray-600">
          Total cobrado con carrito en{" "}
          <span className="font-semibold text-primary-700">{pv}</span>
          , <strong className="font-medium text-gray-800">todos los cajeros</strong>
          {nubeSincronizada === true
            ? " (nube + ventas guardadas en este navegador)."
            : " (solo ventas guardadas en este navegador; sin nube no ves otros equipos)."}
        </p>
        <p className="mt-1 text-xs text-gray-500">
          Solo se guardan ventas hechas con el carrito (cobro con productos). Los montos manuales del día no aparecen aquí.
          Las ventas <strong className="font-medium text-gray-700">anuladas</strong> no suman en totales ni en productos del día.
        </p>
        {nubeAviso ? (
          <p className="mx-auto mt-3 max-w-xl rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
            {nubeAviso}
          </p>
        ) : nubeSincronizada === true ? (
          <p className="mt-2 text-xs text-emerald-800">
            La nube agrupa ventas del mismo punto de venta aunque las haya cobrado otro cajero o equipo (si sincronizaron).
          </p>
        ) : null}
      </header>

      {/* Selector rápido */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => setDiaSeleccionado(hoyYmd)}
          className={`rounded-full px-5 py-2.5 text-sm font-bold shadow-sm transition-all ${
            diaSeleccionado === hoyYmd
              ? "bg-brand-yellow text-gray-900 ring-2 ring-brand-yellow/60"
              : "bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50"
          }`}
        >
          Hoy
        </button>
        <button
          type="button"
          onClick={() => setDiaSeleccionado(ayerYmd)}
          className={`rounded-full px-5 py-2.5 text-sm font-bold shadow-sm transition-all ${
            diaSeleccionado === ayerYmd
              ? "bg-brand-yellow text-gray-900 ring-2 ring-brand-yellow/60"
              : "bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50"
          }`}
        >
          Ayer
        </button>
        <label className="flex items-center gap-2 rounded-full bg-white px-4 py-2 ring-1 ring-gray-200">
          <span className="text-sm font-medium text-gray-600">Otro día</span>
          <input
            type="date"
            value={diaSeleccionado}
            onChange={(e) => e.target.value && setDiaSeleccionado(e.target.value)}
            className="rounded-lg border-0 bg-transparent text-sm font-semibold text-gray-900 focus:ring-0"
          />
        </label>
        <button
          type="button"
          onClick={refrescar}
          className="rounded-full border border-primary-200 bg-primary-50 px-4 py-2.5 text-sm font-semibold text-primary-800 hover:bg-primary-100"
        >
          Actualizar
        </button>
      </div>

      <p className="text-center text-lg font-medium capitalize text-gray-800">{fechaLegible}</p>

      {/* Tarjetas grandes */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 p-6 text-white shadow-lg">
          <p className="text-sm font-medium text-emerald-100">Total del día</p>
          <p className="mt-2 text-4xl font-black tabular-nums tracking-tight md:text-5xl">
            {formatMoney(resumenDia.totalPesos)}
          </p>
          <p className="mt-2 text-sm text-emerald-100">Suma de cobros con carrito (todo el PV en vista)</p>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 p-6 text-white shadow-lg">
          <p className="text-sm font-medium text-sky-100">Unidades vendidas</p>
          <p className="mt-2 text-4xl font-black tabular-nums md:text-5xl">{resumenDia.unidadesVendidas}</p>
          <p className="mt-2 text-sm text-sky-100">Unidades en todos los tickets del día (PV)</p>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 p-6 text-gray-900 shadow-lg">
          <p className="text-sm font-bold text-gray-800/90">Tickets del día</p>
          <p className="mt-2 text-4xl font-black tabular-nums md:text-5xl">{resumenDia.numTickets}</p>
          <p className="mt-2 text-sm font-medium text-gray-800/80">Tickets del día en el punto de venta</p>
        </div>
      </div>

      <section className="rounded-2xl border-2 border-emerald-100 bg-white p-5 shadow-sm md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-bold text-gray-900">Movimientos de caja</h3>
            <p className="mt-1 text-sm text-gray-500">
              Registra ingresos o retiros manuales del turno para que el cierre de caja quede sincronizado.
            </p>
          </div>
          <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm">
            <p className="font-semibold text-emerald-900">Neto del turno</p>
            <p className={`mt-1 text-lg font-bold tabular-nums ${netoCajaTurno >= 0 ? "text-emerald-700" : "text-red-600"}`}>
              {formatMoney(netoCajaTurno)}
            </p>
          </div>
        </div>

        {!turnoActivo?.abierto ? (
          <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Debes tener un turno abierto para registrar ingresos y retiros de caja.
          </p>
        ) : (
          <>
            <div className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-2xl border border-gray-100 bg-gray-50/70 p-4">
                <p className="text-sm font-semibold text-gray-900">Registrar movimiento</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setTipoMovimiento("ingreso")}
                    className={`rounded-full px-4 py-2 text-sm font-semibold ${
                      tipoMovimiento === "ingreso"
                        ? "bg-emerald-600 text-white"
                        : "bg-white text-gray-700 ring-1 ring-gray-200"
                    }`}
                  >
                    Ingreso
                  </button>
                  <button
                    type="button"
                    onClick={() => setTipoMovimiento("retiro")}
                    className={`rounded-full px-4 py-2 text-sm font-semibold ${
                      tipoMovimiento === "retiro"
                        ? "bg-rose-600 text-white"
                        : "bg-white text-gray-700 ring-1 ring-gray-200"
                    }`}
                  >
                    Retiro
                  </button>
                </div>
                <div className="mt-4 grid gap-3">
                  <label className="text-sm">
                    <span className="mb-1 block font-medium text-gray-700">Monto</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={montoMovimiento}
                      onChange={(e) => setMontoMovimiento(e.target.value)}
                      placeholder="20000"
                      className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none ring-0 focus:border-emerald-400"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block font-medium text-gray-700">Motivo</span>
                    <textarea
                      rows={3}
                      value={motivoMovimiento}
                      onChange={(e) => setMotivoMovimiento(e.target.value)}
                      placeholder={tipoMovimiento === "ingreso" ? "Ej. franquiciado entregó efectivo adicional" : "Ej. compra de aseo"}
                      className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none ring-0 focus:border-emerald-400"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={registrarMovimientoCaja}
                    className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700"
                  >
                    Guardar movimiento
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-100 bg-gray-50/70 p-4">
                <p className="text-sm font-semibold text-gray-900">Resumen del turno</p>
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between gap-3">
                    <span className="text-gray-600">Ingresos acumulados</span>
                    <span className="font-semibold text-emerald-700">{formatMoney(turnoActivo.totalIngresoEfectivo)}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-gray-600">Retiros acumulados</span>
                    <span className="font-semibold text-rose-700">{formatMoney(turnoActivo.totalRetiroEfectivo)}</span>
                  </div>
                  <div className="flex justify-between gap-3 border-t border-gray-200 pt-2">
                    <span className="text-gray-700">Neto ingresos - retiros</span>
                    <span className={`font-bold ${netoCajaTurno >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                      {formatMoney(netoCajaTurno)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-gray-100 bg-white">
              <div className="border-b border-gray-100 px-4 py-3">
                <p className="text-sm font-semibold text-gray-900">Historial del turno</p>
              </div>
              {turnoActivo.movimientosCaja.length === 0 ? (
                <p className="px-4 py-6 text-sm text-gray-500">Aún no hay ingresos ni retiros registrados en este turno.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-left text-gray-600">
                      <tr>
                        <th className="px-4 py-2.5 font-semibold">Fecha</th>
                        <th className="px-4 py-2.5 font-semibold">Tipo</th>
                        <th className="px-4 py-2.5 font-semibold">Motivo</th>
                        <th className="px-4 py-2.5 font-semibold">Registró</th>
                        <th className="px-4 py-2.5 text-right font-semibold">Monto</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {turnoActivo.movimientosCaja.map((mov) => (
                        <tr key={mov.id}>
                          <td className="px-4 py-2.5 text-gray-700">
                            {fechaHoraColombia(new Date(mov.creadoEnIso), { dateStyle: "short", timeStyle: "short" })}
                          </td>
                          <td className="px-4 py-2.5">
                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                                mov.tipo === "ingreso" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                              }`}
                            >
                              {mov.tipo === "ingreso" ? "Ingreso" : "Retiro"}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-gray-800">{mov.motivo}</td>
                          <td className="px-4 py-2.5 text-gray-600">{mov.creadoPor.nombreDisplay}</td>
                          <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-gray-900">
                            {formatMoney(mov.monto)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </section>

      {/* Semana visual */}
      <section className="rounded-2xl border-2 border-gray-100 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-bold text-gray-900">7 días en vista (punto de venta)</h3>
        <p className="text-sm text-gray-500">
          Cada columna es un día; la de la derecha es el día seleccionado. Tocá una para cambiar.
        </p>
        <div className="mt-4 grid grid-cols-7 gap-2">
          {semana.map((dia) => {
            const altura = Math.min(100, dia.totalPesos > 0 ? 20 + (dia.totalPesos / (Math.max(...semana.map((s) => s.totalPesos), 1) || 1)) * 80 : 8);
            const activo = dia.fechaYmd === diaSeleccionado;
            return (
              <button
                key={dia.fechaYmd}
                type="button"
                onClick={() => setDiaSeleccionado(dia.fechaYmd)}
                className={`flex flex-col items-center rounded-xl p-2 text-center transition-all ${
                  activo ? "bg-brand-yellow/30 ring-2 ring-brand-yellow" : "bg-gray-50 hover:bg-gray-100"
                }`}
              >
                <span className="text-[10px] font-semibold uppercase leading-tight text-gray-500">{dia.labelCorto}</span>
                <div
                  className="mt-2 w-full max-w-[48px] rounded-t-md bg-gradient-to-t from-primary-600 to-primary-400"
                  style={{ height: `${altura}px`, minHeight: "8px" }}
                  title={formatMoney(dia.totalPesos)}
                />
                <span className="mt-1 text-[10px] font-bold text-gray-800">{dia.numTickets > 0 ? `${dia.numTickets} tk` : "—"}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Productos del día */}
      <section className="rounded-2xl border-2 border-gray-100 bg-white p-5 shadow-sm md:p-8">
        <h3 className="text-xl font-bold text-gray-900">Productos más vendidos ese día</h3>
        <p className="text-sm text-gray-500">Ordenados por cantidad — todo el PV ese día</p>

        {resumenDia.productos.length === 0 ? (
          <div className="mt-8 rounded-xl border border-dashed border-gray-200 bg-gray-50/80 py-14 text-center">
            <p className="text-4xl">🛒</p>
            <p className="mt-4 text-lg font-semibold text-gray-700">No hay ventas guardadas para este día</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
              Cobrá desde <strong className="text-gray-700">Ventas e ingresos</strong> con productos en el carrito. Cada cobro exitoso se anota aquí en este navegador.
            </p>
          </div>
        ) : (
          <ul className="mt-6 space-y-5">
            {resumenDia.productos.map((p, idx) => {
              const pct = maxCant > 0 ? Math.round((p.cantidad / maxCant) * 100) : 0;
              return (
                <li key={p.clave} className="rounded-xl border border-gray-100 bg-gray-50/50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <span className="text-2xl leading-none">{medalla(idx)}</span>
                      <div className="min-w-0">
                        <p className="text-base font-bold leading-snug text-gray-900 md:text-lg">{p.descripcion}</p>
                        <p className="mt-0.5 font-mono text-xs text-gray-500">{p.sku}</p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-2xl font-black tabular-nums text-primary-700 md:text-3xl">{p.cantidad}</p>
                      <p className="text-xs font-medium text-gray-500">unidades</p>
                      <p className="mt-1 text-sm font-semibold text-emerald-700">{formatMoney(p.subtotal)}</p>
                    </div>
                  </div>
                  <div className="mt-3 h-3 overflow-hidden rounded-full bg-gray-200">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary-500 to-emerald-500 transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border-2 border-rose-100 bg-white p-5 shadow-sm md:p-8">
        <h3 className="text-xl font-bold text-gray-900">Anulaciones</h3>
        <p className="mt-1 text-sm text-gray-500">
          Recibos anulados desde caja (motivo obligatorio). Fecha según cuándo se anuló, en horario Colombia.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2 ring-1 ring-gray-200">
            <span className="text-sm font-medium text-gray-600">Desde</span>
            <input
              type="date"
              value={anulDesde}
              onChange={(e) => e.target.value && setAnulDesde(e.target.value)}
              className="rounded-lg border-0 bg-transparent text-sm font-semibold text-gray-900 focus:ring-0"
            />
          </label>
          <label className="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2 ring-1 ring-gray-200">
            <span className="text-sm font-medium text-gray-600">Hasta</span>
            <input
              type="date"
              value={anulHasta}
              onChange={(e) => e.target.value && setAnulHasta(e.target.value)}
              className="rounded-lg border-0 bg-transparent text-sm font-semibold text-gray-900 focus:ring-0"
            />
          </label>
        </div>

        {anulacionesLista.length === 0 ? (
          <p className="mt-8 text-center text-sm text-gray-500">No hay anulaciones en este rango de fechas.</p>
        ) : (
          <div className="mt-6 overflow-x-auto rounded-xl border border-gray-100">
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead className="bg-rose-50/80">
                <tr>
                  <th className="px-3 py-2.5 text-left font-bold text-gray-800">Fecha anulación</th>
                  <th className="px-3 py-2.5 text-left font-bold text-gray-800">Recibo</th>
                  <th className="px-3 py-2.5 text-right font-bold text-gray-800">Total</th>
                  <th className="px-3 py-2.5 text-left font-bold text-gray-800">Motivo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 bg-white">
                {anulacionesLista.map((a: VentaGuardadaLocal) => {
                  const t = a.anuladaEnIso ? new Date(a.anuladaEnIso) : null;
                  const fechaAnul =
                    t && !Number.isNaN(t.getTime())
                      ? fechaHoraColombia(t, { dateStyle: "short", timeStyle: "short" })
                      : "—";
                  return (
                    <tr key={a.id} className="hover:bg-gray-50/80">
                      <td className="whitespace-nowrap px-3 py-2.5 text-gray-700">{fechaAnul}</td>
                      <td className="max-w-[140px] truncate px-3 py-2.5 font-mono text-xs text-gray-600" title={a.id}>
                        {a.id.slice(0, 18)}…
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums text-gray-900">
                        {formatMoney(a.total)}
                      </td>
                      <td className="max-w-md px-3 py-2.5 text-gray-700">{a.anuladaMotivo ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
