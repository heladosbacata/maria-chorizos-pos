"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fechaHoraColombia } from "@/lib/fecha-colombia";
import { loadImpresionPrefs } from "@/lib/impresion-pos-storage";
import {
  imprimirTicketConQz,
  imprimirTicketEnNavegador,
  reservarVentanaTicketNavegador,
} from "@/lib/pos-geb-print";
import { anularVentaEnEquipoInventarioYNube } from "@/lib/pos-anular-venta-inventario-nube";
import {
  filtrarVentasVigentes,
  listarVentasPuntoVenta,
  ventasDelTurnoActivos,
  type VentaGuardadaLocal,
} from "@/lib/pos-ventas-local-storage";
import {
  EVENTO_PERFIL_CAJERO_GUARDADO,
  etiquetaCuentaParaGuardado,
  leerNombrePerfilCajeroDesdeLocal,
} from "@/lib/pos-perfil-cajero-display";
import type { TicketVentaPayload } from "@/types/impresion-pos";

const MAX_LISTA = 60;
const MAX_RECIBOS_TURNO = 10;
const MIN_MOTIVO = 5;

function formatoPesos(n: number): string {
  return `$ ${n.toLocaleString("es-CO", { maximumFractionDigits: 0 })}`;
}

function IconoOjo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function IconoOjoCerrado({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"
      />
    </svg>
  );
}

