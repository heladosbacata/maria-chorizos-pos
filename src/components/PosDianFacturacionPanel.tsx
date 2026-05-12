"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { auth } from "@/lib/firebase";
import type { DianPingOk, DianPingResult } from "@/lib/wms-pos-dian-client";
import {
  wmsPosAlegraPingPos,
  wmsPosDianConfigGet,
  wmsPosDianConfigPut,
} from "@/lib/wms-pos-dian-client";

/** NIT/cédula sin puntos ni guiones (como pide el flujo Alegra / WMS). */
function nitSoloDigitos(raw: string): string {
  return raw.replace(/\D/g, "");
}

function textoPingDesdeOk(r: DianPingOk): string {
  const base = `Empresa en Alegra: ${r.empresaAlegra.name} (id ${r.empresaAlegra.id}). Resolución ${r.resolucion.prefix} · ${r.resolucion.resolutionNumber} · rango ${r.resolucion.minNumber}–${r.resolucion.maxNumber}.`;
  if (r.notasDian?.length) {
    return `${base}\n\nNotas (pruebas DIAN / FAJ43b):\n- ${r.notasDian.join("\n- ")}`;
  }
  return base;
}

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
  /** 1 por defecto; usar 2 al abrir desde «Sincroniza tu resolución» para ir directo a NIT + resolución. */
  initialStep?: 1 | 2 | 3 | 4 | 5;
};

