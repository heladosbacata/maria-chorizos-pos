"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { auth } from "@/lib/firebase";
import {
  wmsPosAlegraPingPos,
  wmsPosDianConfigGet,
  wmsPosDianConfigPut,
  type DianPingOk,
} from "@/lib/wms-pos-dian-client";

const STEPS = [
  { id: 1, title: "Cómo funciona" },
  { id: 2, title: "Datos de tu punto" },
  { id: 3, title: "Confirmación" },
  { id: 4, title: "Probar conexión" },
  { id: 5, title: "Activar en caja" },
] as const;

type Props = {
  puntoVenta: string | null;
  onVolver: () => void;
};

function resumenPingTexto(r: DianPingOk): string {
  return `Empresa en Alegra: ${r.empresaAlegra.name} (id ${r.empresaAlegra.id}). Resolución ${r.resolucion.prefix} · ${r.resolucion.resolutionNumber} · rango ${r.resolucion.minNumber}–${r.resolucion.maxNumber}.`;
}

export default function PosDianFacturacionPanel({ puntoVenta, onVolver }: Props) {
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [emisorNit, setEmisorNit] = useState("");
  const [alegraCompanyId, setAlegraCompanyId] = useState("");
  const [dianResolutionNumber, setDianResolutionNumber] = useState("");
  const [habilitado, setHabilitado] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [probando, setProbando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pingOk, setPingOk] = useState<string | null>(null);

  /** Verificación del paso 3 (confirmación antes de probar de nuevo en paso 4). */
  const [paso3Status, setPaso3Status] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [paso3Error, setPaso3Error] = useState<string | null>(null);
  const [paso3Ping, setPaso3Ping] = useState<DianPingOk | null>(null);

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
      setDianResolutionNumber(r.dianResolutionNumber);
      setHabilitado(r.habilitado);
    } finally {
      setCargando(false);
    }
  }, [user]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  /** Guarda borrador en WMS y ejecuta ping Alegra; usado en paso 3 (auto) y paso 4 (botón). */
  const guardarYPing = useCallback(async (): Promise<
    { ok: true; ping: DianPingOk; resumen: string } | { ok: false; error: string }
  > => {
    const token = await auth?.currentUser?.getIdToken();
    if (!token) {
      return { ok: false, error: "No hay sesión." };
    }
    const put = await wmsPosDianConfigPut(token, {
      emisorNit: emisorNit.trim(),
      alegraCompanyId: alegraCompanyId.trim(),
      habilitado: false,
      dianResolutionNumber: dianResolutionNumber.trim(),
    });
    if (!put.ok) {
      return { ok: false, error: put.error };
    }
    const r = await wmsPosAlegraPingPos(token);
    if (!r.ok) {
      return { ok: false, error: r.error };
    }
    return { ok: true, ping: r, resumen: resumenPingTexto(r) };
  }, [emisorNit, alegraCompanyId, dianResolutionNumber]);

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
        dianResolutionNumber: dianResolutionNumber.trim(),
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setPingOk(null);
      setPaso3Status("idle");
      setPaso3Ping(null);
      setPaso3Error(null);
    } finally {
      setGuardando(false);
    }
  };

  useEffect(() => {
    if (step !== 3 || cargando || !user) return;
    if (!emisorNit.trim()) {
      setPaso3Status("error");
      setPaso3Error("Completá el NIT o cédula del emisor en el paso 2 y guardá los datos.");
      setPaso3Ping(null);
      return;
    }

    let cancelled = false;
    setPaso3Status("loading");
    setPaso3Error(null);
    setPaso3Ping(null);

    void (async () => {
      const out = await guardarYPing();
      if (cancelled) return;
      if (!out.ok) {
        setPaso3Status("error");
        setPaso3Error(out.error);
        return;
      }
      setPaso3Ping(out.ping);
      setPaso3Status("ok");
    })();

    return () => {
      cancelled = true;
    };
  }, [step, cargando, user, emisorNit, alegraCompanyId, dianResolutionNumber, guardarYPing]);

  const ejecutarPing = async () => {
    if (!user) return;
    setProbando(true);
    setError(null);
    setPingOk(null);
    try {
      const out = await guardarYPing();
      if (!out.ok) {
        setError(out.error);
        return;
      }
      setPingOk(out.resumen);
    } finally {
      setProbando(false);
    }
  };

  const habilitarFacturacion = async () => {
    if (!user) return;
    if (!pingOk) {
      setError("Primero confirmá el paso 3 o ejecutá «Probar conexión» en el paso 4.");
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
        dianResolutionNumber: dianResolutionNumber.trim(),
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
        dianResolutionNumber: dianResolutionNumber.trim(),
      });
      if (r.ok) {
        setHabilitado(false);
        setPingOk(null);
        setPaso3Status("idle");
        setPaso3Ping(null);
      }
    } finally {
      setGuardando(false);
    }
  };

  const irCorregirPaso2 = () => {
    setStep(2);
    setPaso3Status("idle");
    setPaso3Ping(null);
    setPaso3Error(null);
  };

  const confirmarPaso3 = () => {
    if (paso3Status !== "ok" || !paso3Ping) return;
    setPingOk(resumenPingTexto(paso3Ping));
    setStep(4);
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
                <span className="text-sm font-medium text-gray-700">Número de resolución DIAN (opcional)</span>
                <input
                  type="text"
                  value={dianResolutionNumber}
                  onChange={(e) => setDianResolutionNumber(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Ej. 18760000001 — solo si tenés varias resoluciones y debés filtrar"
                  autoComplete="off"
                />
              </label>
              <p className="text-xs text-gray-500">
                Vacío = el WMS elige la resolución activa para tu NIT en <code className="rounded bg-gray-100 px-1">DB_ResolucionesDian</code>.
              </p>
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
            <div className="space-y-4 text-sm leading-relaxed text-gray-700">
              <p>
                Revisá que los datos del paso 2 sean correctos. Si los cambiás, esperá unos segundos a que termine la
                verificación automática o volvé al paso 2.
              </p>
              <p>
                En el WMS debe existir la hoja <code className="rounded bg-gray-100 px-1">DB_ResolucionesDian</code> con
                datos coherentes para tu NIT (en producción: prefijo, rango y clave técnica). En sandbox el WMS puede usar
                la resolución de prueba SETT.
              </p>

              <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3">
                <p className="text-sm font-semibold text-sky-900">Verificación automática</p>
                <p className="mt-1 text-xs text-sky-800">
                  Comprobamos empresa en Alegra y resolución DIAN para el NIT configurado (vía servidor WMS).
                </p>

                {paso3Status === "loading" ? (
                  <p className="mt-3 text-sm text-sky-900">Verificando…</p>
                ) : null}

                {paso3Status === "error" ? (
                  <div
                    className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
                    role="status"
                  >
                    {paso3Error ?? "No se pudo verificar."}
                  </div>
                ) : null}

                {paso3Status === "ok" && paso3Ping ? (
                  <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-950">
                    <p>
                      <span className="font-medium">Empresa:</span> {paso3Ping.empresaAlegra.name}
                    </p>
                    <p className="mt-1">
                      <span className="font-medium">Prefijo de factura:</span> {paso3Ping.resolucion.prefix}
                    </p>
                    <p className="mt-1">
                      <span className="font-medium">Número de resolución:</span> {paso3Ping.resolucion.resolutionNumber}
                    </p>
                    <p className="mt-1">
                      <span className="font-medium">Consecutivos disponibles:</span> del {paso3Ping.resolucion.minNumber}{" "}
                      al {paso3Ping.resolucion.maxNumber}
                    </p>
                    {paso3Ping.notasDian && paso3Ping.notasDian.length > 0 ? (
                      <ul className="mt-2 list-inside list-disc text-xs text-emerald-900">
                        {paso3Ping.notasDian.map((n, i) => (
                          <li key={i}>{n}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <p className="text-xs text-gray-500">
                Si la verificación muestra error, no sigas a activar: escribí a administración con tu NIT y el detalle del
                mensaje.
              </p>

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={irCorregirPaso2}
                  className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
                >
                  Corregir datos
                </button>
                <button
                  type="button"
                  disabled={paso3Status !== "ok"}
                  onClick={confirmarPaso3}
                  className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-gray-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Confirmar y continuar
                </button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Si ya confirmaste el paso anterior, podés volver a probar la conexión antes de habilitar la emisión en
                caja.
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