function PanelDetalleRecibo({ v }: { v: VentaGuardadaLocal }) {
  const anulada = v.anulada === true;
  return (
    <div
      className="mt-3 border-t border-gray-200 pt-3 text-sm text-gray-800"
      role="region"
      aria-label="Detalle del recibo"
    >
      <dl className="grid gap-1 text-xs text-gray-600 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <dt className="font-semibold text-gray-700">ID completo</dt>
          <dd className="mt-0.5 break-all font-mono text-[11px] text-gray-800">{v.id}</dd>
        </div>
        <div>
          <dt className="font-semibold text-gray-700">Punto de venta</dt>
          <dd className="mt-0.5">{v.puntoVenta}</dd>
        </div>
        {v.turnoSesionId ? (
          <div>
            <dt className="font-semibold text-gray-700">Turno (sesión)</dt>
            <dd className="mt-0.5 break-all font-mono text-[11px]">{v.turnoSesionId}</dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-4 overflow-x-auto rounded-xl border border-gray-100 bg-gray-50/80">
        <table className="min-w-full text-left text-xs">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-100/90 text-[10px] font-bold uppercase tracking-wide text-gray-600">
              <th className="px-3 py-2">SKU</th>
              <th className="px-3 py-2">Producto</th>
              <th className="px-3 py-2 text-right">Cant.</th>
              <th className="px-3 py-2 text-right">P. unit.</th>
              <th className="px-3 py-2 text-right">Subtotal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {v.lineas.map((l) => {
              const sub = Math.round(l.precioUnitario * l.cantidad * 100) / 100;
              return (
                <tr key={l.lineId} className="bg-white">
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px] text-gray-700">{l.sku}</td>
                  <td className="px-3 py-2 text-gray-900">
                    <span className="font-medium">{l.descripcion}</span>
                    {l.detalleVariante?.trim() ? (
                      <span className="mt-0.5 block text-[11px] font-normal text-gray-500">
                        {l.detalleVariante.trim()}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{l.cantidad}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatoPesos(l.precioUnitario)}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-gray-900">
                    {formatoPesos(sub)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3">
        <span className="text-xs font-semibold text-gray-600">Total</span>
        <span className={`text-lg font-black tabular-nums ${anulada ? "text-rose-700 line-through" : "text-primary-800"}`}>
          {formatoPesos(v.total)}
        </span>
      </div>

      {v.pagoResumen?.trim() ? (
        <div className="mt-3 rounded-lg border border-gray-100 bg-white px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Pago / notas</p>
          <p className="mt-1 whitespace-pre-wrap text-xs text-gray-800">{v.pagoResumen.trim()}</p>
        </div>
      ) : null}

      {v.mediosPago ? (
        <div className="mt-3 rounded-lg border border-gray-100 bg-white px-3 py-2 text-xs">
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Medios de pago</p>
          <ul className="mt-2 space-y-1 text-gray-700">
            {v.mediosPago.efectivo > 0 ? (
              <li className="flex justify-between tabular-nums">
                <span>Efectivo</span>
                <span>{formatoPesos(v.mediosPago.efectivo)}</span>
              </li>
            ) : null}
            {v.mediosPago.tarjeta > 0 ? (
              <li className="flex justify-between tabular-nums">
                <span>Tarjeta / datáfono</span>
                <span>{formatoPesos(v.mediosPago.tarjeta)}</span>
              </li>
            ) : null}
            {v.mediosPago.pagosLinea > 0 ? (
              <li className="flex justify-between tabular-nums">
                <span>Pagos en línea (agrupado)</span>
                <span>{formatoPesos(v.mediosPago.pagosLinea)}</span>
              </li>
            ) : null}
            {v.mediosPago.otros > 0 ? (
              <li className="flex justify-between tabular-nums">
                <span>Otros</span>
                <span>{formatoPesos(v.mediosPago.otros)}</span>
              </li>
            ) : null}
            {v.mediosPago.detalleLineas?.length
              ? v.mediosPago.detalleLineas.map((d, i) => (
                  <li key={i} className="flex justify-between border-t border-gray-50 pt-1 tabular-nums text-[11px] text-gray-600">
                    <span>{d.tipo}</span>
                    <span>{formatoPesos(d.monto)}</span>
                  </li>
                ))
              : null}
          </ul>
        </div>
      ) : null}

      {anulada ? (
        <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
          <p className="font-bold">Recibo anulado</p>
          {v.anuladaMotivo?.trim() ? <p className="mt-1">Motivo: {v.anuladaMotivo.trim()}</p> : null}
          {v.anuladaEnIso ? (
            <p className="mt-1 font-mono text-[11px] opacity-90">{v.anuladaEnIso}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function payloadTicketDesdeVenta(v: VentaGuardadaLocal): TicketVentaPayload {
  const t = new Date(v.isoTimestamp);
  const fechaHora = Number.isNaN(t.getTime()) ? v.isoTimestamp : fechaHoraColombia(t);
  return {
    titulo: "TICKET DE VENTA (copia)",
    puntoVenta: v.puntoVenta,
    precuentaNombre: "Recibo",
    fechaHora,
    clienteNombre: "—",
    tipoComprobanteLabel: "Recibo POS",
    vendedorLabel: v.cajeroNombre?.trim() || "—",
    lineas: v.lineas.map((l) => ({
      descripcion: l.descripcion,
      cantidad: l.cantidad,
      precioUnitario: l.precioUnitario,
      subtotal: Math.round(l.precioUnitario * l.cantidad * 100) / 100,
      ...(l.detalleVariante?.trim() ? { detalleVariante: l.detalleVariante.trim() } : {}),
    })),
    total: v.total,
    notaPie:
      (v.pagoResumen?.trim() ? `${v.pagoResumen.trim()}\n` : "") +
      `Copia · ID ${v.id.slice(0, 24)}…`,
  };
}

export interface UltimosRecibosModuleProps {
  uid: string;
  email: string | null;
  puntoVenta: string;
  turnoSesionId: string;
  turnoAbierto: boolean;
  /** Ajusta totales del turno abierto cuando la venta anulada pertenece al turno actual. */
  onAnulacionExitosa?: (venta: VentaGuardadaLocal) => void;
  /** Contador invitado: solo ver y reimprimir, sin anular. También muestra el aviso técnico de sesión (Firebase/PV). */
  soloConsultaContador?: boolean;
  /** Inicio del turno abierto (para listar las últimas ventas del turno). */
  turnoInicio?: Date | null;
}

export default function UltimosRecibosModule({
  uid,
  email,
  puntoVenta,
  turnoSesionId,
  turnoAbierto,
  onAnulacionExitosa,
  soloConsultaContador = false,
  turnoInicio = null,
}: UltimosRecibosModuleProps) {
  const pv = puntoVenta.trim();
  const puedeFiltrarTurno =
    turnoAbierto && turnoSesionId.trim().length > 0 && turnoInicio != null && !Number.isNaN(turnoInicio.getTime());
  const [listaTick, setListaTick] = useState(0);
  const [vistaLista, setVistaLista] = useState<"turno" | "todos">("turno");
  const [perfilTick, setPerfilTick] = useState(0);
  const [modalVenta, setModalVenta] = useState<VentaGuardadaLocal | null>(null);
  const [motivoAnulacion, setMotivoAnulacion] = useState("");
  const [procesando, setProcesando] = useState(false);
  const [errorModal, setErrorModal] = useState<string | null>(null);
  const [accionId, setAccionId] = useState<string | null>(null);
  /** Recibo cuyo detalle completo está expandido en la lista (misma pantalla). */
  const [detalleAbiertoId, setDetalleAbiertoId] = useState<string | null>(null);

  useEffect(() => {
    const onPerfil = () => setPerfilTick((t) => t + 1);
    window.addEventListener(EVENTO_PERFIL_CAJERO_GUARDADO, onPerfil);
    return () => window.removeEventListener(EVENTO_PERFIL_CAJERO_GUARDADO, onPerfil);
  }, []);

  const etiquetaPerfilSesion = useMemo(() => {
    void listaTick;
    void perfilTick;
    const nombrePerfil = leerNombrePerfilCajeroDesdeLocal();
    return etiquetaCuentaParaGuardado({
      nombrePerfil,
      emailSesion: email,
      uid: uid.trim() || "—",
    });
  }, [listaTick, perfilTick, uid, email]);

  const ventasTodos = useMemo(() => {
    void listaTick;
    if (!uid.trim() || !pv) return [];
    return listarVentasPuntoVenta(uid, pv)
      .slice()
      .sort((a, b) => new Date(b.isoTimestamp).getTime() - new Date(a.isoTimestamp).getTime())
      .slice(0, MAX_LISTA);
  }, [uid, pv, listaTick]);

  const ventasUltimasDelTurno = useMemo(() => {
    void listaTick;
    if (!uid.trim() || !pv || !puedeFiltrarTurno || !turnoInicio) return [];
    const todas = listarVentasPuntoVenta(uid, pv);
    return filtrarVentasVigentes(ventasDelTurnoActivos(todas, turnoSesionId, turnoInicio))
      .slice()
      .sort((a, b) => new Date(b.isoTimestamp).getTime() - new Date(a.isoTimestamp).getTime())
      .slice(0, MAX_RECIBOS_TURNO);
  }, [uid, pv, listaTick, puedeFiltrarTurno, turnoSesionId, turnoInicio]);

  const ventas =
    puedeFiltrarTurno && vistaLista === "turno" ? ventasUltimasDelTurno : ventasTodos;

  const reimprimir = useCallback(
    async (v: VentaGuardadaLocal) => {
      setAccionId(v.id);
      try {
        const payload = payloadTicketDesdeVenta(v);
        const prefs = loadImpresionPrefs();
        const reservada = prefs.metodo === "directa" ? reservarVentanaTicketNavegador() : null;
        if (prefs.metodo === "directa") {
          try {
            await imprimirTicketConQz(prefs, payload);
            if (reservada && !reservada.closed) reservada.close();
          } catch (qzErr) {
            console.warn("Reimpresión: QZ no disponible, navegador.", qzErr);
            imprimirTicketEnNavegador(payload, reservada);
          }
        } else {
          imprimirTicketEnNavegador(payload);
        }
      } catch (e) {
        window.alert(e instanceof Error ? e.message : "No se pudo reimprimir.");
      } finally {
        setAccionId(null);
      }
    },
    []
  );

  const abrirModalAnular = (v: VentaGuardadaLocal) => {
    if (v.anulada) return;
    setErrorModal(null);
    setMotivoAnulacion("");
    setModalVenta(v);
  };

  const cerrarModal = () => {
    if (procesando) return;
    setModalVenta(null);
    setMotivoAnulacion("");
    setErrorModal(null);
  };

  const confirmarAnulacion = async () => {
    const v = modalVenta;
    if (!v || !uid.trim()) return;
    const motivo = motivoAnulacion.trim();
    if (motivo.length < MIN_MOTIVO) {
      setErrorModal(`Escribe al menos ${MIN_MOTIVO} caracteres en el motivo.`);
      return;
    }
    setProcesando(true);
    setErrorModal(null);
    try {
      const resultado = await anularVentaEnEquipoInventarioYNube({
        uid,
        email,
        puntoVenta: pv,
        ventaId: v.id,
        motivo,
      });
      if (!resultado.ok) {
        setErrorModal(resultado.message);
        setProcesando(false);
        return;
      }
      const { venta: actualizada, fallosSku } = resultado;

      if (turnoAbierto && v.turnoSesionId?.trim() === turnoSesionId.trim()) {
        onAnulacionExitosa?.(actualizada);
      }

      setListaTick((t) => t + 1);
      setModalVenta(null);
      setMotivoAnulacion("");
      setErrorModal(null);
      if (fallosSku.length > 0) {
        window.alert(
          `Venta anulada. No se pudo devolver inventario en algunas líneas (revisa SKU en catálogo):\n${fallosSku.slice(0, 8).join("\n")}${fallosSku.length > 8 ? "\n…" : ""}`
        );
      }
    } catch (e) {
      setErrorModal(e instanceof Error ? e.message : "Error al anular.");
    } finally {
      setProcesando(false);
    }
  };

  if (!uid.trim() || !pv) {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center text-amber-950">
        <p className="font-semibold">Falta sesión o punto de venta</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-12">
      <header>
        <h2 className="text-2xl font-extrabold tracking-tight text-gray-900">Últimos recibos</h2>
        {soloConsultaContador ? (
          <div className="mt-2 rounded-xl border border-primary-100 bg-primary-50/85 px-3 py-2.5 text-sm text-primary-950">
            <p>
              <span className="font-semibold text-primary-900">Perfil / sesión activa:</span>{" "}
              <span className="font-medium">{etiquetaPerfilSesion}</span>
              {email?.trim() ? (
                <span className="mt-0.5 block text-xs font-normal text-primary-900/85">
                  Correo de sesión: <span className="font-mono">{email.trim()}</span>
                </span>
              ) : null}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-primary-900/88">
              Los recibos de esta lista se guardan en este navegador bajo tu usuario Firebase{" "}
              <code className="rounded bg-white/70 px-1 py-0.5 text-[11px]">{uid.trim().slice(0, 10)}…</code> y punto de
              venta <strong>{pv}</strong>. Si completaste <strong>Perfil del usuario → Perfil del cajero</strong>, el nombre
              mostrado arriba coincide con esa ficha.
            </p>
          </div>
        ) : null}
        <p className="mt-3 text-sm text-gray-600">
          {soloConsultaContador ? (
            <>
              En modo contador podés <strong>ver el detalle</strong> (ojo) y <strong>reimprimir</strong>; la anulación la
              hace un cajero desde su sesión.
            </>
          ) : (
            <>
              Usá el ícono del <strong>ojo</strong> para ver el detalle completo del recibo (líneas, pagos) sin salir de
              esta pantalla. Podés reimprimir o anular; al anular se pide el motivo, se devuelve inventario según el
              catálogo del punto de venta y queda registro en <strong>Reportes</strong>.
            </>
          )}
        </p>

        {puedeFiltrarTurno ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setVistaLista("turno")}
              className={`rounded-full px-4 py-2 text-sm font-semibold shadow-sm transition-all ${
                vistaLista === "turno"
                  ? "bg-brand-yellow text-gray-900 ring-2 ring-brand-yellow/60"
                  : "bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50"
              }`}
            >
              Últimos del turno (hasta {MAX_RECIBOS_TURNO})
            </button>
            <button
              type="button"
              onClick={() => setVistaLista("todos")}
              className={`rounded-full px-4 py-2 text-sm font-semibold shadow-sm transition-all ${
                vistaLista === "todos"
                  ? "bg-brand-yellow text-gray-900 ring-2 ring-brand-yellow/60"
                  : "bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50"
              }`}
            >
              Todos en este equipo (hasta {MAX_LISTA})
            </button>
          </div>
        ) : null}
      </header>

      {ventas.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-10 text-center text-gray-600">
          <p className="text-lg font-medium text-gray-800">Aún no hay recibos</p>
          <p className="mt-2 text-sm">
            {puedeFiltrarTurno && vistaLista === "turno"
              ? "En el turno abierto todavía no hay recibos vigentes, o cambiá a «Todos en este equipo» para ver el historial."
              : "Los cobros con carrito aparecerán aquí."}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {ventas.map((v) => {
            const t = new Date(v.isoTimestamp);
            const hora = Number.isNaN(t.getTime()) ? "—" : fechaHoraColombia(t, { hour: "2-digit", minute: "2-digit" });
            const anulada = v.anulada === true;
            const detalleAbierto = detalleAbiertoId === v.id;
            return (
              <li
                key={v.id}
                className={`rounded-2xl border bg-white p-4 shadow-sm ${
                  anulada ? "border-rose-200 bg-rose-50/40" : "border-gray-100"
                }`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-gray-500">{v.id.slice(0, 14)}…</span>
                      {anulada ? (
                        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-800">
                          Anulada
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-gray-600">
                      {v.fechaYmd} · {hora}
                      {v.cajeroNombre ? ` · ${v.cajeroNombre}` : ""}
                    </p>
                    <p className="mt-1 text-lg font-black tabular-nums text-primary-800">
                      $ {v.total.toLocaleString("es-CO", { maximumFractionDigits: 0 })}
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setDetalleAbiertoId(detalleAbierto ? null : v.id)}
                      className={`inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold shadow-sm transition-colors ${
                        detalleAbierto
                          ? "border-gray-300 bg-gray-100 text-gray-900 hover:bg-gray-200"
                          : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
                      }`}
                      title={detalleAbierto ? "Ocultar detalle" : "Ver detalle del recibo"}
                      aria-label={detalleAbierto ? "Ocultar detalle del recibo" : "Ver detalle del recibo"}
                      aria-expanded={detalleAbierto}
                      aria-controls={`recibo-detalle-${v.id}`}
                    >
                      {detalleAbierto ? (
                        <>
                          <IconoOjoCerrado className="h-5 w-5 shrink-0" />
                          <span className="hidden sm:inline">Ocultar</span>
                        </>
                      ) : (
                        <>
                          <IconoOjo className="h-5 w-5 shrink-0" />
                          <span className="hidden sm:inline">Detalle</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={accionId === v.id}
                      onClick={() => void reimprimir(v)}
                      className="rounded-xl border border-primary-200 bg-primary-50 px-4 py-2 text-sm font-semibold text-primary-900 hover:bg-primary-100 disabled:opacity-50"
                    >
                      {accionId === v.id ? "Imprimiendo…" : "Reimprimir"}
                    </button>
                    {!soloConsultaContador ? (
                      <button
                        type="button"
                        disabled={anulada || accionId === v.id}
                        onClick={() => abrirModalAnular(v)}
                        className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-900 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        Anular
                      </button>
                    ) : null}
                  </div>
                </div>
                {detalleAbierto ? (
                  <div id={`recibo-detalle-${v.id}`}>
                    <PanelDetalleRecibo v={v} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {modalVenta ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal
          onClick={procesando ? undefined : cerrarModal}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-gray-900">Anular recibo</h3>
            <p className="mt-2 text-sm text-gray-600">
              Recibo <span className="font-mono text-xs">{modalVenta.id.slice(0, 20)}…</span> · total{" "}
              <strong>$ {modalVenta.total.toLocaleString("es-CO")}</strong>
            </p>
            <p className="mt-3 text-sm text-gray-700">
              Se devolverá inventario por cada línea cuyo SKU coincida con el catálogo del punto de venta. El motivo queda
              guardado y aparece en reportes.
            </p>
            <label className="mt-4 block">
              <span className="text-sm font-semibold text-gray-800">Motivo de la anulación</span>
              <textarea
                value={motivoAnulacion}
                onChange={(e) => setMotivoAnulacion(e.target.value)}
                rows={4}
                className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
                placeholder="Ej.: Cliente se arrepintió, error de cobro, producto defectuoso…"
                disabled={procesando}
              />
            </label>
            {errorModal ? <p className="mt-2 text-sm font-medium text-rose-700">{errorModal}</p> : null}
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={cerrarModal}
                disabled={procesando}
                className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void confirmarAnulacion()}
                disabled={procesando}
                className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {procesando ? "Procesando…" : "Confirmar anulación"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