export default function PosDianFacturacionPanel({
  puntoVenta,
  onVolver,
  initialStep = 1,
}: Props) {
  const { user } = useAuth();
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(initialStep);
  const [emisorNit, setEmisorNit] = useState("");
  const [alegraCompanyId, setAlegraCompanyId] = useState("");
  /** Número de resolución DIAN (coincide con la numeración en hoja / WMS). */
  const [dianResolutionNumber, setDianResolutionNumber] = useState("");
  const [habilitado, setHabilitado] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [probando, setProbando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pingOk, setPingOk] = useState<string | null>(null);
  /** Sincronización automática al editar NIT / id empresa (pasos 2 y 3). */
  const [sincAuto, setSincAuto] = useState(false);
  const [syncPreview, setSyncPreview] = useState<
    | { kind: "ok"; data: DianPingOk }
    | { kind: "partial"; err: Extract<DianPingResult, { ok: false }> }
    | null
  >(null);
  const [syncAutoMensaje, setSyncAutoMensaje] = useState<string | null>(null);
  const debounceSyncRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      setEmisorNit(nitSoloDigitos(r.emisorNit) || r.emisorNit.trim());
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

  /** Al dejar de tipear NIT o id empresa: guarda borrador en Firestore y consulta Alegra + resolución (misma lógica que «Probar conexión»). */
  useEffect(() => {
    if (debounceSyncRef.current) {
      clearTimeout(debounceSyncRef.current);
      debounceSyncRef.current = null;
    }
    if (!user || cargando) return;
    if (step !== 2 && step !== 3) return;
    const nit = nitSoloDigitos(emisorNit);
    if (nit.length < 8) {
      setSyncPreview(null);
      setSyncAutoMensaje(null);
      return;
    }
    debounceSyncRef.current = setTimeout(() => {
      void (async () => {
        setSincAuto(true);
        setSyncAutoMensaje(null);
        try {
          const token = await auth?.currentUser?.getIdToken();
          if (!token) return;
          const put = await wmsPosDianConfigPut(token, {
            emisorNit: nit,
            alegraCompanyId: alegraCompanyId.trim(),
            dianResolutionNumber: dianResolutionNumber.trim(),
            habilitado: false,
          });
          if (!put.ok) {
            setSyncPreview(null);
            setSyncAutoMensaje(put.error);
            return;
          }
          const r = await wmsPosAlegraPingPos(token);
          if (r.ok) {
            setSyncPreview({ kind: "ok", data: r });
            setAlegraCompanyId((prev) => (prev.trim() ? prev : r.empresaAlegra.id));
            setSyncAutoMensaje(null);
          } else {
            setSyncPreview({ kind: "partial", err: r });
            setSyncAutoMensaje(null);
          }
        } catch {
          setSyncPreview(null);
          setSyncAutoMensaje("No se pudo contactar al servidor.");
        } finally {
          setSincAuto(false);
        }
      })();
    }, 900);
    return () => {
      if (debounceSyncRef.current) {
        clearTimeout(debounceSyncRef.current);
        debounceSyncRef.current = null;
      }
    };
  }, [user, cargando, step, emisorNit, alegraCompanyId, dianResolutionNumber]);

  useEffect(() => {
    if (step !== 4) return;
    if (!syncPreview) return;
    if (syncPreview.kind === "ok") setPingOk(textoPingDesdeOk(syncPreview.data));
    else setPingOk(null);
  }, [step, syncPreview]);

  const bloqueSincAlegra = (
    <div className="space-y-2 rounded-xl border border-sky-200 bg-sky-50/90 p-4">
      <p className="text-xs font-semibold text-sky-900">Sincronización con Alegra / WMS (pruebas)</p>
      <p className="text-xs text-sky-900/90">
        Al dejar de escribir (~1 s), con 8 o más dígitos en el NIT/cédula, se guarda borrador y se llama a{" "}
        <code className="rounded bg-sky-100/80 px-1">ping-pos</code> (misma validación que «Probar conexión»): empresa en
        Alegra, fila en <code className="rounded bg-sky-100/80 px-1">DB_ResolucionesDian</code> y notas DIAN si el WMS
        las envía. Incluye NIT, id Alegra y número de resolución del paso 2 si los cargaste.
      </p>
      {sincAuto ? <p className="text-xs text-sky-800">Consultando…</p> : null}
      {syncAutoMensaje ? <p className="text-xs text-red-700">{syncAutoMensaje}</p> : null}
      {syncPreview?.kind === "ok" ? (
        <div className="whitespace-pre-line rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs text-emerald-950">
          {textoPingDesdeOk(syncPreview.data)}
        </div>
      ) : null}
      {syncPreview?.kind === "partial" ? (
        <div className="space-y-1 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          {syncPreview.err.empresaAlegra ? (
            <p>
              <span className="font-medium">Empresa (parcial):</span> {syncPreview.err.empresaAlegra.name} (id{" "}
              {syncPreview.err.empresaAlegra.id})
            </p>
          ) : null}
          <p className="font-medium text-red-800">{syncPreview.err.error}</p>
          {syncPreview.err.paso != null ? (
            <p className="text-amber-900">Referencia paso wizard: {String(syncPreview.err.paso)}</p>
          ) : null}
        </div>
      ) : null}
      {!sincAuto && nitSoloDigitos(emisorNit).length < 8 ? (
        <p className="text-xs text-gray-600">Escribí al menos 8 dígitos para disparar la consulta automática.</p>
      ) : null}
    </div>
  );

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
        emisorNit: nitSoloDigitos(emisorNit) || emisorNit.trim(),
        alegraCompanyId: alegraCompanyId.trim(),
        dianResolutionNumber: dianResolutionNumber.trim(),
        habilitado: false,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setPingOk(null);
      setSyncAutoMensaje(null);
      const nitGuardado = nitSoloDigitos(emisorNit);
      if (nitGuardado.length >= 8) {
        try {
          const rPing = await wmsPosAlegraPingPos(token);
          if (rPing.ok) {
            setSyncPreview({ kind: "ok", data: rPing });
            setAlegraCompanyId((prev) => (prev.trim() ? prev : rPing.empresaAlegra.id));
          } else {
            setSyncPreview({ kind: "partial", err: rPing });
          }
        } catch {
          setSyncPreview(null);
          setSyncAutoMensaje("No se pudo contactar al servidor.");
        }
      }
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
        emisorNit: nitSoloDigitos(emisorNit) || emisorNit.trim(),
        alegraCompanyId: alegraCompanyId.trim(),
        dianResolutionNumber: dianResolutionNumber.trim(),
        habilitado: false,
      });
      const r = await wmsPosAlegraPingPos(token);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setPingOk(textoPingDesdeOk(r));
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
        emisorNit: nitSoloDigitos(emisorNit) || emisorNit.trim(),
        alegraCompanyId: alegraCompanyId.trim(),
        dianResolutionNumber: dianResolutionNumber.trim(),
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
        emisorNit: nitSoloDigitos(emisorNit) || emisorNit.trim(),
        alegraCompanyId: alegraCompanyId.trim(),
        dianResolutionNumber: dianResolutionNumber.trim(),
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
                Según la documentación de Alegra e-provider, el token queda ligado a la compañía{" "}
                <strong>principal</strong>; cada franquicia emisora debe existir como compañía{" "}
                <strong>asociada</strong>. Bacatá usa una cuenta tipo reseller: el WMS usa el{" "}
                <strong>mismo token</strong> para todas las compañías asociadas de esa cuenta.
              </p>
              <p>
                Antes de usar este POS, en Alegra/API deben estar hechos (fuera de esta pantalla) el{" "}
                <strong>alta de la compañía asociada</strong> (p. ej. <code className="rounded bg-gray-100 px-1">createcompany</code> con NIT, DV, certificado) y la{" "}
                <strong>habilitación en la DIAN</strong> con el set de pruebas (
                <code className="rounded bg-gray-100 px-1">createtestset</code>
                ). Para <strong>factura electrónica de venta</strong> el tipo de set es{" "}
                <code className="rounded bg-gray-100 px-1">invoices</code> (no confundir con{" "}
                <code className="rounded bg-gray-100 px-1">pos</code>, que es documento equivalente POS). En sandbox,
                Alegra indica el <code className="rounded bg-gray-100 px-1">governmentId</code> fijo de pruebas en su guía.
              </p>
              <p>
                Guía oficial:{" "}
                <a
                  href="https://e-provider-docs.alegra.com/docs/gu%C3%ADa-creaci%C3%B3n-de-una-compa%C3%B1%C3%ADa-asociada"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-amber-800 underline decoration-amber-600/60 underline-offset-2 hover:text-amber-900"
                >
                  Creación y habilitación de una compañía asociada (Alegra)
                </a>
                . Los pasos 2 a 4 aquí solo <strong>verifican</strong> NIT, id de empresa y resolución que el WMS enviará
                al emitir (alineado al objeto <code className="rounded bg-gray-100 px-1">resolution</code> de la API).
              </p>
              <p className="text-amber-900">
                Si la compañía asociada o el set DIAN aún no están listos, completá ese proceso con Alegra o el equipo
                técnico antes de seguir.
              </p>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Completá el <strong>NIT o cédula</strong> del punto y, si corresponde, el{" "}
                <strong>número de resolución DIAN</strong> de facturas de venta. Deben coincidir con la empresa en Alegra
                y con la fila en el WMS (sin puntos en el NIT).
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
              <div className="space-y-2 rounded-xl border-2 border-amber-400 bg-amber-50 p-4 shadow-sm">
                <p className="text-sm font-semibold text-amber-950">Número de resolución DIAN</p>
                <p className="text-xs text-amber-950/90 leading-relaxed">
                  Es el <strong>número del acto de resolución</strong> de numeración de facturas de venta (no el prefijo
                  tipo FV-5 ni el rango desde–hasta). Si tenés más de una resolución en Alanube para tu NIT, pegá aquí el
                  número exacto que usás para facturas de venta. Lo encontrás en la resolución DIAN o en Alanube. Si lo
                  dejás vacío, el sistema intentará elegir una automáticamente.
                </p>
                <input
                  type="text"
                  value={dianResolutionNumber}
                  onChange={(e) => setDianResolutionNumber(e.target.value)}
                  className="w-full rounded-lg border-2 border-amber-500/70 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-inner"
                  placeholder="Escribí aquí el número de resolución (ej. 18760000001)"
                  autoComplete="off"
                  aria-label="Número de resolución DIAN"
                />
              </div>
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
              {bloqueSincAlegra}
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
              {bloqueSincAlegra}
              <p className="text-xs text-sky-900">
                El NIT y el número de resolución DIAN los cargás en el <strong>paso 2</strong>; si los cambiás, esperá la
                sincronización automática o usá «Guardar datos del punto» y revisá el resultado arriba.
              </p>
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
                disabled={probando || nitSoloDigitos(emisorNit).length < 8}
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
