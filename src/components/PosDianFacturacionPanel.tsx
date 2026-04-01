"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { auth } from "@/lib/firebase";
import {
  wmsPosAlegraPingPos,
  wmsPosDianConfigGet,
  wmsPosDianConfigPut,
} from "@/lib/wms-pos-dian-client";

const STEPS = [
  { id: 1, title: "Cuenta reseller Alegra" },
  { id: 2, title: "NIT o cédula del punto" },
  { id: 3, title: "Resolución en el WMS" },
  { id: 4, title: "Probar conexión" },
  { id: 5, title: "Habilitar facturación" },
] as const;

type Props = {
  puntoVenta: string | null;
  onVolver: () => void;
};

export default function PosDianFacturacionPanel({ puntoVenta, onVolver }: Props) {
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [emisorNit, setEmisorNit] = useState("");
  const [alegraCompanyId, setAlegraCompanyId] = useState("");
  const [habilitado, setHabilitado] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [probando, setProbando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pingOk, setPingOk] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!user) return;
    setCargando(true);
    setError(null);
    try {
      const token = await auth?.currentUser?.getIdToken();
      if (!token) {
        setError("No hay sesión.");
        return;
      }
      const r = await wmsPosDianConfigGet(token);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setEmisorNit(r.emisorNit);
      setAlegraCompanyId(r.alegraCompanyId);
      setHabilitado(r.habilitado);
    } finally {
      setCargando(false);
    }
  }, [user]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const guardarBorrador = async () => {
    if (!user) return;
    setGuardando(true);
    setError(null);
    try {
      const token = await auth?.currentUser?.getIdToken();
      if (!token) {
        setError("No hay sesión.");
        return;
      }
      const r = await wmsPosDianConfigPut(token, {
        emisorNit: emisorNit.trim(),
        alegraCompanyId: alegraCompanyId.trim(),
        habilitado: false,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setPingOk(null);
    } finally {
      setGuardando(false);
    }
  };

  const ejecutarPing = async () => {
    if (!user) return;
    setProbando(true);
    setError(null);
    setPingOk(null);
    try {
      const token = await auth?.currentUser?.getIdToken();
      if (!token) {
        setError("No hay sesión.");
        return;
      }
      await wmsPosDianConfigPut(token, {
        emisorNit: emisorNit.trim(),
        alegraCompanyId: alegraCompanyId.trim(),
        habilitado: false,
      });
      const r = await wmsPosAlegraPingPos(token);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setPingOk(
        `Empresa en Alegra: ${r.empresaAlegra.name} (id ${r.empresaAlegra.id}). Resolución ${r.resolucion.prefix} · ${r.resolucion.resolutionNumber} · rango ${r.resolucion.minNumber}–${r.resolucion.maxNumber}.`
      );
    } finally {
      setProbando(false);
    }
  };

  const habilitarFacturacion = async () => {
    if (!user) return;
    if (!pingOk) {
      setError("Primero ejecutá «Probar conexión» y verificá que todo esté en verde.");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const token = await auth?.currentUser?.getIdToken();
      if (!token) {
        setError("No hay sesión.");
        return;
      }
      const r = await wmsPosDianConfigPut(token, {
        emisorNit: emisorNit.trim(),
        alegraCompanyId: alegraCompanyId.trim(),
        habilitado: true,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setHabilitado(true);
    } finally {
      setGuardando(false);
    }
  };

  const deshabilitar = async () => {
    if (!user) return;
    setGuardando(true);
    setError(null);
    try {
      const token = await auth?.currentUser?.getIdToken();
      if (!token) return;
      const r = await wmsPosDianConfigPut(token, {
        emisorNit: emisorNit.trim(),
        alegraCompanyId: alegraCompanyId.trim(),
        habilitado: false,
      });
      if (r.ok) {
        setHabilitado(false);
        setPingOk(null);
      }
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-8">
      <button
        type="button"
        onClick={onVolver}
        className="inline-flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Configuración
      </button>

      <div>
        <h3 className="text-xl font-bold text-gray-900">Facturación electrónica (DIAN · Alegra)</h3>
        <p className="mt-1 text-sm text-gray-600">
          Punto: <span className="font-medium text-gray-800">{puntoVenta?.trim() || "—"}</span>
          {habilitado ? (
            <span className="ml-2 inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
              Habilitado
            </span>
          ) : (
            <span className="ml-2 inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
              No habilitado
            </span>
          )}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {STEPS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setStep(s.id)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              step === s.id ? "bg-amber-500 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {s.id}. {s.title}
          </button>
        ))}
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {error}
        </div>
      ) : null}

      {cargando ? (
        <p className="text-sm text-gray-500">Cargando configuración…</p>
      ) : (
        <div className="space-y-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          {step === 1 && (
            <div className="space-y-3 text-sm leading-relaxed text-gray-700">
              <p>
                Bacatá opera como <strong>reseller</strong> en Alegra: se usa el <strong>mismo token</strong> en el servidor
                del WMS para todas las empresas (puntos) dadas de alta en esa cuenta.
              </p>
              <p>
                Cada punto de venta debe existir como <strong>empresa</strong> en Alegra con su NIT o cédula (persona
                natural o jurídica), según lo hayan configurado con Alegra.
              </p>
              <p className="text-amber-900">
                Si aún no tenés la empresa del franquiciado en Alegra, completá ese alta con el soporte de Alegra antes de
                seguir.
              </p>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Debe coincidir con el documento registrado en la empresa de Alegra de este punto (sin puntos en el NIT).
              </p>
              <label className="block">
                <span className="text-sm font-medium text-gray-700">NIT o cédula del emisor (este punto)</span>
                <input
                  type="text"
                  value={emisorNit}
                  onChange={(e) => setEmisorNit(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Ej. 901153770 o 1234567890"
                  autoComplete="off"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-gray-700">Id empresa en Alegra (opcional)</span>
                <input
                  type="text"
                  value={alegraCompanyId}
                  onChange={(e) => setAlegraCompanyId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Si Alegra te dio un id numérico de empresa, pegalo aquí"
                  autoComplete="off"
                />
              </label>
              <p className="text-xs text-gray-500">
                Si lo dejás vacío, el WMS buscará la empresa por el NIT/cédula en la lista de compañías de la cuenta
                reseller.
              </p>
              <button
                type="button"
                disabled={guardando}
                onClick={() => void guardarBorrador()}
                className="rounded-xl bg-gray-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {guardando ? "Guardando…" : "Guardar datos del punto"}
              </button>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3 text-sm leading-relaxed text-gray-700">
              <p>
                En el WMS debe existir la hoja <code className="rounded bg-gray-100 px-1">DB_ResolucionesDian</code> con
                una fila para <strong>este mismo NIT/cédula</strong> (columna tipo{" "}
                <code className="rounded bg-gray-100 px-1">NIT_EMISOR</code>), prefijo autorizado, rango de numeración y{" "}
                <strong>clave técnica</strong> válida.
              </p>
              <p>
                Es el mismo proceso que usa Facturación GEB: administración carga o revisa esa fila por franquiciado. Sin
                esa fila, la DIAN rechazará el documento.
              </p>
              <p className="text-xs text-gray-500">
                Certificado digital y habilitación en la DIAN siguen las guías de Alegra; este paso solo enlaza datos en
                Bacatá.
              </p>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Comprueba que el servidor WMS llegue a Alegra y que exista resolución para tu NIT en la hoja.
              </p>
              <button
                type="button"
                disabled={probando || !emisorNit.trim()}
                onClick={() => void ejecutarPing()}
                className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-gray-900 disabled:opacity-50"
              >
                {probando ? "Probando…" : "Probar conexión"}
              </button>
              {pingOk ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                  {pingOk}
                </div>
              ) : null}
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Cuando la prueba sea correcta, habilitá la emisión. En caja, elegí «Factura electrónica de venta» y, al
                cobrar, se enviará a la DIAN vía Alegra (consecutivo único por punto).
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={guardando || !pingOk}
                  onClick={() => void habilitarFacturacion()}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Habilitar facturación electrónica en este POS
                </button>
                {habilitado ? (
                  <button
                    type="button"
                    disabled={guardando}
                    onClick={() => void deshabilitar()}
                    className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-800 disabled:opacity-50"
                  >
                    Deshabilitar
                  </button>
                ) : null}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
