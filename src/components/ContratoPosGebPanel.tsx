"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { auth } from "@/lib/firebase";
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
        </div>
      </div>
    </div>
  );
}
