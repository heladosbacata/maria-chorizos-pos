"use client";

import { useCallback, useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
import { crearUsuarioPosEnWms, actualizarUsuarioPosEnWms } from "@/lib/pos-usuario-admin-api";
import { PUNTOS_DE_VENTA } from "@/lib/puntos-venta";
import {
  formatearDiasRestantesTabla,
  formatearFechaTabla,
  getUsuariosPosRegistrados,
  type UsuarioPosRegistrado,
} from "@/lib/usuarios-pos-wms";

export interface UsuariosPosRegistradosPanelProps {
  onVolver: () => void;
}

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100";

export default function UsuariosPosRegistradosPanel({ onVolver }: UsuariosPosRegistradosPanelProps) {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usuarios, setUsuarios] = useState<UsuarioPosRegistrado[]>([]);
  const [detalle, setDetalle] = useState<UsuarioPosRegistrado | null>(null);

  const [nuevoEmail, setNuevoEmail] = useState("");
  const [nuevoPassword, setNuevoPassword] = useState("");
  const [nuevoPuntoVenta, setNuevoPuntoVenta] = useState("");
  const [creando, setCreando] = useState(false);
  const [mensajeCrear, setMensajeCrear] = useState<string | null>(null);

  const [puntoEdicion, setPuntoEdicion] = useState("");
  const [guardandoPunto, setGuardandoPunto] = useState(false);
  const [mensajeDetalle, setMensajeDetalle] = useState<string | null>(null);

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
      setError("Error al cargar usuarios POS.");
      setUsuarios([]);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  useEffect(() => {
    if (!detalle) {
      setPuntoEdicion("");
      setMensajeDetalle(null);
      return;
    }
    const pv = detalle.puntoVenta === "Sin punto" ? "" : detalle.puntoVenta;
    setPuntoEdicion(pv);
    setMensajeDetalle(null);
  }, [detalle]);

  const crearCajero = async () => {
    setMensajeCrear(null);
    if (!nuevoEmail.trim()) {
      setMensajeCrear("Indica el correo del nuevo cajero.");
      return;
    }
    if (nuevoPassword.length < 8) {
      setMensajeCrear("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    setCreando(true);
    try {
      const token = auth?.currentUser ? await auth.currentUser.getIdToken() : null;
      const r = await crearUsuarioPosEnWms(
        {
          email: nuevoEmail.trim(),
          password: nuevoPassword,
          puntoVenta: nuevoPuntoVenta.trim(),
        },
        token
      );
      if (r.ok) {
        setNuevoEmail("");
        setNuevoPassword("");
        setNuevoPuntoVenta("");
        setMensajeCrear(r.message || "Usuario creado. Puede iniciar sesión en el POS.");
        await cargar();
      } else {
        setMensajeCrear(r.message ?? "No se pudo crear el usuario.");
      }
    } catch {
      setMensajeCrear("Error al crear el usuario.");
    } finally {
      setCreando(false);
    }
  };

  const guardarPuntoDetalle = async () => {
    if (!detalle) return;
    setMensajeDetalle(null);
    setGuardandoPunto(true);
    try {
      const token = auth?.currentUser ? await auth.currentUser.getIdToken() : null;
      const r = await actualizarUsuarioPosEnWms(
        { email: detalle.email, puntoVenta: puntoEdicion.trim() || "Sin punto" },
        token
      );
      if (r.ok) {
        setMensajeDetalle(r.message || "Punto de venta actualizado en el WMS.");
        await cargar();
        setDetalle(null);
      } else {
        setMensajeDetalle(r.message ?? "No se pudo guardar.");
      }
    } catch {
      setMensajeDetalle("Error de red.");
    } finally {
      setGuardandoPunto(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl pb-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 pb-4">
        <div>
          <h2 className="text-xl font-bold text-primary-600 md:text-2xl">Usuarios POS registrados</h2>
          <p className="mt-1 text-sm text-gray-600">
            Contrato del cajero según el WMS (<code className="rounded bg-gray-100 px-1">GET /api/pos/usuarios/registrados</code>).
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
            <code className="rounded bg-amber-100 px-1">diasRestantes</code>. Para crear cajeros:{" "}
            <code className="rounded bg-amber-100 px-1">POST /api/pos/usuarios/crear</code>; para cambiar punto:{" "}
            <code className="rounded bg-amber-100 px-1">POST /api/pos/usuarios/actualizar</code>.
          </p>
        </div>
      )}

      <section className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="text-base font-bold text-gray-900">Nuevo cajero POS</h3>
        <p className="mt-1 text-sm text-gray-600">
          Crea la cuenta en Firebase y el registro de usuario POS en el WMS (rol cajero). Los contadores se invitan desde
          «Invita a tu contador».
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-gray-600">Correo</label>
            <input
              type="email"
              className={inputClass}
              value={nuevoEmail}
              onChange={(e) => setNuevoEmail(e.target.value)}
              placeholder="cajero@empresa.com"
              autoComplete="off"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Contraseña inicial</label>
            <input
              type="password"
              className={inputClass}
              value={nuevoPassword}
              onChange={(e) => setNuevoPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Punto de venta (franquicia)</label>
            <select
              className={inputClass}
              value={nuevoPuntoVenta}
              onChange={(e) => setNuevoPuntoVenta(e.target.value)}
            >
              <option value="">— Sin asignar —</option>
              {PUNTOS_DE_VENTA.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>
        {mensajeCrear && (
          <p className={`mt-3 text-sm ${mensajeCrear.includes("No se") || mensajeCrear.includes("Error") ? "text-red-600" : "text-emerald-700"}`}>
            {mensajeCrear}
          </p>
        )}
        <button
          type="button"
          disabled={creando}
          onClick={() => void crearCajero()}
          className="mt-4 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {creando ? "Creando…" : "Crear usuario"}
        </button>
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
                  No hay usuarios registrados o el WMS devolvió una lista vacía.
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
                    <div className="flex flex-wrap items-center gap-2">
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
                      <button
                        type="button"
                        onClick={() =>
                          window.alert(
                            "Restablecimiento de contraseña: conecta este botón con el endpoint del WMS (por ejemplo POST /api/pos/usuarios/restablecer-contrasena)."
                          )
                        }
                        className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                          />
                        </svg>
                        Restablecer contraseña
                      </button>
                    </div>
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
                <dt className="text-gray-500">Inicio (WMS)</dt>
                <dd className="text-right text-gray-900">{formatearFechaTabla(detalle.fechaInicio)}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-gray-100 py-2">
                <dt className="text-gray-500">Vencimiento (WMS)</dt>
                <dd className="text-right text-gray-900">{formatearFechaTabla(detalle.fechaVencimiento)}</dd>
              </div>
            </dl>
            <div className="mt-4 border-t border-gray-100 pt-3 text-sm">
              <p className="mb-2 font-medium text-gray-700">Punto de venta (guardar en WMS)</p>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <select
                  className={inputClass + " sm:max-w-xs"}
                  value={puntoEdicion}
                  onChange={(e) => setPuntoEdicion(e.target.value)}
                >
                  <option value="">— Sin asignar —</option>
                  {PUNTOS_DE_VENTA.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={guardandoPunto}
                  onClick={() => void guardarPuntoDetalle()}
                  className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {guardandoPunto ? "Guardando…" : "Guardar punto"}
                </button>
              </div>
              {mensajeDetalle && <p className="mt-2 text-sm text-gray-700">{mensajeDetalle}</p>}
            </div>
            {detalle.raw && Object.keys(detalle.raw).length > 0 && (
              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-medium text-primary-600">Campos adicionales (WMS)</summary>
                <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-gray-50 p-3 text-xs text-gray-800">
                  {JSON.stringify(detalle.raw, null, 2)}
                </pre>
              </details>
            )}
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
