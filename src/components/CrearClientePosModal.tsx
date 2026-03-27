"use client";

import { useState } from "react";
import { crearClientePos } from "@/lib/clientes-pos-firestore";
import type { ClientePosFirestoreDoc, TipoClientePos } from "@/types/clientes-pos";

const TIPOS_IDENTIFICACION: { value: string; label: string }[] = [
  { value: "CC", label: "Cédula de ciudadanía" },
  { value: "CE", label: "Cédula de extranjería" },
  { value: "PA", label: "Pasaporte" },
  { value: "NIT", label: "NIT" },
  { value: "TI", label: "Tarjeta de identidad" },
  { value: "RC", label: "Registro civil" },
  { value: "OTRO", label: "Otro" },
];

export interface CrearClientePosModalProps {
  open: boolean;
  onClose: () => void;
  puntoVenta: string;
  uid: string;
  onCreado: (doc: ClientePosFirestoreDoc) => void;
}

export default function CrearClientePosModal({ open, onClose, puntoVenta, uid, onCreado }: CrearClientePosModalProps) {
  const [tipoCliente, setTipoCliente] = useState<TipoClientePos>("persona");
  const [tipoIdentificacion, setTipoIdentificacion] = useState("CC");
  const [numeroIdentificacion, setNumeroIdentificacion] = useState("");
  const [digitoVerificacion, setDigitoVerificacion] = useState("");
  const [nombres, setNombres] = useState("");
  const [apellidos, setApellidos] = useState("");
  const [razonSocial, setRazonSocial] = useState("");
  const [email, setEmail] = useState("");
  const [indicativo, setIndicativo] = useState("+57");
  const [telefono, setTelefono] = useState("");
  const [complementarios, setComplementarios] = useState(false);
  const [dirComplemento, setDirComplemento] = useState("");
  const [ciudadComplemento, setCiudadComplemento] = useState("");
  const [notasComplemento, setNotasComplemento] = useState("");

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mostrarDv = tipoIdentificacion === "NIT";

  const reset = () => {
    setTipoCliente("persona");
    setTipoIdentificacion("CC");
    setNumeroIdentificacion("");
    setDigitoVerificacion("");
    setNombres("");
    setApellidos("");
    setRazonSocial("");
    setEmail("");
    setIndicativo("+57");
    setTelefono("");
    setComplementarios(false);
    setDirComplemento("");
    setCiudadComplemento("");
    setNotasComplemento("");
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const submit = async () => {
    setError(null);
    const datosComplementarios: Record<string, string> = {};
    if (complementarios) {
      if (dirComplemento.trim()) datosComplementarios.direccion = dirComplemento.trim();
      if (ciudadComplemento.trim()) datosComplementarios.ciudad = ciudadComplemento.trim();
      if (notasComplemento.trim()) datosComplementarios.notas = notasComplemento.trim();
    }
    setGuardando(true);
    const r = await crearClientePos({
      puntoVenta,
      tipoCliente,
      tipoIdentificacion,
      numeroIdentificacion,
      ...(mostrarDv && digitoVerificacion.trim() ? { digitoVerificacion } : {}),
      ...(tipoCliente === "persona"
        ? { nombres: nombres.trim(), apellidos: apellidos.trim() }
        : { razonSocial: razonSocial.trim() }),
      email: email.trim(),
      indicativoTelefono: indicativo.trim(),
      telefono: telefono.trim(),
      datosComplementarios: Object.keys(datosComplementarios).length ? datosComplementarios : undefined,
      createdByUid: uid,
    });
    setGuardando(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    const doc: ClientePosFirestoreDoc = {
      id: r.id,
      puntoVenta: puntoVenta.trim(),
      tipoCliente,
      tipoIdentificacion: tipoIdentificacion.trim(),
      numeroIdentificacion: numeroIdentificacion.trim(),
      ...(mostrarDv && digitoVerificacion.trim() ? { digitoVerificacion: digitoVerificacion.trim() } : {}),
      ...(tipoCliente === "persona"
        ? { nombres: nombres.trim(), apellidos: apellidos.trim() }
        : { razonSocial: razonSocial.trim() }),
      ...(email.trim() ? { email: email.trim().toLowerCase() } : {}),
      ...(indicativo.trim() ? { indicativoTelefono: indicativo.trim() } : {}),
      ...(telefono.trim() ? { telefono: telefono.trim() } : {}),
      ...(Object.keys(datosComplementarios).length ? { datosComplementarios } : {}),
      createdByUid: uid,
    };
    onCreado(doc);
    handleClose();
  };

  if (!open) return null;

  const inputClass =
    "mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100";
  const labelClass = "block text-sm font-medium text-gray-700";

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="crear-cliente-titulo">
      <button type="button" className="absolute inset-0 bg-black/50" aria-label="Cerrar" onClick={handleClose} />
      <div className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-gray-200 bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 sm:px-5">
          <h2 id="crear-cliente-titulo" className="text-lg font-semibold text-gray-900">
            Crear cliente
          </h2>
          <button type="button" onClick={handleClose} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="Cerrar">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          <p className="text-xs text-gray-500">
            Punto de venta: <span className="font-medium text-gray-700">{puntoVenta}</span>. Los datos quedan guardados en el POS para futuras compras y fidelización.
          </p>

          <fieldset className="mt-4">
            <legend className={labelClass}>Tipo de cliente</legend>
            <div className="mt-2 flex gap-4">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="tipoCliente"
                  checked={tipoCliente === "persona"}
                  onChange={() => setTipoCliente("persona")}
                  className="text-primary-600"
                />
                Persona
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="tipoCliente"
                  checked={tipoCliente === "empresa"}
                  onChange={() => setTipoCliente("empresa")}
                  className="text-primary-600"
                />
                Empresa
              </label>
            </div>
          </fieldset>

          <div className="mt-5 border-t border-gray-100 pt-4">
            <h3 className="text-sm font-semibold text-gray-900">Datos básicos</h3>

            <div className="mt-3">
              <label className={labelClass}>
                Tipo de identificación <span className="text-red-500">*</span>
              </label>
              <select
                value={tipoIdentificacion}
                onChange={(e) => setTipoIdentificacion(e.target.value)}
                className={inputClass}
              >
                {TIPOS_IDENTIFICACION.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <div className="min-w-0 flex-1">
                <label className={labelClass}>
                  Número de identificación <span className="text-red-500">*</span>
                </label>
                <input
                  className={inputClass}
                  value={numeroIdentificacion}
                  onChange={(e) => setNumeroIdentificacion(e.target.value)}
                  autoComplete="off"
                />
              </div>
              {mostrarDv && (
                <div className="w-16">
                  <label className={labelClass}>DV</label>
                  <input
                    className={inputClass}
                    value={digitoVerificacion}
                    onChange={(e) => setDigitoVerificacion(e.target.value.replace(/\D/g, "").slice(0, 1))}
                    inputMode="numeric"
                    maxLength={1}
                  />
                </div>
              )}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled
                title="Integración con consulta de terceros próximamente"
                className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-400"
              >
                Autocompletar datos
              </button>
              <span className="text-xs text-gray-400" title="Próximamente">
                ℹ️
              </span>
            </div>

            {tipoCliente === "persona" ? (
              <>
                <div className="mt-3">
                  <label className={labelClass}>Nombres</label>
                  <input className={inputClass} value={nombres} onChange={(e) => setNombres(e.target.value)} />
                </div>
                <div className="mt-3">
                  <label className={labelClass}>Apellidos</label>
                  <input className={inputClass} value={apellidos} onChange={(e) => setApellidos(e.target.value)} />
                </div>
              </>
            ) : (
              <div className="mt-3">
                <label className={labelClass}>
                  Razón social <span className="text-red-500">*</span>
                </label>
                <input className={inputClass} value={razonSocial} onChange={(e) => setRazonSocial(e.target.value)} />
              </div>
            )}

            <div className="mt-3">
              <label className={labelClass}>Correo electrónico</label>
              <input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </div>

            <div className="mt-3 flex gap-2">
              <div className="w-24">
                <label className={labelClass}>Indicativo</label>
                <input className={inputClass} value={indicativo} onChange={(e) => setIndicativo(e.target.value)} placeholder="+57" />
              </div>
              <div className="min-w-0 flex-1">
                <label className={labelClass}>Teléfono / Celular</label>
                <input className={inputClass} value={telefono} onChange={(e) => setTelefono(e.target.value)} inputMode="tel" />
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2">
              <span className="text-sm font-medium text-gray-800">Añadir datos complementarios</span>
              <button
                type="button"
                role="switch"
                aria-checked={complementarios}
                onClick={() => setComplementarios((v) => !v)}
                className={`relative h-7 w-12 rounded-full transition-colors ${complementarios ? "bg-primary-600" : "bg-gray-300"}`}
              >
                <span
                  className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${complementarios ? "left-5" : "left-0.5"}`}
                />
              </button>
            </div>

            {complementarios && (
              <div className="mt-3 space-y-3 rounded-lg border border-dashed border-gray-200 p-3">
                <div>
                  <label className={labelClass}>Dirección</label>
                  <input className={inputClass} value={dirComplemento} onChange={(e) => setDirComplemento(e.target.value)} />
                </div>
                <div>
                  <label className={labelClass}>Ciudad</label>
                  <input className={inputClass} value={ciudadComplemento} onChange={(e) => setCiudadComplemento(e.target.value)} />
                </div>
                <div>
                  <label className={labelClass}>Notas</label>
                  <textarea className={inputClass} rows={2} value={notasComplemento} onChange={(e) => setNotasComplemento(e.target.value)} />
                </div>
              </div>
            )}
          </div>

          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        </div>

        <div className="border-t border-gray-200 bg-gray-50 px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={() => void submit()}
            disabled={guardando}
            className="w-full rounded-lg bg-primary-600 py-3 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50 sm:ml-auto sm:w-auto sm:px-8"
          >
            {guardando ? "Creando…" : "Crear cliente"}
          </button>
        </div>
      </div>
    </div>
  );
}
