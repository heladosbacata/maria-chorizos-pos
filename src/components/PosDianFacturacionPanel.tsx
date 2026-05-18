"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { auth } from "@/lib/firebase";
import type { DianPingOk, DianPingResult } from "@/lib/wms-pos-dian-client";
import {
  wmsPosAlegraPingPos,
  wmsPosAlegraSyncResoluciones,
  wmsPosDianConfigGet,
  wmsPosDianConfigPut,
} from "@/lib/wms-pos-dian-client";

/** NIT/cédula sin puntos ni guiones (como pide el flujo Alegra / WMS). */
function nitSoloDigitos(raw: string): string {
  return raw.replace(/\D/g, "");
}

function textoPingDesdeOk(r: DianPingOk): string {
  const lineas: string[] = [];
  if (r.alegraAmbiente === "sandbox" && r.alegraApiHost) {
    lineas.push(`Ambiente API: SANDBOX (${r.alegraApiHost})`);
    lineas.push(
      "→ Facturas exitosas: buscalas en Alanube Reseller pruebas (sandbox-reseller.alanube.co), empresa vinculada al mismo token COL/JWT del WMS."
    );
    lineas.push("");
  } else if (r.alegraAmbiente === "produccion" && r.alegraApiHost) {
    lineas.push(`Ambiente API: PRODUCCIÓN (${r.alegraApiHost})`);
    lineas.push("→ No vas a ver esas facturas en sandbox-reseller; es otro entorno.");
    lineas.push("");
  }
  lineas.push(
    `Empresa: ${r.empresaAlegra.name}`,
    `Prefijo de factura: ${r.resolucion.prefix}`,
    `Número de resolución: ${r.resolucion.resolutionNumber}`,
    `Consecutivos disponibles: del ${r.resolucion.minNumber} al ${r.resolucion.maxNumber}`
  );
  if (r.notasDian?.length) {
    lineas.push("", "Información adicional:", ...r.notasDian.map((n) => `· ${n}`));
  }
  return lineas.join("\n");
}

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
  /** Razón social del emisor = RUT / FAJ43b (Firestore + hoja en sandbox). */
  const [razonSocialDian, setRazonSocialDian] = useState("");
  /** Prefijo en DB_ResolucionesDian; vacío = SETT en sandbox. */
  const [prefijoFactura, setPrefijoFactura] = useState("");
  const [habilitado, setHabilitado] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [probando, setProbando] = useState(false);
  const [confirmandoPaso3, setConfirmandoPaso3] = useState(false);
  const [mensajeSheetGuardado, setMensajeSheetGuardado] = useState<string | null>(null);
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

  const payloadDian = (habilitadoFlag: boolean) => ({
    emisorNit: nitSoloDigitos(emisorNit) || emisorNit.trim(),
    alegraCompanyId: alegraCompanyId.trim(),
    dianResolutionNumber: dianResolutionNumber.trim(),
    razonSocialDian: razonSocialDian.trim(),
    prefijoFactura: prefijoFactura.trim(),
    habilitado: habilitadoFlag,
  });

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
      setRazonSocialDian(r.razonSocialDian);
      setPrefijoFactura(r.prefijoFactura);
      setHabilitado(r.habilitado);
    } finally {
      setCargando(false);
    }
  }, [user]);

  useEffect(() => {
    if (step !== 4) setMensajeSheetGuardado(null);
  }, [step]);

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
          const put = await wmsPosDianConfigPut(token, payloadDian(false));
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
  }, [user, cargando, step, emisorNit, alegraCompanyId, dianResolutionNumber, razonSocialDian, prefijoFactura]);

  useEffect(() => {
    if (step !== 4) return;
    if (!syncPreview) return;
    if (syncPreview.kind === "ok") setPingOk(textoPingDesdeOk(syncPreview.data));
    else setPingOk(null);
  }, [step, syncPreview]);

  const bloqueSincAlegra = (
    <div className="space-y-2 rounded-xl border border-sky-200 bg-sky-50/90 p-4">
      <p className="text-xs font-semibold text-sky-900">Verificación automática</p>
      <p className="text-xs text-sky-900/90">
        Cuando termines de escribir el NIT (mínimo 8 dígitos), el sistema comprueba si tu punto está listo para facturar.
        Es la misma prueba del paso «Probar conexión».
      </p>
      {sincAuto ? <p className="text-xs text-sky-800">Consultando…</p> : null}
      {syncAutoMensaje ? <p className="text-xs text-red-700">{syncAutoMensaje}</p> : null}
      {syncPreview?.kind === "ok" ? (
        <div className="space-y-2">
          {syncPreview.data.alegraAmbiente ? (
            <p
              className={`rounded-lg px-2.5 py-1.5 text-center text-[11px] font-bold uppercase tracking-wide ${
                syncPreview.data.alegraAmbiente === "sandbox"
                  ? "border border-emerald-300 bg-emerald-100 text-emerald-950"
                  : "border border-amber-400 bg-amber-100 text-amber-950"
              }`}
            >
              WMS → Alegra: {syncPreview.data.alegraAmbiente === "sandbox" ? "sandbox (pruebas)" : "producción"}
              {syncPreview.data.alegraApiHost ? ` · ${syncPreview.data.alegraApiHost}` : ""}
            </p>
          ) : null}
          <div className="whitespace-pre-line rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs text-emerald-950">
            {textoPingDesdeOk(syncPreview.data)}
          </div>
          <p className="text-[11px] leading-snug text-sky-900/85">
            Lo anterior es <strong>referencia</strong> desde Alegra. Para el XML (FAJ43b) y la hoja{" "}
            <strong>DB_ResolucionesDian</strong> se usan los datos del formulario del paso 2: razón social, ID de empresa,
            número de resolución y prefijo.
          </p>
        </div>
      ) : null}
      {syncPreview?.kind === "partial" ? (
        <div className="space-y-1 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          {syncPreview.err.empresaAlegra ? (
            <p>
              <span className="font-medium">Empresa encontrada:</span> {syncPreview.err.empresaAlegra.name}
            </p>
          ) : null}
          <p className="font-medium text-red-800">{syncPreview.err.error}</p>
          <p className="text-amber-900">
            Si el mensaje persiste, contactá a administración María Chorizos con tu NIT y número de resolución.
          </p>
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
      const r = await wmsPosDianConfigPut(token, payloadDian(false));
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
      await wmsPosDianConfigPut(token, payloadDian(false));
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
      const r = await wmsPosDianConfigPut(token, payloadDian(true));
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setHabilitado(true);
    } finally {
      setGuardando(false);
    }
  };

  const confirmarPaso3 = async () => {
    if (sincAuto || syncPreview?.kind !== "ok") return;
    if (razonSocialDian.trim().length < 3) {
      setError("Completá la razón social tal como figura en el RUT (obligatoria para guardar en base de datos y en DB_ResolucionesDian).");
      return;
    }
    if (!user) {
      setError("No hay sesión.");
      return;
    }
    setConfirmandoPaso3(true);
    setError(null);
    try {
      const token = await auth?.currentUser?.getIdToken();
      if (!token) {
        setError("No hay sesión.");
        return;
      }
      const nit = nitSoloDigitos(emisorNit) || emisorNit.trim();
      const put = await wmsPosDianConfigPut(token, payloadDian(false));
      if (!put.ok) {
        setError(put.error);
        return;
      }
      const sync = await wmsPosAlegraSyncResoluciones(token, {
        nitEmisor: nit,
        alegraCompanyId: alegraCompanyId.trim() || undefined,
      });
      if (!sync.ok) {
        setError(sync.error);
        return;
      }
      const detalleServidor = [sync.message, sync.sandboxMetaResolucion].filter(Boolean).join("\n\n");
      const pestana = sync.pestanaGoogleSheet?.trim() || "DB_ResolucionesDian";
      const alerta = [
        "Confirmación",
        "",
        "La información de tu punto (resolución DIAN y empresa Alegra) ya se guardó en la base de datos del centro María Chorizos.",
        "",
        `IMPORTANTE: abrí el archivo de Google del WMS (el mismo ID que usa SHEET_ID en Vercel) y la PESTAÑA «${pestana}».`,
        "Ahí se agrega o actualiza la fila SETT de pruebas con tu NIT. Si solo mirás otra pestaña (ej. datos FV-5), no vas a ver el cambio.",
        "",
        detalleServidor ? `Detalle del servidor:\n${detalleServidor}` : "",
      ]
        .filter((l) => l !== "")
        .join("\n");
      window.alert(alerta);
      const banner = [
        `Listo: revisá la pestaña «${pestana}» en el Google Sheet del WMS (SHEET_ID). `,
        sync.message ? sync.message : "",
      ]
        .join("")
        .trim();
      setMensajeSheetGuardado(banner);
      setPingOk(textoPingDesdeOk(syncPreview.data));
      setStep(4);
    } catch {
      setError("No se pudo sincronizar con el servidor. Reintentá en unos segundos.");
    } finally {
      setConfirmandoPaso3(false);
    }
  };

  const deshabilitar = async () => {
    if (!user) return;
    setGuardando(true);
    setError(null);
    try {
      const token = await auth?.currentUser?.getIdToken();
      if (!token) return;
      const r = await wmsPosDianConfigPut(token, payloadDian(false));
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
            <div className="space-y-4 text-sm leading-relaxed text-gray-700">
              <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3">
                <p className="font-semibold text-amber-950">En pocas palabras</p>
                <p className="mt-2 text-amber-950/95">
                  María Chorizos deja lista la conexión con la DIAN y con Alegra por tu franquicia. En esta pantalla solo
                  confirmás los datos de <strong>tu punto</strong> y activás la factura electrónica en la caja.
                </p>
              </div>
              <p className="font-medium text-gray-900">¿Qué pasa cuando cobrás con factura electrónica?</p>
              <ol className="list-decimal space-y-2 pl-5">
                <li>En caja elegís el tipo de comprobante «Factura electrónica de venta».</li>
                <li>Al cobrar, el sistema envía la venta a la DIAN y recibe el número de factura y el CUFE.</li>
                <li>El cliente recibe el comprobante legal (impresión o correo, según uses en el POS).</li>
              </ol>
              <p>
                Cada punto usa su propio <strong>NIT o cédula</strong> y su <strong>resolución de facturación</strong>{" "}
                autorizada por la DIAN. Los pasos siguientes sirven para comprobar que todo coincide con lo que tenemos
                registrado para vos.
              </p>
              <p className="text-gray-600">
                Si tu punto es nuevo o cambiaste de resolución, avisá a administración antes de activar; ellos completan
                el alta en el sistema central.
              </p>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Completá los datos <strong>exactos</strong> de tu punto: son los que quedan en la base de datos
                (Firestore) y en la hoja <strong>DB_ResolucionesDian</strong> del WMS al confirmar. El NIT escribilo
                solo con números, sin puntos ni guiones.
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
                <span className="text-sm font-medium text-gray-700">
                  Razón social DIAN (como en el RUT / certificado)
                </span>
                <span className="mt-0.5 block text-xs text-gray-500">
                  Debe coincidir con la razón social del emisor ante la DIAN (no el nombre comercial del local). Obligatoria
                  para guardar en base de datos.
                </span>
                <input
                  type="text"
                  value={razonSocialDian}
                  onChange={(e) => setRazonSocialDian(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Ej. Alba Lucía Castaño Vargas"
                  autoComplete="organization"
                />
                {syncPreview?.kind === "ok" ? (
                  <button
                    type="button"
                    className="mt-1.5 text-xs font-medium text-amber-700 underline decoration-amber-600/60 hover:text-amber-900"
                    onClick={() => setRazonSocialDian(syncPreview.data.empresaAlegra.name)}
                  >
                    Usar nombre sugerido por Alegra: {syncPreview.data.empresaAlegra.name}
                  </button>
                ) : null}
              </label>
              <label className="block">
                <span className="text-sm font-medium text-gray-700">ID de empresa en Alegra (e-provider)</span>
                <span className="mt-0.5 block text-xs text-gray-500">
                  Si la verificación lo encontró solo, se rellena solo; podés pegar el ID correcto desde Alegra si hace
                  falta.
                </span>
                <input
                  type="text"
                  value={alegraCompanyId}
                  onChange={(e) => setAlegraCompanyId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs"
                  placeholder="Ej. 01KREDP264B…"
                  spellCheck={false}
                  autoComplete="off"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-gray-700">Prefijo de factura en base de datos</span>
                <span className="mt-0.5 block text-xs text-gray-500">
                  En pruebas Alanube suele ser <strong>SETT</strong>. Dejalo vacío para que el WMS use el valor por defecto
                  de sandbox.
                </span>
                <input
                  type="text"
                  value={prefijoFactura}
                  onChange={(e) => setPrefijoFactura(e.target.value.toUpperCase())}
                  className="mt-1 w-full max-w-xs rounded-lg border border-gray-300 px-3 py-2 text-sm uppercase tracking-wide"
                  placeholder="SETT"
                  maxLength={8}
                  autoComplete="off"
                />
              </label>
              <div className="space-y-2 rounded-xl border-2 border-amber-400 bg-amber-50 p-4 shadow-sm">
                <p className="text-sm font-semibold text-amber-950">Número de resolución DIAN</p>
                <p className="text-xs text-amber-950/90 leading-relaxed">
                  Es el número que aparece en tu resolución de facturación ante la DIAN (no el prefijo de la factura ni el
                  rango de consecutivos). En sandbox Alanube el número de pruebas es <strong>18760000001</strong> (11
                  dígitos). Si no lo escribís, el WMS puede usar el valor por defecto de pruebas.
                </p>
                <input
                  type="text"
                  value={dianResolutionNumber}
                  onChange={(e) => setDianResolutionNumber(e.target.value)}
                  className="w-full rounded-lg border-2 border-amber-500/70 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-inner"
                  placeholder="Ej. 18760000001"
                  autoComplete="off"
                  aria-label="Número de resolución DIAN"
                />
              </div>
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
            <div className="space-y-4 text-sm leading-relaxed text-gray-700">
              <p>
                Revisá que los datos del <strong>paso 2</strong> sean correctos. Si los cambiás, esperá unos segundos a
                que termine la verificación automática o volvé a guardar.
              </p>
              {bloqueSincAlegra}
              <p>
                Si la verificación muestra error, no actives la facturación todavía: escribinos a administración con tu
                NIT y número de resolución para que lo revisemos en el sistema.
              </p>
              <p className="text-xs text-sky-900/80">
                Al pulsar «Confirmar y continuar», el POS guarda en el WMS tu NIT, razón social, ID Alegra, prefijo y
                número de resolución, y actualiza la fila correspondiente en la hoja <strong>DB_ResolucionesDian</strong>{" "}
                (Google Sheets).
              </p>
              <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setStep(2);
                  }}
                  className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-50"
                >
                  Corregir datos
                </button>
                <button
                  type="button"
                  disabled={
                    sincAuto ||
                    syncPreview?.kind !== "ok" ||
                    confirmandoPaso3 ||
                    razonSocialDian.trim().length < 3
                  }
                  onClick={() => void confirmarPaso3()}
                  className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-gray-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {confirmandoPaso3 ? "Guardando en base de datos…" : "Confirmar y continuar"}
                </button>
              </div>
              {!sincAuto && syncPreview?.kind !== "ok" && nitSoloDigitos(emisorNit).length >= 8 ? (
                <p className="text-xs text-gray-500">
                  «Confirmar y continuar» se habilita cuando la verificación automática esté en verde y hayas cargado la
                  razón social DIAN (paso 2).
                </p>
              ) : !sincAuto && syncPreview?.kind === "ok" && razonSocialDian.trim().length < 3 ? (
                <p className="text-xs text-amber-800">
                  Falta la razón social DIAN del paso 2 (como en el RUT) para poder guardar en base de datos.
                </p>
              ) : null}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Hacé una prueba completa: el sistema confirma que tu punto puede emitir facturas electrónicas con la DIAN.
              </p>
              {mensajeSheetGuardado ? (
                <div
                  className="rounded-xl border border-emerald-300 bg-emerald-100 px-4 py-3 text-sm font-medium text-emerald-950"
                  role="status"
                >
                  {mensajeSheetGuardado}
                </div>
              ) : null}
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
                Si la prueba del paso anterior fue exitosa, activá la facturación en este POS. Desde caja, al cobrar,
                elegí «Factura electrónica de venta» y el comprobante se enviará automáticamente a la DIAN.
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
