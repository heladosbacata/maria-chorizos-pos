"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  agregarMovimientoComprasGastos,
  agregarProveedorComprasGastos,
  eliminarMovimientoComprasGastos,
  eliminarProveedorComprasGastos,
  leerBundleComprasGastos,
  listarMovimientosEnRango,
  nombreProveedorEnBundle,
  rangoMes,
  totalRegistradoComprasGastosEnRango,
  type CgBundle,
  type CgMovimiento,
  type CgTipoMovimiento,
} from "@/lib/compras-gastos-franquicia-storage";
import { ymdColombia } from "@/lib/fecha-colombia";
import { parsePesosCopInput } from "@/lib/pesos-cop-input";

export interface ComprasGastosFranquiciaPanelProps {
  puntoVenta: string | null;
  onVolver?: () => void;
  onIrAPyg?: () => void;
}

function formatCop(n: number): string {
  return n.toLocaleString("es-CO", { maximumFractionDigits: 0, minimumFractionDigits: 0 });
}

function ymDesdeYmd(ymd: string): string {
  return ymd.slice(0, 7);
}

export default function ComprasGastosFranquiciaPanel({
  puntoVenta,
  onVolver,
  onIrAPyg,
}: ComprasGastosFranquiciaPanelProps) {
  const pv = (puntoVenta ?? "").replace(/\u00a0/g, " ").trim();
  const hoyYmd = ymdColombia(new Date());
  const ymActual = ymDesdeYmd(hoyYmd);
  const { desde: defaultDesde, hasta: defaultHasta } = rangoMes(ymActual);

  const [bundle, setBundle] = useState<CgBundle>(() => (pv ? leerBundleComprasGastos(pv) : { proveedores: [], movimientos: [] }));
  const [filtroDesde, setFiltroDesde] = useState(defaultDesde);
  const [filtroHasta, setFiltroHasta] = useState(defaultHasta);
  const [tick, setTick] = useState(0);

  const [nuevoProvNombre, setNuevoProvNombre] = useState("");
  const [nuevoProvNotas, setNuevoProvNotas] = useState("");

  const [movTipo, setMovTipo] = useState<CgTipoMovimiento>("compra");
  const [movFecha, setMovFecha] = useState(hoyYmd);
  const [movProveedorId, setMovProveedorId] = useState("");
  const [movDesc, setMovDesc] = useState("");
  const [movMontoRaw, setMovMontoRaw] = useState("");
  const [enviandoMov, setEnviandoMov] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const refrescar = useCallback(() => {
    if (!pv) return;
    setBundle(leerBundleComprasGastos(pv));
    setTick((t) => t + 1);
  }, [pv]);

  useEffect(() => {
    if (!pv) {
      setBundle({ proveedores: [], movimientos: [] });
      return;
    }
    refrescar();
  }, [pv, refrescar]);

  const movimientosFiltrados = useMemo(() => {
    void tick;
    if (!pv) return [];
    return listarMovimientosEnRango(pv, filtroDesde, filtroHasta);
  }, [pv, filtroDesde, filtroHasta, tick]);

  const totalFiltrado = useMemo(() => {
    void tick;
    if (!pv) return 0;
    return totalRegistradoComprasGastosEnRango(pv, filtroDesde, filtroHasta);
  }, [pv, filtroDesde, filtroHasta, tick]);

  const totalMesPyg = useMemo(() => {
    void tick;
    if (!pv) return 0;
    const { desde, hasta } = rangoMes(ymActual);
    return totalRegistradoComprasGastosEnRango(pv, desde, hasta);
  }, [pv, ymActual, tick]);

  const aplicarMesActual = useCallback(() => {
    const { desde, hasta } = rangoMes(ymActual);
    setFiltroDesde(desde);
    setFiltroHasta(hasta);
  }, [ymActual]);

  const aplicarUltimos30 = useCallback(() => {
    const hasta = hoyYmd;
    const d = new Date(`${hoyYmd}T12:00:00-05:00`);
    d.setDate(d.getDate() - 29);
    const desde = d.toLocaleDateString("sv-SE", { timeZone: "America/Bogota" });
    setFiltroDesde(desde);
    setFiltroHasta(hasta);
  }, [hoyYmd]);

  const onAgregarProveedor = useCallback(() => {
    if (!pv) return;
    const p = agregarProveedorComprasGastos(pv, nuevoProvNombre, nuevoProvNotas);
    if (!p) {
      setMensaje("Escribí el nombre del proveedor.");
      return;
    }
    setMensaje(null);
    setNuevoProvNombre("");
    setNuevoProvNotas("");
    refrescar();
  }, [pv, nuevoProvNombre, nuevoProvNotas, refrescar]);

  const onEliminarProveedor = useCallback(
    (id: string) => {
      if (!pv) return;
      const ok = eliminarProveedorComprasGastos(pv, id);
      if (!ok) {
        setMensaje("No se puede borrar: hay compras asociadas a ese proveedor.");
        return;
      }
      setMensaje(null);
      if (movProveedorId === id) setMovProveedorId("");
      refrescar();
    },
    [pv, movProveedorId, refrescar]
  );

  const onAgregarMovimiento = useCallback(async () => {
    if (!pv) return;
    const monto = parsePesosCopInput(movMontoRaw);
    if (monto <= 0) {
      setMensaje("Indicá un monto mayor a cero.");
      return;
    }
    if (movTipo === "compra" && !movProveedorId) {
      setMensaje("Las compras deben tener proveedor. Creá uno arriba o elegí de la lista.");
      return;
    }
    setEnviandoMov(true);
    setMensaje(null);
    try {
      const mov = agregarMovimientoComprasGastos(pv, {
        fechaYmd: movFecha,
        tipo: movTipo,
        proveedorId: movTipo === "compra" ? movProveedorId : movProveedorId || null,
        descripcion: movDesc,
        monto,
      });
      if (!mov) {
        setMensaje("No se pudo guardar. Revisá fecha y monto.");
        return;
      }
      setMovDesc("");
      setMovMontoRaw("");
      refrescar();
    } finally {
      setEnviandoMov(false);
    }
  }, [pv, movMontoRaw, movTipo, movProveedorId, movFecha, movDesc, refrescar]);

  const onEliminarMov = useCallback(
    (id: string) => {
      if (!pv) return;
      eliminarMovimientoComprasGastos(pv, id);
      refrescar();
    },
    [pv, refrescar]
  );

  if (!pv) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50/90 p-8 text-center text-amber-950">
        <p className="text-lg font-semibold">Sin punto de venta</p>
        <p className="mt-2 text-sm">Asigná un punto de venta en tu perfil para registrar compras y gastos.</p>
        {onVolver ? (
          <button
            type="button"
            onClick={onVolver}
            className="mt-6 rounded-xl border-2 border-amber-300 bg-white px-5 py-2.5 text-sm font-semibold text-amber-900 hover:bg-amber-100"
          >
            Volver
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          {onVolver ? (
            <button
              type="button"
              onClick={onVolver}
              className="mb-3 inline-flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Configuración
            </button>
          ) : null}
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-600 text-2xl text-white shadow-md">
              🧾
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Compras y gastos</h2>
              <p className="text-sm text-gray-600">
                Registro por fecha; se suma al <strong className="font-semibold text-gray-800">PYG del punto de venta</strong> del mismo mes.
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          <p className="text-xs text-gray-500">
            Total mes actual (PYG): <span className="font-bold text-gray-900">${formatCop(totalMesPyg)}</span>
          </p>
          {onIrAPyg ? (
            <button
              type="button"
              onClick={onIrAPyg}
              className="rounded-xl border-2 border-primary-500 bg-primary-50 px-4 py-2 text-sm font-semibold text-primary-900 hover:bg-primary-100"
            >
              Abrir PYG del punto de venta
            </button>
          ) : null}
        </div>
      </header>

      {mensaje ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">{mensaje}</p>
      ) : null}

      {/* Proveedores */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-gray-500">Proveedores</h3>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="block min-w-[12rem] flex-1">
            <span className="text-xs font-medium text-gray-600">Nombre</span>
            <input
              value={nuevoProvNombre}
              onChange={(e) => setNuevoProvNombre(e.target.value)}
              placeholder="Ej. Distribuidora ABC"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
            />
          </label>
          <label className="block min-w-[10rem] flex-1">
            <span className="text-xs font-medium text-gray-600">Notas (opcional)</span>
            <input
              value={nuevoProvNotas}
              onChange={(e) => setNuevoProvNotas(e.target.value)}
              placeholder="Teléfono, NIT…"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
            />
          </label>
          <button
            type="button"
            onClick={onAgregarProveedor}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700"
          >
            Agregar proveedor
          </button>
        </div>
        {bundle.proveedores.length > 0 ? (
          <ul className="mt-4 divide-y divide-gray-100 rounded-lg border border-gray-100">
            {bundle.proveedores.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <span>
                  <span className="font-medium text-gray-900">{p.nombre}</span>
                  {p.notas ? <span className="ml-2 text-gray-500">· {p.notas}</span> : null}
                </span>
                <button
                  type="button"
                  onClick={() => onEliminarProveedor(p.id)}
                  className="text-xs font-semibold text-red-600 hover:underline"
                >
                  Eliminar
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-gray-500">Todavía no hay proveedores. Agregá al menos uno para registrar compras.</p>
        )}
      </section>

      {/* Filtros */}
      <section className="rounded-2xl border border-gray-200 bg-gray-50/80 p-5">
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-gray-500">Filtrar movimientos</h3>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="text-xs font-medium text-gray-600">Desde</span>
            <input
              type="date"
              value={filtroDesde}
              onChange={(e) => setFiltroDesde(e.target.value)}
              className="mt-1 block rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600">Hasta</span>
            <input
              type="date"
              value={filtroHasta}
              onChange={(e) => setFiltroHasta(e.target.value)}
              className="mt-1 block rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <button
            type="button"
            onClick={aplicarMesActual}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-800 hover:bg-gray-100"
          >
            Mes actual
          </button>
          <button
            type="button"
            onClick={aplicarUltimos30}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-800 hover:bg-gray-100"
          >
            Últimos 30 días
          </button>
        </div>
        <p className="mt-3 text-sm font-semibold text-gray-800">
          Total en el rango: <span className="tabular-nums text-primary-700">${formatCop(totalFiltrado)}</span>
        </p>
      </section>

      {/* Nuevo movimiento */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-gray-500">Registrar compra o gasto</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="text-xs font-medium text-gray-600">Tipo</span>
            <select
              value={movTipo}
              onChange={(e) => setMovTipo(e.target.value as CgTipoMovimiento)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="compra">Compra a proveedor (mercancía, insumos)</option>
              <option value="gasto">Gasto operativo (servicio, arriendo puntual, etc.)</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600">Fecha</span>
            <input
              type="date"
              value={movFecha}
              onChange={(e) => setMovFecha(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600">
              Proveedor {movTipo === "compra" ? "(obligatorio)" : "(opcional)"}
            </span>
            <select
              value={movProveedorId}
              onChange={(e) => setMovProveedorId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">{movTipo === "compra" ? "Elegí proveedor…" : "Sin proveedor"}</option>
              {bundle.proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className="text-xs font-medium text-gray-600">Concepto / factura</span>
            <input
              value={movDesc}
              onChange={(e) => setMovDesc(e.target.value)}
              placeholder="Ej. Factura 1234, pago servicios"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-xs font-medium text-gray-600">Monto (COP)</span>
            <div className="relative mt-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-gray-400">
                $
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={movMontoRaw}
                onChange={(e) => setMovMontoRaw(e.target.value)}
                placeholder="0"
                className="w-full rounded-lg border border-gray-300 py-2 pl-7 pr-3 text-sm font-semibold tabular-nums focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
              />
            </div>
          </label>
        </div>
        <button
          type="button"
          disabled={enviandoMov}
          onClick={onAgregarMovimiento}
          className="mt-4 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {enviandoMov ? "Guardando…" : "Guardar movimiento"}
        </button>
      </section>

      {/* Lista */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-gray-500">Movimientos en el rango</h3>
        {movimientosFiltrados.length === 0 ? (
          <p className="text-sm text-gray-500">No hay registros en las fechas seleccionadas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs uppercase text-gray-500">
                  <th className="py-2 pr-2">Fecha</th>
                  <th className="py-2 pr-2">Tipo</th>
                  <th className="py-2 pr-2">Proveedor</th>
                  <th className="py-2 pr-2">Concepto</th>
                  <th className="py-2 text-right">Monto</th>
                  <th className="py-2 pl-2 w-20" />
                </tr>
              </thead>
              <tbody>
                {movimientosFiltrados.map((m: CgMovimiento) => (
                  <tr key={m.id} className="border-b border-gray-100">
                    <td className="py-2 pr-2 tabular-nums text-gray-800">{m.fechaYmd}</td>
                    <td className="py-2 pr-2">
                      <span
                        className={
                          m.tipo === "compra"
                            ? "rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-900"
                            : "rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-900"
                        }
                      >
                        {m.tipo === "compra" ? "Compra" : "Gasto"}
                      </span>
                    </td>
                    <td className="py-2 pr-2 text-gray-700">{nombreProveedorEnBundle(bundle, m.proveedorId)}</td>
                    <td className="py-2 pr-2 text-gray-800">{m.descripcion}</td>
                    <td className="py-2 text-right font-semibold tabular-nums text-gray-900">${formatCop(m.monto)}</td>
                    <td className="py-2 pl-2 text-right">
                      <button
                        type="button"
                        onClick={() => onEliminarMov(m.id)}
                        className="text-xs font-semibold text-red-600 hover:underline"
                      >
                        Quitar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <footer className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-3 text-center text-xs text-gray-600">
        Los datos se guardan en <strong className="text-gray-800">este equipo</strong> por punto de venta. El PYG usa la{" "}
        <strong className="text-gray-800">fecha del movimiento</strong> para sumar al mes correspondiente.
      </footer>
    </div>
  );
}
