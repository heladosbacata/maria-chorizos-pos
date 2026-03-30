"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { esContadorInvitado } from "@/lib/auth-roles";
import { auth } from "@/lib/firebase";
import { reiniciarPosFabricaLocalStorage } from "@/lib/pos-reinicio-fabrica-local";
import { getContratoPosDesdeWmsPorCorreoSesion } from "@/lib/usuarios-pos-wms";

export interface ContratoPosGebPanelProps {
  onVolver: () => void;
}

/** Derivado solo del WMS (fecha de vencimiento); el usuario no puede cambiarlo en el POS. */
type EstadoContratoMostrado =
  | "vigente"
  | "por_vencer"
  | "vencido"
  | "sin_vencimiento"
  | "sin_datos";

const CLAVE_REINICIO_FABRICA_POS = "MC2026";

export default function ContratoPosGebPanel({ onVolver }: ContratoPosGebPanelProps) {
  const { user } = useAuth();
  const codigoPvSesion = user?.puntoVenta?.trim() ?? "";
  const [estadoContrato, setEstadoContrato] = useState<EstadoContratoMostrado>("sin_datos");
  const [planProducto, setPlanProducto] = useState("POS GEB — Contabilidad y facturación");
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaVencimiento, setFechaVencimiento] = useState("");
  const [correoFacturacion, setCorreoFacturacion] = useState("");
  const [aceptaTerminos, setAceptaTerminos] = useState(false);
  const [aceptaPoliticaDatos, setAceptaPoliticaDatos] = useState(false);
  const [notasInternas, setNotasInternas] = useState("");

  const [reinicioFase, setReinicioFase] = useState<null | "alerta" | "clave">(null);
  const [reinicioClave, setReinicioClave] = useState("");
  const [reinicioErr, setReinicioErr] = useState<string | null>(null);
  const [reinicioEjecutando, setReinicioEjecutando] = useState(false);

  const [cargandoWms, setCargandoWms] = useState(true);
  const [avisoWms, setAvisoWms] = useState<string | null>(null);
  /** Fechas que vienen del WMS: solo lectura en el POS */
  const [camposContratoDesdeWms, setCamposContratoDesdeWms] = useState(false);

  const inputClass =
    "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100";

  const cargarContratoDesdeWms = useCallback(async () => {
    setCargandoWms(true);
    setAvisoWms(null);
    setCamposContratoDesdeWms(false);
    try {
      const token = auth?.currentUser ? await auth.currentUser.getIdToken() : null;
      const r = await getContratoPosDesdeWmsPorCorreoSesion(
        user?.email ?? null,
        token,
        user?.uid ?? null
      );

      if (!r.ok) {
        setEstadoContrato("sin_datos");
        setAvisoWms(r.message ?? "No se pudo conectar con el WMS.");
        return;
      }

      if (!r.usuario) {
        setEstadoContrato("sin_datos");
        setAvisoWms(
          "No hay una fila en el WMS para tu correo de sesión. Verifica en «Usuarios POS (Cajeros)» que el usuario exista y coincida exactamente con el correo con el que iniciaste sesión."
        );
        return;
      }

      const u = r.usuario;
      const hayFechas = Boolean(u.fechaInicio || u.fechaVencimiento);

      if (u.fechaInicio) setFechaInicio(u.fechaInicio);
      if (u.fechaVencimiento) setFechaVencimiento(u.fechaVencimiento);
      if (u.contrato) setPlanProducto(u.contrato);

      if (hayFechas) {
        setCamposContratoDesdeWms(true);
      }

      const end = u.fechaVencimiento ? new Date(u.fechaVencimiento + "T12:00:00") : null;
      if (end && !Number.isNaN(end.getTime())) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        end.setHours(0, 0, 0, 0);
        const dias = Math.ceil((end.getTime() - today.getTime()) / 86400000);
        if (dias < 0) setEstadoContrato("vencido");
        else if (dias <= 60) setEstadoContrato("por_vencer");
        else setEstadoContrato("vigente");
      } else {
        setEstadoContrato("sin_vencimiento");
      }
    } catch {
      setEstadoContrato("sin_datos");
      setAvisoWms("Error al consultar el contrato en el WMS.");
    } finally {
      setCargandoWms(false);
    }
  }, [user?.email, user?.uid]);

  useEffect(() => {
    void cargarContratoDesdeWms();
  }, [cargarContratoDesdeWms]);

  const handleGuardar = useCallback(() => {
    window.alert(
      "Las fechas del contrato las administra el WMS. Aquí puedes guardar en este equipo solo notas y casillas legales cuando integremos persistencia."
    );
  }, []);

  const esContador = user?.role != null && esContadorInvitado(user.role);
  const puedeReiniciarFabrica = Boolean(user?.uid && codigoPvSesion && !esContador);

  const cerrarReinicioFabrica = useCallback(() => {
    if (reinicioEjecutando) return;
    setReinicioFase(null);
    setReinicioClave("");
    setReinicioErr(null);
  }, [reinicioEjecutando]);

  const ejecutarReinicioFabrica = useCallback(async (clave: string) => {
    setReinicioErr(null);
    const t = clave.trim();
    if (t !== CLAVE_REINICIO_FABRICA_POS) {
      setReinicioErr("Clave incorrecta.");
      return;
    }
    setReinicioEjecutando(true);
    try {
      const token = await auth?.currentUser?.getIdToken();
      if (!token) {
        setReinicioErr("No hay sesión. Volvé a iniciar sesión.");
        return;
      }
      const res = await fetch("/api/pos_reinicio_fabrica", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ clave: t }),
      });
      let data: { ok?: boolean; message?: string } = {};
      try {
        data = (await res.json()) as { ok?: boolean; message?: string };
      } catch {
        /* cuerpo vacío */
      }
      if (res.ok && data.ok) {
        reiniciarPosFabricaLocalStorage();
        setReinicioFase(null);
        window.location.reload();
        return;
      }
      if (res.status === 503) {
        reiniciarPosFabricaLocalStorage();
        setReinicioFase(null);
        window.alert(
          "Este navegador quedó en cero (ventas, turnos e inventario local). No se borró el histórico en la nube porque falta FIREBASE_SERVICE_ACCOUNT_JSON en el servidor (Vercel). Configurá la cuenta de servicio y repetí el reinicio si necesitás vaciar también Firestore."
        );
        window.location.reload();
        return;
      }
      setReinicioErr(data.message ?? "No se pudo completar el reinicio en el servidor.");
    } catch {
      setReinicioErr("Error de red. Reintentá o revisá la conexión.");
    } finally {
      setReinicioEjecutando(false);
    }
  }, []);

  const inputReadonlyWms = camposContratoDesdeWms ? " cursor-not-allowed bg-gray-50 text-gray-800" : "";

  return (
    <div className="mx-auto max-w-3xl pb-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 pb-4">
        <div>
          <h2 className="text-xl font-bold text-primary-600 md:text-2xl">Contrato POS GEB</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void cargarContratoDesdeWms()}
            disabled={cargandoWms}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 shadow-sm hover:bg-gray-50 disabled:opacity-50"
          >
            {cargandoWms ? "Sincronizando…" : "Sincronizar con WMS"}
          </button>
          <button
            type="button"
            onClick={handleGuardar}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
          >
            Guardar
          </button>
          <button
            type="button"
            onClick={onVolver}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            Volver
          </button>
        </div>
      </div>

      {avisoWms && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">{avisoWms}</div>
      )}

      <div className="mb-6 rounded-xl border border-gray-200 bg-gray-50/80 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:gap-x-4 md:gap-y-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2 md:gap-3">
            <span className="text-sm font-semibold text-gray-900">Estado del contrato</span>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {cargandoWms && (
                <span className="text-sm text-gray-600">Consultando estado en el WMS…</span>
              )}
              {!cargandoWms && estadoContrato === "vigente" && (
                <>
                  <span className="text-sm font-semibold text-gray-900">Vigente</span>
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">Al día</span>
                </>
              )}
              {!cargandoWms && estadoContrato === "por_vencer" && (
                <>
                  <span className="text-sm font-semibold text-gray-900">Por vencer</span>
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">
                    Requiere atención
                  </span>
                </>
              )}
              {!cargandoWms && estadoContrato === "vencido" && (
                <>
                  <span className="text-sm font-semibold text-gray-900">Vencido / renovación</span>
                  <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-900">Seguimiento</span>
                </>
              )}
              {!cargandoWms && estadoContrato === "sin_vencimiento" && (
                <>
                  <span className="text-sm font-semibold text-gray-900">Sin evaluar</span>
                  <span className="rounded-full bg-gray-200 px-3 py-1 text-xs font-semibold text-gray-800">
                    Falta fecha de vencimiento en el WMS
                  </span>
                </>
              )}
              {!cargandoWms && estadoContrato === "sin_datos" && (
                <>
                  <span className="text-sm font-semibold text-gray-900">No disponible</span>
                  <span className="rounded-full bg-gray-200 px-3 py-1 text-xs font-semibold text-gray-800">
                    Sincroniza con el WMS o revisa tu usuario
                  </span>
                </>
              )}
            </div>
          </div>

          <div
            className="flex w-full min-w-0 flex-col gap-1 border-t border-gray-200 pt-3 md:w-auto md:max-w-md md:flex-1 md:flex-row md:items-center md:gap-3 md:border-l md:border-t-0 md:pt-0 md:pl-4"
            role="group"
            aria-label="Código del punto de venta de esta sesión"
          >
            <label
              htmlFor="contrato-codigo-pv"
              className="shrink-0 text-sm font-semibold text-gray-900 md:whitespace-nowrap"
            >
              Código del PV
            </label>
            <input
              id="contrato-codigo-pv"
              readOnly
              value={codigoPvSesion}
              placeholder="Sin asignar"
              title="Valor del perfil de sesión; debe coincidir exactamente con puntoVenta / posCatalogoPvCodes en Firestore (catálogo de insumos)."
              className={
                inputClass +
                " min-h-[2.5rem] w-full cursor-text bg-white font-mono text-sm tabular-nums md:min-w-[12rem] md:flex-1" +
                (codigoPvSesion ? "" : " text-gray-500")
              }
            />
          </div>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-gray-600">
          Usa este código en <span className="font-semibold text-gray-800">DB_Franquicia_Insumos_Kit</span> (mismo texto,
          mayúsculas y espacios).
        </p>
      </div>

      <div className="space-y-5 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-[200px_1fr] md:items-center">
          <label className="text-sm font-medium text-gray-700">Plan o producto</label>
          <input
            className={
              inputClass +
              (camposContratoDesdeWms && (fechaInicio || fechaVencimiento) ? inputReadonlyWms : "")
            }
            value={planProducto}
            onChange={(e) => setPlanProducto(e.target.value)}
            readOnly={camposContratoDesdeWms && Boolean(fechaInicio || fechaVencimiento)}
            title={
              camposContratoDesdeWms && (fechaInicio || fechaVencimiento)
                ? "Texto de contrato según WMS"
                : undefined
            }
          />
        </div>
        <div className="grid gap-4 md:grid-cols-[200px_1fr] md:items-center">
          <label className="text-sm font-medium text-gray-700">Fecha de inicio</label>
          <input
            type="date"
            className={inputClass + (camposContratoDesdeWms && fechaInicio ? inputReadonlyWms : "")}
            value={fechaInicio}
            onChange={(e) => setFechaInicio(e.target.value)}
            readOnly={camposContratoDesdeWms && Boolean(fechaInicio)}
          />
        </div>
        <div className="grid gap-4 md:grid-cols-[200px_1fr] md:items-center">
          <label className="text-sm font-medium text-gray-700">Fecha de vencimiento / renovación</label>
          <input
            type="date"
            className={inputClass + (camposContratoDesdeWms && fechaVencimiento ? inputReadonlyWms : "")}
            value={fechaVencimiento}
            onChange={(e) => setFechaVencimiento(e.target.value)}
            readOnly={camposContratoDesdeWms && Boolean(fechaVencimiento)}
          />
        </div>
        <div className="grid gap-4 md:grid-cols-[200px_1fr] md:items-center">
          <label className="text-sm font-medium text-gray-700">Correo de facturación POS GEB</label>
          <input
            type="email"
            className={inputClass}
            value={correoFacturacion}
            onChange={(e) => setCorreoFacturacion(e.target.value)}
            placeholder="facturacion@empresa.com"
          />
        </div>

        <div className="border-t border-gray-100 pt-4">
          <p className="mb-3 text-sm font-semibold text-gray-800">Documentación legal</p>
          <p className="text-sm text-primary-700">
            Términos, condiciones y políticas de POS GEB: consúltalos con tu administrador o en el canal oficial del producto.
          </p>
          <div className="mt-4 space-y-3">
            <label className="flex cursor-pointer items-start gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={aceptaTerminos}
                onChange={(e) => setAceptaTerminos(e.target.checked)}
                className="mt-0.5 rounded border-gray-300 text-primary-600"
              />
              Confirmo que la organización conoce y acepta los términos del servicio POS GEB aplicables al contrato.
            </label>
            <label className="flex cursor-pointer items-start gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={aceptaPoliticaDatos}
                onChange={(e) => setAceptaPoliticaDatos(e.target.checked)}
                className="mt-0.5 rounded border-gray-300 text-primary-600"
              />
              La organización ha revisado la política de datos de POS GEB.
            </label>
          </div>
        </div>

        <div className="border-t border-gray-100 pt-4">
          <label className="mb-2 block text-sm font-medium text-gray-700">Notas internas (solo POS)</label>
          <textarea
            className={`${inputClass} min-h-[100px] resize-y`}
            value={notasInternas}
            onChange={(e) => setNotasInternas(e.target.value)}
            placeholder="Contacto comercial, ticket de soporte, acuerdos especiales…"
          />
          <div className="mt-4 border-t border-red-100 pt-4">
            <button
              type="button"
              disabled={!puedeReiniciarFabrica}
              onClick={() => {
                setReinicioErr(null);
                setReinicioFase("alerta");
              }}
              className="w-full rounded-xl border-2 border-red-600 bg-gradient-to-b from-red-700 to-red-800 px-4 py-3.5 text-center text-xs font-bold uppercase tracking-wide text-white shadow-lg shadow-red-900/40 transition hover:from-red-600 hover:to-red-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Reiniciar a punto de fábrica — todo en ceros
            </button>
            {!codigoPvSesion ? (
              <p className="mt-2 text-xs text-amber-700">Asigná un punto de venta en el perfil para habilitar el reinicio.</p>
            ) : esContador ? (
              <p className="mt-2 text-xs text-gray-500">La cuenta contador invitado no puede ejecutar el reinicio.</p>
            ) : (
              <p className="mt-2 text-xs text-gray-500">
                Borra ventas e inventario de este punto de venta (navegador + Firestore si el servidor está configurado). No
                modifica los campos de arriba ni la impresora GEB.
              </p>
            )}
          </div>
        </div>
      </div>

      {reinicioFase === "alerta" && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reinicio-fabrica-titulo"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
            aria-label="Cerrar"
            onClick={cerrarReinicioFabrica}
          />
          <div className="relative z-[1] w-full max-w-lg animate-reinicio-shake-once rounded-2xl border-2 border-red-500 bg-gradient-to-b from-red-950 via-red-900 to-red-950 p-6 text-white shadow-2xl shadow-red-600/50 ring-4 ring-red-500/30">
            <div className="pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full bg-red-500/30 blur-2xl animate-reinicio-danger-glow" />
            <div className="relative flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-red-500/20 ring-2 ring-red-400/50">
                <svg className="h-8 w-8 text-red-200" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <h3 id="reinicio-fabrica-titulo" className="text-lg font-bold leading-tight text-white">
                  Zona crítica — reinicio de fábrica
                </h3>
                <ul className="mt-3 list-inside list-disc space-y-1.5 text-sm leading-relaxed text-red-100/95">
                  <li>
                    Se eliminarán las <strong className="text-white">ventas</strong> locales y en la nube de este punto de
                    venta.
                  </li>
                  <li>
                    El <strong className="text-white">inventario</strong> (cargue, saldos POS y movimientos de ensamble
                    asociados a este PV) volverá a cero en Firestore.
                  </li>
                  <li>
                    Turnos guardados en este navegador, historial de cierre y colas pendientes al WMS se borran en este
                    equipo.
                  </li>
                  <li className="list-none pl-0 text-xs text-red-200/90">
                    Los textos de este formulario <strong className="text-white">no</strong> se borran. Usuarios, catálogo y
                    WMS externo siguen igual salvo lo indicado.
                  </li>
                </ul>
              </div>
            </div>
            <div className="relative mt-6 flex flex-wrap justify-end gap-2 border-t border-red-800/80 pt-4">
              <button
                type="button"
                onClick={cerrarReinicioFabrica}
                className="rounded-lg border border-red-400/50 bg-red-950/50 px-4 py-2 text-sm font-semibold text-red-100 hover:bg-red-900/80"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  setReinicioErr(null);
                  setReinicioFase("clave");
                }}
                className="rounded-lg bg-white px-4 py-2 text-sm font-bold text-red-900 shadow-md hover:bg-red-50"
              >
                Sí, continuar
              </button>
            </div>
          </div>
        </div>
      )}

      {reinicioFase === "clave" && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reinicio-clave-titulo"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
            aria-label="Cerrar"
            onClick={cerrarReinicioFabrica}
          />
          <div className="relative z-[1] w-full max-w-md rounded-2xl border border-red-400/60 bg-gradient-to-b from-gray-900 to-gray-950 p-6 text-white shadow-2xl shadow-red-900/40 ring-1 ring-red-500/40">
            <div className="flex items-center gap-3 border-b border-gray-700 pb-4">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-600/30 ring-1 ring-red-500/50">
                <svg className="h-6 w-6 text-red-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                  />
                </svg>
              </span>
              <div>
                <h3 id="reinicio-clave-titulo" className="text-base font-bold text-white">
                  Confirmación final
                </h3>
                <p className="text-xs text-gray-400">Ingresá la clave maestra para ejecutar el reinicio.</p>
              </div>
            </div>
            <div className="mt-4">
              <label htmlFor="reinicio-clave-input" className="mb-1 block text-xs font-medium text-gray-400">
                Clave
              </label>
              <input
                id="reinicio-clave-input"
                type="password"
                autoComplete="off"
                value={reinicioClave}
                onChange={(e) => {
                  setReinicioClave(e.target.value);
                  setReinicioErr(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void ejecutarReinicioFabrica(reinicioClave);
                }}
                className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/30"
                placeholder="••••••"
              />
              {reinicioErr && <p className="mt-2 text-sm text-red-400">{reinicioErr}</p>}
            </div>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={reinicioEjecutando}
                onClick={() => {
                  setReinicioFase("alerta");
                  setReinicioClave("");
                  setReinicioErr(null);
                }}
                className="rounded-lg border border-gray-600 px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-800 disabled:opacity-50"
              >
                Volver
              </button>
              <button
                type="button"
                disabled={reinicioEjecutando}
                onClick={() => void ejecutarReinicioFabrica(reinicioClave)}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-red-900/50 hover:bg-red-500 disabled:opacity-50"
              >
                {reinicioEjecutando ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Reiniciando…
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                    Borrar todo y reiniciar
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
