"use client";

import { useCallback, useEffect, useState } from "react";
import CajerosTurnoPanel from "@/components/CajerosTurnoPanel";
import { useAuth } from "@/context/AuthContext";
import { auth } from "@/lib/firebase";
import {
  formatearDiasRestantesTabla,
  formatearFechaTabla,
  getUsuariosPosRegistrados,
  type UsuarioPosRegistrado,
} from "@/lib/usuarios-pos-wms";

export interface UsuariosPosRegistradosPanelProps {
  onVolver: () => void;
}

export default function UsuariosPosRegistradosPanel({ onVolver }: UsuariosPosRegistradosPanelProps) {
  const { user } = useAuth();
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usuarios, setUsuarios] = useState<UsuarioPosRegistrado[]>([]);
  const [detalle, setDetalle] = useState<UsuarioPosRegistrado | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const token = auth?.currentUser ? await auth.currentUser.getIdToken() : null;
      const res = await getUsuariosPosRegistrados(token);
      if (!res.ok) {
        setError(res.message ?? "No se pudo cargar la lista.");
        setUsuarios([]);
        return;
      }
      setUsuarios(res.usuarios ?? []);
    } catch {
      setError("Error al cargar datos del WMS.");
      setUsuarios([]);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return (
    <div className="mx-auto max-w-6xl pb-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 pb-4">
        <div>
          <h2 className="text-xl font-bold text-emerald-600 md:text-2xl">Cajeros de turno</h2>
          <p className="mt-1 text-sm text-gray-600">
            En el punto de venta entra una sola cuenta (la del franquiciado, asignada desde el WMS). Los{" "}
            <strong>cajeros de turno</strong> no son usuarios nuevos: sirven para identificar quién opera cada turno y
            analizar el comportamiento de las ventas. El contrato y fechas siguen viniendo del WMS cuando esté
            disponible.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void cargar()}
            disabled={cargando}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 shadow-sm hover:bg-gray-50 disabled:opacity-50"
          >
            {cargando ? "Cargando…" : "Actualizar"}
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

      {error && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-medium">{error}</p>
          <p className="mt-2 text-xs text-amber-900/90">
            El WMS debe exponer <code className="rounded bg-amber-100 px-1">GET /api/pos/usuarios/registrados</code> con
            autorización Bearer y devolver{" "}
            <code className="rounded bg-amber-100 px-1">{"{ ok: true, usuarios: [...] }"}</code>. Cada ítem puede incluir{" "}
            <code className="rounded bg-amber-100 px-1">fechaInicio</code>,{" "}
            <code className="rounded bg-amber-100 px-1">fechaVencimiento</code>,{" "}
            <code className="rounded bg-amber-100 px-1">contratoFechaInicio</code>,{" "}
            <code className="rounded bg-amber-100 px-1">contratoFechaVencimiento</code> (ISO),{" "}
            <code className="rounded bg-amber-100 px-1">contratoNombre</code>,{" "}
            <code className="rounded bg-amber-100 px-1">diasRestantes</code>.
          </p>
        </div>
      )}

      {user?.uid && <CajerosTurnoPanel puntoVenta={user.puntoVenta ?? undefined} uidSesion={user.uid} />}

      <section className="mb-4 rounded-xl border border-gray-100 bg-slate-50/80 p-4 text-sm text-gray-700">
        <p>
          <strong>Acceso al POS:</strong> correo y contraseña son los del franquiciado. No se crean aquí cuentas
          adicionales para cajeros. Los contadores invitados siguen gestionándose en «Invita a tu contador».
        </p>
      </section>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-[900px] w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-600">
              <th className="px-4 py-3">Correo</th>
              <th className="px-4 py-3">Punto de venta</th>
              <th className="px-4 py-3">Contrato</th>
              <th className="px-4 py-3">Inicio</th>
              <th className="px-4 py-3">Vencimiento</th>
              <th className="px-4 py-3">Días restantes</th>
              <th className="px-4 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {cargando && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                  <span className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent align-middle" />{" "}
                  Cargando…
                </td>
              </tr>
            )}
            {!cargando && usuarios.length === 0 && !error && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-gray-500">
                  No hay filas desde el WMS o la lista está vacía. El contrato del franquiciado puede seguir mostrándose
                  en «Contrato POS GEB».
                </td>
              </tr>
            )}
            {!cargando &&
              usuarios.map((u) => (
                <tr key={u.uid || u.email} className="border-b border-gray-100 hover:bg-gray-50/80">
                  <td className="px-4 py-3 font-medium text-gray-900">{u.email}</td>
                  <td className="px-4 py-3 text-gray-700">{u.puntoVenta}</td>
                  <td className="px-4 py-3 text-gray-700">{u.contrato}</td>
                  <td className="px-4 py-3 text-gray-800">{formatearFechaTabla(u.fechaInicio)}</td>
                  <td className="px-4 py-3 text-gray-800">{formatearFechaTabla(u.fechaVencimiento)}</td>
                  <td className="px-4 py-3 text-gray-800">{formatearDiasRestantesTabla(u)}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setDetalle(u)}
                      className="inline-flex items-center justify-center rounded-lg border border-gray-200 p-2 text-gray-600 hover:bg-gray-100"
                      title="Ver detalle"
                      aria-label={`Ver detalle de ${u.email}`}
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
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
              ))}
          </tbody>
        </table>
      </div>

      {detalle && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="detalle-usuario-title"
        >
          <div className="absolute inset-0 bg-black/50" onClick={() => setDetalle(null)} aria-hidden="true" />
          <div className="relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl">
            <h3 id="detalle-usuario-title" className="text-lg font-bold text-gray-900">
              Detalle — {detalle.email}
            </h3>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between gap-4 border-b border-gray-100 py-2">
                <dt className="text-gray-500">Punto de venta</dt>
                <dd className="text-right font-medium text-gray-900">{detalle.puntoVenta}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-gray-100 py-2">
                <dt className="text-gray-500">Contrato</dt>
                <dd className="text-right text-gray-900">{detalle.contrato}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-gray-100 py-2">
                <dt className="text-gray-500">Inicio</dt>
                <dd className="text-right text-gray-900">{formatearFechaTabla(detalle.fechaInicio)}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-gray-100 py-2">
                <dt className="text-gray-500">Vencimiento</dt>
                <dd className="text-right text-gray-900">{formatearFechaTabla(detalle.fechaVencimiento)}</dd>
              </div>
            </dl>
            <button
              type="button"
              onClick={() => setDetalle(null)}
              className="mt-6 w-full rounded-xl bg-gray-100 py-2.5 font-semibold text-gray-800 hover:bg-gray-200"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
