"use client";

import { useCallback, useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
import { formatoEtiquetaFicha, getFranquiciadoPorPuntoVenta, type FranquiciadoFicha } from "@/lib/franquiciado-pos";
import PerfilCajeroForm from "@/components/PerfilCajeroForm";

type VistaPerfil = "menu" | "cajero" | "franquiciado";

function formatearValorCampo(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (typeof v === "object") {
    try {
      return JSON.stringify(v, null, 2);
    } catch {
      return String(v);
    }
  }
  return String(v);
}

export interface PerfilUsuarioModalProps {
  open: boolean;
  onClose: () => void;
  /** UID Firebase del cajero (para guardar perfil en `users/{uid}`). */
  uidSesion: string | null;
  emailSesion: string | null;
  puntoVenta: string | null;
  /** Con turno abierto y cajero del catálogo, «Perfil del cajero» carga esa ficha (posCajerosTurno). */
  turnoAbierto?: boolean;
  cajeroTurnoActivo?: { id: string; nombreDisplay: string } | null;
  fotoPreview: string | null;
  onFotoChange: (dataUrl: string | null) => void;
  /** Si true, no se ofrece ficha WMS del franquiciado (solo datos locales). */
  esContador?: boolean;
}

export default function PerfilUsuarioModal({
  open,
  onClose,
  uidSesion,
  emailSesion,
  puntoVenta,
  turnoAbierto = false,
  cajeroTurnoActivo = null,
  fotoPreview,
  onFotoChange,
  esContador: esContadorProp,
}: PerfilUsuarioModalProps) {
  const esContador = Boolean(esContadorProp);
  const [vista, setVista] = useState<VistaPerfil>("menu");
  const [cargandoFranq, setCargandoFranq] = useState(false);
  const [errorFranq, setErrorFranq] = useState<string | null>(null);
  const [fichaFranq, setFichaFranq] = useState<FranquiciadoFicha | null>(null);

  useEffect(() => {
    if (!open) return;
    setVista("menu");
    setErrorFranq(null);
    setFichaFranq(null);
  }, [open]);

  const cargarFranquiciado = useCallback(async () => {
    if (esContador) return;
    if (!puntoVenta?.trim()) {
      setErrorFranq("No hay punto de venta asignado. Selecciona uno al iniciar sesión.");
      setFichaFranq(null);
      return;
    }
    setCargandoFranq(true);
    setErrorFranq(null);
    setFichaFranq(null);
    try {
      const token = auth?.currentUser ? await auth.currentUser.getIdToken() : null;
      const res = await getFranquiciadoPorPuntoVenta(puntoVenta, token);
      if (!res.ok) {
        setErrorFranq(res.message ?? "No se pudo obtener la ficha.");
        return;
      }
      if (!res.franquiciado || Object.keys(res.franquiciado).length === 0) {
        setErrorFranq(
          "El WMS no devolvió datos del franquiciado. Verifica que exista el endpoint GET /api/pos/franquiciado?puntoVenta=… y que este punto de venta tenga franquiciado asignado."
        );
        return;
      }
      setFichaFranq(res.franquiciado);
    } catch {
      setErrorFranq("Error al cargar la ficha del franquiciado.");
    } finally {
      setCargandoFranq(false);
    }
  }, [puntoVenta, esContador]);

  useEffect(() => {
    if (open && vista === "franquiciado" && !esContador) {
      void cargarFranquiciado();
    }
  }, [open, vista, cargarFranquiciado, esContador]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-perfil-usuario-title"
    >
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
        <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-100 px-5 py-3">
          <h2 id="modal-perfil-usuario-title" className="text-lg font-bold text-gray-900">
            {vista === "menu"
              ? "Perfil del usuario"
              : vista === "cajero"
                ? esContador
                ? "Datos personales"
                : "Perfil del cajero"
                : "Perfil del franquiciado"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
            aria-label="Cerrar"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {vista === "menu" && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                {esContador
                  ? "Puedes revisar o editar tus datos personales guardados en Firestore (sin acceso a datos del WMS)."
                  : "Elige qué información deseas ver o editar."}
              </p>
              <div className={`grid gap-3 ${esContador ? "" : "sm:grid-cols-2"}`}>
                <button
                  type="button"
                  onClick={() => setVista("cajero")}
                  className="flex flex-col items-start rounded-xl border-2 border-gray-200 bg-white p-4 text-left shadow-sm transition-all hover:border-primary-400 hover:shadow-md"
                >
                  <span className="text-base font-semibold text-gray-900">
                    {esContador ? "Datos personales" : "1) Perfil del cajero"}
                  </span>
                  <span className="mt-2 text-sm text-gray-600">
                    {esContador
                      ? "Contacto y demás datos que elijas guardar en tu usuario (Firestore). La foto solo en este equipo."
                      : turnoAbierto && cajeroTurnoActivo
                        ? `Con turno abierto, la ficha es la de quien opera el turno (${cajeroTurnoActivo.nombreDisplay}): catálogo del punto de venta y copia en este navegador; la foto solo en el equipo.`
                        : "Datos personales, contacto, emergencia, hijos, cumpleaños y foto. Se guardan en tu usuario (Firestore) y en este equipo; la foto solo en el equipo."}
                  </span>
                </button>
                {!esContador && (
                  <button
                    type="button"
                    onClick={() => setVista("franquiciado")}
                    className="flex flex-col items-start rounded-xl border-2 border-gray-200 bg-white p-4 text-left shadow-sm transition-all hover:border-primary-400 hover:shadow-md"
                  >
                    <span className="text-base font-semibold text-gray-900">2) Perfil del franquiciado</span>
                    <span className="mt-2 text-sm text-gray-600">
                      Ficha definida en el WMS para el punto de venta actual ({puntoVenta || "sin asignar"}).
                    </span>
                  </button>
                )}
              </div>
            </div>
          )}

          {vista === "cajero" && (
            <PerfilCajeroForm
              uidSesion={uidSesion}
              emailSesion={emailSesion}
              fotoPreview={fotoPreview}
              onFotoChange={onFotoChange}
              onVolver={() => setVista("menu")}
              turnoAbierto={turnoAbierto}
              cajeroTurnoActivo={cajeroTurnoActivo}
            />
          )}

          {vista === "franquiciado" && (
            <div className="flex max-h-[min(75vh,640px)] flex-col">
              <div className="mb-3 flex flex-shrink-0 flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-gray-600">
                  Punto de venta: <strong className="text-gray-900">{puntoVenta || "—"}</strong>
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void cargarFranquiciado()}
                    disabled={cargandoFranq}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {cargandoFranq ? "Cargando…" : "Actualizar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setVista("menu")}
                    className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-200"
                  >
                    Volver
                  </button>
                </div>
              </div>
              {cargandoFranq && (
                <div className="flex flex-1 items-center justify-center py-16">
                  <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
                </div>
              )}
              {!cargandoFranq && errorFranq && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">{errorFranq}</div>
              )}
              {!cargandoFranq && !errorFranq && fichaFranq && (
                <dl className="space-y-3 overflow-y-auto rounded-lg border border-gray-100 bg-gray-50/50 p-4">
                  {Object.entries(fichaFranq).map(([key, value]) => (
                    <div key={key} className="grid gap-1 border-b border-gray-100 pb-3 last:border-0 sm:grid-cols-[200px_1fr]">
                      <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        {formatoEtiquetaFicha(key)}
                      </dt>
                      <dd className="whitespace-pre-wrap text-sm text-gray-900">{formatearValorCampo(value)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
