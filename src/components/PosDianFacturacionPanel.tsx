"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { auth } from "@/lib/firebase";
import type { DianPingOk, DianPingResult } from "@/lib/wms-pos-dian-client";
import ConfirmarDianTestSetModal from "@/components/ConfirmarDianTestSetModal";
import {
  normalizarPrefijoFactura,
  soloDigitosDian,
  validarDatosPaso1,
  type DianHabilitacionDatosPaso1,
} from "@/lib/dian-habilitacion-campos";
import { posDianTestSetEnviarABacata, posDianTestSetGet } from "@/lib/pos-dian-test-set-client";
import { emitirDianTestSetRegistrado } from "@/lib/pos-notificaciones-event";
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
  /** Abre la guía Alegra/DIAN (habilitación en portal DIAN). */
  onAbrirGuiaHabilitacion?: () => void;
};

const CONSECUTIVO_FE_INICIAL = "1";

export default function PosDianFacturacionPanel({
  puntoVenta,
  onVolver,
  initialStep = 1,
  onAbrirGuiaHabilitacion,
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
  /** Rango autorizado en la resolución DIAN (consecutivos). */
  const [consecutivoDesde, setConsecutivoDesde] = useState(CONSECUTIVO_FE_INICIAL);
  const [consecutivoHasta, setConsecutivoHasta] = useState("");
  const [habilitado, setHabilitado] = useState(false);
  const [tipoComprobantePredeterminado, setTipoComprobantePredeterminado] =
    useState<"documento_interno" | "factura_electronica">("documento_interno");
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
  /** TestSetId DIAN (paso 1 obligatorio antes del paso 2). */
  const [dianTestSetId, setDianTestSetId] = useState("");
  const [testSetIdGuardado, setTestSetIdGuardado] = useState(false);
  const [cargandoTestSet, setCargandoTestSet] = useState(true);
  const [guardandoTestSet, setGuardandoTestSet] = useState(false);
  const [testSetError, setTestSetError] = useState<string | null>(null);
  const [testSetGuardadoEn, setTestSetGuardadoEn] = useState<string | null>(null);
  const [modalConfirmarTestSet, setModalConfirmarTestSet] = useState(false);
  const [exitoEnvioTestSet, setExitoEnvioTestSet] = useState<string | null>(null);

  const datosPaso1 = useCallback((): DianHabilitacionDatosPaso1 => {
    return {
      dianTestSetId: dianTestSetId.trim(),
      dianResolutionNumber: soloDigitosDian(dianResolutionNumber),
      prefijoFactura: normalizarPrefijoFactura(prefijoFactura),
      consecutivoDesde: CONSECUTIVO_FE_INICIAL,
      consecutivoHasta: soloDigitosDian(consecutivoHasta),
    };
  }, [dianTestSetId, dianResolutionNumber, prefijoFactura, consecutivoHasta]);

  const errorPaso1Campos = useMemo(() => validarDatosPaso1(datosPaso1()), [datosPaso1]);
  const paso1CamposListos = !errorPaso1Campos;

  const payloadDian = (habilitadoFlag: boolean) => ({
    emisorNit: nitSoloDigitos(emisorNit) || emisorNit.trim(),
    alegraCompanyId: alegraCompanyId.trim(),
    dianResolutionNumber: dianResolutionNumber.trim(),
    razonSocialDian: razonSocialDian.trim(),
    prefijoFactura: prefijoFactura.trim(),
    tipoComprobantePredeterminado,
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
      setTipoComprobantePredeterminado(r.tipoComprobantePredeterminado);
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

  const cargarTestSet = useCallback(async () => {
    if (!user) return;
    setCargandoTestSet(true);
    setTestSetError(null);
    try {
      const token = await auth?.currentUser?.getIdToken();
      if (!token) return;
      const r = await posDianTestSetGet(token);
      if (!r.ok) {
        setTestSetError(r.error);
        setTestSetIdGuardado(false);
        return;
      }
      const id = r.dianTestSetId.trim();
      setDianTestSetId(id);
      if (r.dianResolutionNumber) setDianResolutionNumber(r.dianResolutionNumber);
      if (r.prefijoFactura) setPrefijoFactura(r.prefijoFactura);
      setConsecutivoDesde(CONSECUTIVO_FE_INICIAL);
      if (r.consecutivoHasta) setConsecutivoHasta(r.consecutivoHasta);
      setTestSetIdGuardado(Boolean(r.enviadoABacataAt?.trim()));
      setTestSetGuardadoEn(r.enviadoABacataAt ?? r.updatedAt);
      if (r.enviadoABacataAt) {
        setExitoEnvioTestSet("Identificador enviado a Grupo Bacatá. Podés continuar con el paso 2.");
      }
    } finally {
      setCargandoTestSet(false);
    }
  }, [user]);

  useEffect(() => {
    void cargarTestSet();
  }, [cargarTestSet]);

  /** Sin TestSetId guardado no se puede avanzar al paso 2 ni siguientes. */
  useEffect(() => {
    if (cargandoTestSet) return;
    if (!testSetIdGuardado && step > 1) {
      setStep(1);
        setTestSetError("Confirmá y enviá el identificador del set de pruebas en el paso 1 para continuar.");
    }
  }, [cargandoTestSet, testSetIdGuardado, step]);

  const irAPaso = useCallback(
    (dest: 1 | 2 | 3 | 4 | 5) => {
      if (dest > 1 && !testSetIdGuardado) {
        setTestSetError("Confirmá y enviá el identificador del set de pruebas antes de continuar al paso 2.");
        setStep(1);
        return;
      }
      const errPaso1 = validarDatosPaso1(datosPaso1());
      if (dest > 1 && errPaso1) {
        setTestSetError(errPaso1);
        setStep(1);
        return;
      }
      setTestSetError(null);
      setStep(dest);
    },
    [testSetIdGuardado, datosPaso1]
  );

  const limpiarEstadoEnvioPaso1 = () => {
    setTestSetIdGuardado(false);
    setExitoEnvioTestSet(null);
    setTestSetError(null);
  };

  const solicitarConfirmarTestSet = () => {
    const err = validarDatosPaso1(datosPaso1());
    if (err) {
      setTestSetError(err);
      return;
    }
    setTestSetError(null);
    setExitoEnvioTestSet(null);
    setModalConfirmarTestSet(true);
  };

  const confirmarYEnviarTestSet = async () => {
    setTestSetError(null);
    setGuardandoTestSet(true);
    try {
      const token = await auth?.currentUser?.getIdToken();
      if (!token) {
        setTestSetError("No hay sesión.");
        setModalConfirmarTestSet(false);
        return;
      }
      const datos = datosPaso1();
      const r = await posDianTestSetEnviarABacata(token, datos);
      if (!r.ok) {
        setTestSetError(r.error);
        setTestSetIdGuardado(false);
        setModalConfirmarTestSet(false);
        return;
      }
      setDianTestSetId(r.dianTestSetId);
      setDianResolutionNumber(datos.dianResolutionNumber);
      setPrefijoFactura(datos.prefijoFactura);
      setConsecutivoDesde(CONSECUTIVO_FE_INICIAL);
      setConsecutivoHasta(datos.consecutivoHasta);
      setTestSetIdGuardado(true);
      const ahora = new Date().toISOString();
      setTestSetGuardadoEn(ahora);
      setModalConfirmarTestSet(false);
      const msg = r.notificacionAdmin
        ? "Identificador enviado a Grupo Bacatá. Revisá la campana de notificaciones del POS."
        : "Identificador guardado. Si no ves confirmación en la campana, avisá a administración.";
      setExitoEnvioTestSet(msg);
      emitirDianTestSetRegistrado({
        dianTestSetId: r.dianTestSetId,
        puntoVenta: r.puntoVenta || puntoVenta?.trim() || "—",
        mensaje: msg,
      });
    } finally {
      setGuardandoTestSet(false);
    }
  };

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
  }, [
    user,
    cargando,
    step,
    emisorNit,
    alegraCompanyId,
    dianResolutionNumber,
    razonSocialDian,
    prefijoFactura,
    tipoComprobantePredeterminado,
  ]);

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
    <div className="w-full max-w-6xl space-y-4 pb-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
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
        <div className="min-w-0 flex-1 text-right sm:text-left">
          <h3 className="text-xl font-bold text-gray-900 sm:text-2xl">
            Facturación electrónica (DIAN · Alegra)
          </h3>
          <p className="mt-0.5 text-sm text-gray-600">
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
      </div>

      <nav
        className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5"
        aria-label="Pasos de configuración DIAN"
      >
        {STEPS.map((s) => {
          const bloqueado = s.id > 1 && !testSetIdGuardado && !cargandoTestSet;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => irAPaso(s.id)}
              disabled={bloqueado}
              title={bloqueado ? "Primero guardá el identificador del set de pruebas (paso 1)" : undefined}
              className={`rounded-lg px-2 py-2 text-center text-xs font-medium transition-colors sm:text-left sm:px-3 ${
                step === s.id
                  ? "bg-amber-500 text-white shadow-sm"
                  : bloqueado
                    ? "cursor-not-allowed bg-gray-50 text-gray-400"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              <span className="font-semibold">{s.id}.</span> {s.title}
            </button>
          );
        })}
      </nav>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {error}
        </div>
      ) : null}

      {cargando ? (
        <p className="text-sm text-gray-500">Cargando configuración…</p>
      ) : (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5 lg:p-6">
          {step === 1 && (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)] xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
              <aside className="space-y-3 text-sm leading-snug text-gray-700">
                <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2.5">
                  <p className="font-semibold text-amber-950">En pocas palabras</p>
                  <p className="mt-1.5 text-xs text-amber-950/95">
                    Confirmás los datos de <strong>tu punto</strong> y activás la factura electrónica en caja. Bacatá
                    configura Alegra con el TestSetId y la resolución que ingreses aquí.
                  </p>
                </div>
                <details className="rounded-lg border border-gray-200 bg-gray-50/80 px-3 py-2">
                  <summary className="cursor-pointer text-xs font-semibold text-gray-900">
                    ¿Qué pasa al cobrar con factura electrónica?
                  </summary>
                  <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-gray-600">
                    <li>Elegís «Factura electrónica de venta» en caja.</li>
                    <li>El sistema envía la venta a la DIAN y obtiene número y CUFE.</li>
                    <li>El cliente recibe el comprobante legal.</li>
                  </ol>
                </details>
                {onAbrirGuiaHabilitacion ? (
                  <div className="rounded-xl border border-teal-200 bg-teal-50/90 px-3 py-2.5">
                    <p className="text-xs font-semibold text-teal-950">¿Falta la habilitación en la DIAN?</p>
                    <button
                      type="button"
                      onClick={onAbrirGuiaHabilitacion}
                      className="mt-2 w-full rounded-lg bg-teal-600 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-700"
                    >
                      Abrir guía DIAN · Alegra
                    </button>
                  </div>
                ) : null}
                <p className="text-xs text-gray-500">
                  NIT, razón social e ID Alegra van en el <strong>paso 2</strong>. Si cambiaste de resolución, avisá a
                  administración antes de activar.
                </p>
              </aside>

              <div className="min-w-0 space-y-4">
                <section className="rounded-xl border-2 border-amber-400 bg-amber-50/80 p-3 sm:p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-semibold text-amber-950">Identificador del set de pruebas</p>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-800">Obligatorio</span>
                  </div>
                  <p className="mt-1 text-xs text-amber-950/90">
                    Copiá el TestSetId del paso 3 de la guía (pantalla Habilitación DIAN).
                  </p>
                  <label className="mt-2 block">
                    <span className="sr-only">Identificador del set de pruebas</span>
                    <input
                      type="text"
                      value={dianTestSetId}
                      onChange={(e) => {
                        setDianTestSetId(e.target.value);
                        limpiarEstadoEnvioPaso1();
                      }}
                      disabled={cargandoTestSet || guardandoTestSet}
                      placeholder="Ej. a70562e0-631e-4ceb-aa65-36887b57dc17"
                      className="w-full rounded-lg border border-amber-500/70 bg-white px-3 py-2 font-mono text-sm text-gray-900 shadow-inner disabled:opacity-60"
                      spellCheck={false}
                      autoComplete="off"
                    />
                  </label>
                  {cargandoTestSet ? <p className="mt-2 text-xs text-gray-500">Cargando…</p> : null}
                </section>

                <section className="rounded-xl border-2 border-amber-400 bg-amber-50/80 p-3 sm:p-4">
                  <p className="text-sm font-semibold text-amber-950">Resolución y numeración DIAN</p>
                  <p className="mt-1 text-xs text-amber-950/90">
                    Número de resolución (ej. <span className="font-mono">18760000001</span>), prefijo autorizado (ej.{" "}
                    <strong>FE</strong>) y rango para <strong>DB_ResolucionesDian</strong>. La factura electrónica inicia en{" "}
                    <strong>1</strong> y no continúa el documento interno POS.
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <label className="block sm:col-span-2 xl:col-span-2">
                      <span className="text-xs font-medium text-amber-950">Número de resolución</span>
                      <input
                        type="text"
                        value={dianResolutionNumber}
                        onChange={(e) => {
                          setDianResolutionNumber(e.target.value);
                          limpiarEstadoEnvioPaso1();
                        }}
                        className="mt-1 w-full rounded-lg border-2 border-amber-500/70 bg-white px-3 py-2 text-sm text-gray-900 shadow-inner"
                        placeholder="18760000001"
                        autoComplete="off"
                        aria-label="Número de resolución DIAN"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-medium text-amber-950">Prefijo</span>
                      <input
                        type="text"
                        value={prefijoFactura}
                        onChange={(e) => {
                          setPrefijoFactura(normalizarPrefijoFactura(e.target.value));
                          limpiarEstadoEnvioPaso1();
                        }}
                        className="mt-1 w-full rounded-lg border-2 border-amber-500/70 bg-white px-3 py-2 text-sm uppercase tracking-widest text-gray-900 shadow-inner"
                        placeholder="FE"
                        maxLength={8}
                        autoComplete="off"
                        aria-label="Prefijo de facturación DIAN"
                      />
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className="text-xs font-medium text-amber-950">Desde</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={consecutivoDesde}
                          readOnly
                          className="mt-1 w-full cursor-not-allowed rounded-lg border border-amber-500/60 bg-amber-100/80 px-2 py-2 text-sm font-bold text-amber-950"
                          placeholder="1"
                          autoComplete="off"
                          title="La factura electrónica arranca en 1; este número no usa el consecutivo del documento interno POS."
                        />
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-amber-950">Hasta</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={consecutivoHasta}
                          onChange={(e) => {
                            setConsecutivoHasta(soloDigitosDian(e.target.value));
                            limpiarEstadoEnvioPaso1();
                          }}
                          className="mt-1 w-full rounded-lg border border-amber-500/60 bg-white px-2 py-2 text-sm text-gray-900"
                          placeholder="5000"
                          autoComplete="off"
                        />
                      </label>
                    </div>
                  </div>
                </section>

                <div className="rounded-xl border border-gray-200 bg-gray-50/90 p-3 sm:p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={!paso1CamposListos || cargandoTestSet || guardandoTestSet}
                      onClick={solicitarConfirmarTestSet}
                      title={
                        errorPaso1Campos ??
                        "Guardar TestSetId, resolución y prefijo y notificar a Grupo Bacatá"
                      }
                      aria-disabled={!paso1CamposListos || cargandoTestSet || guardandoTestSet}
                      className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition-all ${
                        paso1CamposListos && !guardandoTestSet && !cargandoTestSet
                          ? "bg-amber-600 text-white shadow-sm hover:bg-amber-700"
                          : "cursor-not-allowed bg-amber-600/25 text-amber-950/45 ring-1 ring-amber-500/25"
                      }`}
                    >
                      {guardandoTestSet ? "Enviando…" : "Guardar y enviar a Grupo Bacatá"}
                    </button>
                    <button
                      type="button"
                      disabled={!testSetIdGuardado || cargandoTestSet || guardandoTestSet}
                      onClick={() => irAPaso(2)}
                      title={
                        !testSetIdGuardado
                          ? "Primero enviá los datos a Grupo Bacatá"
                          : "Ir al paso 2"
                      }
                      className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition-all ${
                        testSetIdGuardado && !cargandoTestSet && !guardandoTestSet
                          ? "bg-gray-900 text-white hover:bg-gray-800"
                          : "cursor-not-allowed bg-gray-400/30 text-gray-600/50 ring-1 ring-gray-300/50"
                      }`}
                    >
                      Continuar al paso 2
                    </button>
                  </div>
                  {!paso1CamposListos ? (
                    <p className="mt-2 text-xs text-gray-500">
                      Completá <strong>TestSetId</strong>, <strong>resolución</strong> y <strong>prefijo</strong> para
                      activar el envío.
                    </p>
                  ) : null}
                  {testSetError ? (
                    <p className="mt-2 text-xs text-red-700" role="alert">
                      {testSetError}
                    </p>
                  ) : null}
                  {exitoEnvioTestSet && !testSetError ? (
                    <p className="mt-2 text-xs font-medium text-emerald-800" role="status">
                      {exitoEnvioTestSet}
                      {testSetGuardadoEn ? ` · ${new Date(testSetGuardadoEn).toLocaleString("es-CO")}` : ""}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Datos del emisor para Firestore y <strong>DB_ResolucionesDian</strong>. NIT solo con números, sin puntos ni
                guiones.
              </p>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-medium text-gray-700">NIT o cédula del emisor</span>
                  <input
                    type="text"
                    value={emisorNit}
                    onChange={(e) => setEmisorNit(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    placeholder="Ej. 901153770"
                    autoComplete="off"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-gray-700">ID empresa Alegra (e-provider)</span>
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
                <label className="block md:col-span-2">
                  <span className="text-sm font-medium text-gray-700">Razón social DIAN (RUT / certificado)</span>
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
                      className="mt-1.5 text-xs font-medium text-amber-700 underline hover:text-amber-900"
                      onClick={() => setRazonSocialDian(syncPreview.data.empresaAlegra.name)}
                    >
                      Usar nombre de Alegra: {syncPreview.data.empresaAlegra.name}
                    </button>
                  ) : null}
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-gray-700">Prefijo en base de datos</span>
                  <input
                    type="text"
                    value={prefijoFactura}
                    onChange={(e) => setPrefijoFactura(e.target.value.toUpperCase())}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm uppercase tracking-wide"
                    placeholder="SETT"
                    maxLength={8}
                    autoComplete="off"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-gray-700">Número de resolución DIAN</span>
                  <input
                    type="text"
                    value={dianResolutionNumber}
                    onChange={(e) => setDianResolutionNumber(e.target.value)}
                    className="mt-1 w-full rounded-lg border-2 border-amber-500/70 bg-amber-50/50 px-3 py-2 text-sm"
                    placeholder="18760000001"
                    autoComplete="off"
                    aria-label="Número de resolución DIAN"
                  />
                </label>
              </div>
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                <div className="min-w-0">{bloqueSincAlegra}</div>
                <button
                  type="button"
                  disabled={guardando}
                  onClick={() => void guardarBorrador()}
                  className="h-fit shrink-0 rounded-xl bg-gray-800 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  {guardando ? "Guardando…" : "Guardar datos del punto"}
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
              <div className="space-y-3 text-sm leading-relaxed text-gray-700">
                <p>
                  Revisá los datos del <strong>paso 2</strong>. Si los cambiás, esperá la verificación automática o
                  volvé a guardar.
                </p>
                <p className="text-xs text-sky-900/80">
                  «Confirmar y continuar» guarda en el WMS y actualiza <strong>DB_ResolucionesDian</strong>.
                </p>
                <p className="text-xs text-gray-500">
                  Si hay error en la verificación, contactá administración con tu NIT y resolución.
                </p>
              </div>
              <div className="space-y-4">
                {bloqueSincAlegra}
                <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-3">
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    irAPaso(2);
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
                    Confirmá cuando la verificación esté en verde y tengas razón social en el paso 2.
                  </p>
                ) : !sincAuto && syncPreview?.kind === "ok" && razonSocialDian.trim().length < 3 ? (
                  <p className="text-xs text-amber-800">Falta la razón social DIAN del paso 2.</p>
                ) : null}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)] lg:items-start">
              <div className="space-y-3">
                <p className="text-sm text-gray-600">
                  Prueba que tu punto puede emitir facturas electrónicas con la DIAN.
                </p>
                <button
                  type="button"
                  disabled={probando || nitSoloDigitos(emisorNit).length < 8}
                  onClick={() => void ejecutarPing()}
                  className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-gray-900 disabled:opacity-50"
                >
                  {probando ? "Probando…" : "Probar conexión"}
                </button>
                {mensajeSheetGuardado ? (
                  <div
                    className="rounded-xl border border-emerald-300 bg-emerald-100 px-3 py-2 text-xs font-medium text-emerald-950"
                    role="status"
                  >
                    {mensajeSheetGuardado}
                  </div>
                ) : null}
              </div>
              {pingOk ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm whitespace-pre-wrap text-emerald-900">
                  {pingOk}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/80 px-4 py-8 text-center text-sm text-gray-500">
                  El resultado de la prueba aparecerá aquí.
                </div>
              )}
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
      <ConfirmarDianTestSetModal
        open={modalConfirmarTestSet}
        testSetId={dianTestSetId}
        dianResolutionNumber={soloDigitosDian(dianResolutionNumber)}
        prefijoFactura={normalizarPrefijoFactura(prefijoFactura)}
        consecutivoDesde={consecutivoDesde}
        consecutivoHasta={consecutivoHasta}
        puntoVenta={puntoVenta}
        guardando={guardandoTestSet}
        onCancelar={() => setModalConfirmarTestSet(false)}
        onConfirmar={() => void confirmarYEnviarTestSet()}
      />
    </div>
  );
}
