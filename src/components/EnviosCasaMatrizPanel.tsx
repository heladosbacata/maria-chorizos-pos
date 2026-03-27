"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { auth } from "@/lib/firebase";
import {
  contarPendientesParaPos,
  enviosMatrizDetalle,
  enviosMatrizListar,
  enviosMatrizRecepcion,
  filtrarEnviosPorPuntoVenta,
  mensajeErrorEnviosMatriz,
  mismoPuntoVenta,
} from "@/lib/envios-matriz-api";
import type { EnvioMatrizListItem, LineaEnvioMatriz } from "@/types/envios-matriz";

export interface EnviosCasaMatrizPanelProps {
  puntoVenta: string;
  onPendientesChange?: (n: number) => void;
}

type Vista = "pendientes" | "detalle" | "historial";

type LineaForm = {
  sku: string;
  cantidadRecibida: string;
  comentario: string;
};

async function getToken(): Promise<string | null> {
  return auth?.currentUser ? auth.currentUser.getIdToken() : null;
}

function resumenLineas(lineas: LineaEnvioMatriz[] | undefined): string {
  if (!lineas?.length) return "Sin líneas";
  const n = lineas.length;
  const u = lineas.reduce((a, l) => a + (l.cantidadDespachada || 0), 0);
  return `${n} ítem${n === 1 ? "" : "s"} · ${u.toLocaleString("es-CO")} u. despachadas`;
}

export default function EnviosCasaMatrizPanel({ puntoVenta, onPendientesChange }: EnviosCasaMatrizPanelProps) {
  const pv = puntoVenta.trim();
  const [vista, setVista] = useState<Vista>("pendientes");
  const [envioId, setEnvioId] = useState<string | null>(null);

  const [cargandoLista, setCargandoLista] = useState(false);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);
  const [enviandoRecepcion, setEnviandoRecepcion] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [mensajeOk, setMensajeOk] = useState<string | null>(null);

  const [pendientesItems, setPendientesItems] = useState<EnvioMatrizListItem[]>([]);
  const [historialItems, setHistorialItems] = useState<EnvioMatrizListItem[]>([]);
  const [historialFiltro, setHistorialFiltro] = useState<"recibido" | "todos">("recibido");

  const [detalleLineas, setDetalleLineas] = useState<LineaEnvioMatriz[]>([]);
  const [detalleMeta, setDetalleMeta] = useState<{
    idDespacho?: string;
    fechaDespacho?: string;
    estado?: string;
    puntoVentaDestino?: string;
  }>({});
  const [lineasForm, setLineasForm] = useState<LineaForm[]>([]);
  const [comentarioGeneral, setComentarioGeneral] = useState("");

  const cargarPendientes = useCallback(async () => {
    setCargandoLista(true);
    setError(null);
    try {
      const token = await getToken();
      const r = await enviosMatrizListar(token, { estado: "pendiente", limite: 50 });
      if (!r.ok) {
        setError(mensajeErrorEnviosMatriz(r.status, r.data));
        setPendientesItems([]);
        onPendientesChange?.(0);
        return;
      }
      const items = filtrarEnviosPorPuntoVenta(r.data.data, pv);
      setPendientesItems(items);
      onPendientesChange?.(contarPendientesParaPos(r.data, pv));
    } catch {
      setError("No se pudo cargar la lista de envíos.");
      setPendientesItems([]);
      onPendientesChange?.(0);
    } finally {
      setCargandoLista(false);
    }
  }, [pv, onPendientesChange]);

  const cargarHistorial = useCallback(async () => {
    setCargandoHistorial(true);
    setError(null);
    try {
      const token = await getToken();
      const r = await enviosMatrizListar(token, { estado: historialFiltro, limite: 50 });
      if (!r.ok) {
        setError(mensajeErrorEnviosMatriz(r.status, r.data));
        setHistorialItems([]);
        return;
      }
      setHistorialItems(filtrarEnviosPorPuntoVenta(r.data.data, pv));
    } catch {
      setError("No se pudo cargar el historial.");
      setHistorialItems([]);
    } finally {
      setCargandoHistorial(false);
    }
  }, [pv, historialFiltro]);

  useEffect(() => {
    void cargarPendientes();
  }, [cargarPendientes]);

  useEffect(() => {
    if (vista === "historial") void cargarHistorial();
  }, [vista, cargarHistorial]);

  const abrirDetalle = async (id: string) => {
    setEnvioId(id);
    setVista("detalle");
    setMensajeOk(null);
    setError(null);
    setCargandoDetalle(true);
    setComentarioGeneral("");
    try {
      const token = await getToken();
      const r = await enviosMatrizDetalle(token, id);
      if (!r.ok || !r.data.data) {
        setError(mensajeErrorEnviosMatriz(r.status, r.data));
        setDetalleLineas([]);
        setLineasForm([]);
        setCargandoDetalle(false);
        return;
      }
      const d = r.data.data;
      setDetalleMeta({
        idDespacho: d.idDespacho,
        fechaDespacho: d.fechaDespacho,
        estado: d.estado,
        puntoVentaDestino: d.puntoVentaDestino,
      });
      const lineas = d.lineas?.length ? d.lineas : [];
      setDetalleLineas(lineas);
      setLineasForm(
        lineas.map((l) => ({
          sku: l.sku,
          cantidadRecibida: String(l.cantidadDespachada ?? 0),
          comentario: "",
        }))
      );
    } catch {
      setError("No se pudo cargar el detalle del envío.");
      setDetalleLineas([]);
      setLineasForm([]);
    } finally {
      setCargandoDetalle(false);
    }
  };

  const destinoCoincide = useMemo(
    () => mismoPuntoVenta(detalleMeta.puntoVentaDestino, pv),
    [detalleMeta.puntoVentaDestino, pv]
  );

  const confirmarRecepcion = async () => {
    if (!envioId) return;
    if (!destinoCoincide) {
      setError("El destino del envío no coincide con tu punto de venta. No se puede confirmar.");
      return;
    }
    setEnviandoRecepcion(true);
    setError(null);
    setMensajeOk(null);
    try {
      const token = await getToken();
      const lineasPayload = lineasForm.map((row) => {
        const n = parseFloat(String(row.cantidadRecibida).replace(/,/g, "."));
        const cantidadRecibida = Number.isFinite(n) && n >= 0 ? n : NaN;
        return {
          sku: row.sku,
          cantidadRecibida,
          comentario: row.comentario.trim() || undefined,
        };
      });
      if (lineasPayload.some((l) => Number.isNaN(l.cantidadRecibida))) {
        setError("Revisa las cantidades recibidas: deben ser números mayores o iguales a cero.");
        setEnviandoRecepcion(false);
        return;
      }
      const r = await enviosMatrizRecepcion(token, envioId, {
        lineas: lineasPayload.map(({ sku, cantidadRecibida, comentario }) => ({
          sku,
          cantidadRecibida: cantidadRecibida as number,
          comentario,
        })),
        comentarioGeneral: comentarioGeneral.trim() || undefined,
      });
      if (!r.ok) {
        setError(mensajeErrorEnviosMatriz(r.status, r.json));
        setEnviandoRecepcion(false);
        return;
      }
      setMensajeOk(r.message?.trim() || "Recepción confirmada correctamente.");
      setVista("pendientes");
      setEnvioId(null);
      await cargarPendientes();
    } catch {
      setError("Error al enviar la recepción.");
    } finally {
      setEnviandoRecepcion(false);
    }
  };

  const volverLista = () => {
    setVista("pendientes");
    setEnvioId(null);
    setError(null);
    void cargarPendientes();
  };

  return (
    <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 pb-4">
        <div>
          <h3 className="text-lg font-bold text-gray-900">Cargar inventario desde casa matriz</h3>
          <p className="mt-1 text-sm text-gray-600">
            Revisa los despachos pendientes hacia <span className="font-medium text-primary-700">{pv}</span>, confirma
            cantidades recibidas y registra la recepción en el WMS.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {vista !== "detalle" && (
            <button
              type="button"
              onClick={() => {
                if (vista === "historial") void cargarHistorial();
                else void cargarPendientes();
              }}
              disabled={cargandoLista || cargandoHistorial}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 shadow-sm hover:bg-gray-50 disabled:opacity-50"
            >
              {cargandoLista || cargandoHistorial ? "Actualizando…" : "Actualizar"}
            </button>
          )}
          {vista === "detalle" && (
            <button
              type="button"
              onClick={volverLista}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 shadow-sm hover:bg-gray-50"
            >
              Volver al listado
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setVista("pendientes");
            setMensajeOk(null);
          }}
          className={`rounded-lg px-3 py-2 text-sm font-semibold ${
            vista === "pendientes" || vista === "detalle"
              ? "bg-primary-600 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          Pendientes
        </button>
        <button
          type="button"
          onClick={() => {
            setVista("historial");
            setMensajeOk(null);
          }}
          className={`rounded-lg px-3 py-2 text-sm font-semibold ${
            vista === "historial" ? "bg-primary-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          Historial envíos matriz
        </button>
      </div>

      {mensajeOk && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {mensajeOk}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">{error}</div>
      )}

      {(vista === "pendientes" || vista === "detalle") && vista === "pendientes" && (
        <div className="overflow-x-auto rounded-lg border border-gray-100">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase text-gray-600">
              <tr>
                <th className="px-4 py-3">Despacho</th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Destino</th>
                <th className="px-4 py-3">Resumen</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {cargandoLista ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-gray-500">
                    Cargando envíos pendientes…
                  </td>
                </tr>
              ) : pendientesItems.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-gray-500">
                    No hay envíos pendientes de recepción para tu punto de venta.
                  </td>
                </tr>
              ) : (
                pendientesItems.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50/80">
                    <td className="px-4 py-2 font-mono text-xs text-gray-800">{row.idDespacho ?? row.id.slice(0, 12)}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-gray-700">{row.fechaDespacho ?? "—"}</td>
                    <td className="px-4 py-2 text-gray-800">{row.puntoVentaDestino ?? "—"}</td>
                    <td className="px-4 py-2 text-gray-600">{resumenLineas(row.lineas)}</td>
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => void abrirDetalle(row.id)}
                        className="text-sm font-semibold text-primary-600 hover:underline"
                      >
                        Recibir
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {vista === "detalle" && (
        <div className="space-y-4">
          {cargandoDetalle ? (
            <p className="py-8 text-center text-gray-500">Cargando líneas del envío…</p>
          ) : (
            <>
              <div className="rounded-lg bg-gray-50 p-4 text-sm">
                <p>
                  <span className="font-medium text-gray-700">ID envío:</span>{" "}
                  <span className="font-mono text-xs">{envioId}</span>
                </p>
                {detalleMeta.idDespacho && (
                  <p className="mt-1">
                    <span className="font-medium text-gray-700">Despacho:</span> {detalleMeta.idDespacho}
                  </p>
                )}
                {detalleMeta.fechaDespacho && (
                  <p className="mt-1">
                    <span className="font-medium text-gray-700">Fecha despacho:</span> {detalleMeta.fechaDespacho}
                  </p>
                )}
                {!destinoCoincide && (
                  <p className="mt-2 font-medium text-amber-800">
                    El destino del envío ({detalleMeta.puntoVentaDestino ?? "—"}) no coincide con tu punto de venta (
                    {pv}). No podrás confirmar la recepción hasta que coincida con tu perfil POS.
                  </p>
                )}
              </div>

              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase text-gray-600">
                    <tr>
                      <th className="px-3 py-3">SKU</th>
                      <th className="px-3 py-3">Descripción</th>
                      <th className="px-3 py-3 text-right">Despachado</th>
                      <th className="px-3 py-3 text-right">Recibido</th>
                      <th className="px-3 py-3">Comentario línea</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {lineasForm.map((row, idx) => {
                      const desp = detalleLineas[idx]?.cantidadDespachada ?? 0;
                      return (
                        <tr key={row.sku}>
                          <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{row.sku}</td>
                          <td className="px-3 py-2 text-gray-800">{detalleLineas[idx]?.descripcion ?? "—"}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                            {desp.toLocaleString("es-CO", { maximumFractionDigits: 3 })}
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={row.cantidadRecibida}
                              onChange={(e) => {
                                const next = [...lineasForm];
                                next[idx] = { ...next[idx], cantidadRecibida: e.target.value };
                                setLineasForm(next);
                              }}
                              className="w-24 rounded border border-gray-300 px-2 py-1 text-right text-sm"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={row.comentario}
                              onChange={(e) => {
                                const next = [...lineasForm];
                                next[idx] = { ...next[idx], comentario: e.target.value };
                                setLineasForm(next);
                              }}
                              placeholder="Opcional"
                              className="w-full min-w-[120px] rounded border border-gray-300 px-2 py-1 text-sm"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Comentario general (opcional)</label>
                <textarea
                  value={comentarioGeneral}
                  onChange={(e) => setComentarioGeneral(e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
              </div>

              <button
                type="button"
                disabled={enviandoRecepcion || !destinoCoincide || lineasForm.length === 0}
                onClick={() => void confirmarRecepcion()}
                className="w-full rounded-lg bg-primary-600 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50 md:w-auto md:px-8"
              >
                {enviandoRecepcion ? "Confirmando…" : "Confirmar recepción"}
              </button>
            </>
          )}
        </div>
      )}

      {vista === "historial" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-gray-600">Mostrar:</span>
            <select
              value={historialFiltro}
              onChange={(e) => setHistorialFiltro(e.target.value as "recibido" | "todos")}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="recibido">Solo recibidos</option>
              <option value="todos">Todos los estados</option>
            </select>
          </div>
          <div className="overflow-x-auto rounded-lg border border-gray-100">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase text-gray-600">
                <tr>
                  <th className="px-4 py-3">Despacho</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Resumen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {cargandoHistorial ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-gray-500">
                      Cargando historial…
                    </td>
                  </tr>
                ) : historialItems.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-gray-500">
                      No hay envíos en el historial para este filtro.
                    </td>
                  </tr>
                ) : (
                  historialItems.map((row) => (
                    <tr key={row.id} className="hover:bg-gray-50/80">
                      <td className="px-4 py-2 font-mono text-xs text-gray-800">{row.idDespacho ?? row.id.slice(0, 12)}</td>
                      <td className="px-4 py-2 text-gray-800">{row.estado ?? "—"}</td>
                      <td className="whitespace-nowrap px-4 py-2 text-gray-700">{row.fechaDespacho ?? "—"}</td>
                      <td className="px-4 py-2 text-gray-600">{resumenLineas(row.lineas)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
