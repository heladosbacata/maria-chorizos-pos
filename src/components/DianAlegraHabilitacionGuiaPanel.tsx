"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { auth } from "@/lib/firebase";
import ConfirmarDianTestSetModal from "@/components/ConfirmarDianTestSetModal";
import { posDianTestSetGet, posDianTestSetGuardarBorrador } from "@/lib/pos-dian-test-set-client";
import { wmsPosDianConfigGet, wmsPosDianConfigPut } from "@/lib/wms-pos-dian-client";
import {
  ALEGRA_DIAN_HABILITACION_DOC_URL,
  ALEGRA_DIAN_HABILITACION_INTRO,
  ALEGRA_DIAN_HABILITACION_PASOS,
  type GuiaBloque,
  type GuiaInline,
} from "@/content/alegra-dian-habilitacion-guia";

const PASO_TEST_SET = 3;

type Props = {
  puntoVenta: string | null;
  onVolver: () => void;
  onIrAConfiguracionPos?: () => void;
  onIrAProbarConexion?: () => void;
};

function renderInline(parts: GuiaInline[], keyPrefix: string) {
  return parts.map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (typeof part === "string") {
      return <span key={key}>{part}</span>;
    }
    const className = [part.strong && "font-semibold", part.em && "italic"].filter(Boolean).join(" ");
    if (part.href) {
      return (
        <a
          key={key}
          href={part.href}
          target="_blank"
          rel="noopener noreferrer"
          className={`text-teal-700 underline decoration-teal-600/50 hover:text-teal-900 ${className}`}
        >
          {part.text}
        </a>
      );
    }
    return (
      <span key={key} className={className || undefined}>
        {part.text}
      </span>
    );
  });
}

function BloqueGuia({ bloque, keyPrefix }: { bloque: GuiaBloque; keyPrefix: string }) {
  switch (bloque.type) {
    case "p":
      return <p className="text-sm leading-relaxed text-gray-700">{renderInline(bloque.parts, keyPrefix)}</p>;
    case "ol":
      return (
        <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-gray-700">
          {bloque.items.map((item, i) => (
            <li key={`${keyPrefix}-ol-${i}`}>{renderInline(item, `${keyPrefix}-ol-${i}`)}</li>
          ))}
        </ol>
      );
    case "ul":
      return (
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-gray-700">
          {bloque.items.map((item, i) => (
            <li key={`${keyPrefix}-ul-${i}`}>{renderInline(item, `${keyPrefix}-ul-${i}`)}</li>
          ))}
        </ul>
      );
    case "video":
      return (
        <div className="space-y-2">
          {bloque.observa ? (
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Observa:</p>
          ) : null}
          <div className="aspect-video w-full overflow-hidden rounded-xl border border-gray-200 bg-black shadow-sm">
            <iframe
              title={`Video Alegra — paso ${keyPrefix}`}
              src={`https://www.youtube.com/embed/${bloque.youtubeId}`}
              className="h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>
        </div>
      );
    case "image":
      return (
        <figure className="overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={bloque.src} alt={bloque.alt ?? ""} className="mx-auto max-h-[420px] w-full object-contain" loading="lazy" />
        </figure>
      );
    case "callout": {
      const isWarn = bloque.variant === "warn";
      return (
        <div
          className={`rounded-xl border px-4 py-3 text-sm leading-relaxed ${
            isWarn ? "border-amber-300 bg-amber-50 text-amber-950" : "border-sky-200 bg-sky-50 text-sky-950"
          }`}
        >
          <p className="font-semibold">{bloque.title}</p>
          {bloque.parts ? <p className="mt-2">{renderInline(bloque.parts, `${keyPrefix}-callout`)}</p> : null}
          {bloque.items ? (
            <ol className="mt-2 list-decimal space-y-1.5 pl-5">
              {bloque.items.map((item, i) => (
                <li key={`${keyPrefix}-callout-ol-${i}`}>{renderInline(item, `${keyPrefix}-callout-ol-${i}`)}</li>
              ))}
            </ol>
          ) : null}
        </div>
      );
    }
    default:
      return null;
  }
}

function BloqueTestSetId({
  puntoVenta,
  testSetId,
  setTestSetId,
  cargando,
  guardando,
  guardadoEn,
  error,
  onSolicitarGuardar,
  exitoMensaje,
}: {
  puntoVenta: string | null;
  testSetId: string;
  setTestSetId: (v: string) => void;
  cargando: boolean;
  guardando: boolean;
  guardadoEn: string | null;
  error: string | null;
  onSolicitarGuardar: () => void;
  exitoMensaje: string | null;
}) {
  return (
    <div className="space-y-3 rounded-xl border-2 border-teal-500 bg-teal-50/60 p-4 shadow-sm">
      <p className="text-sm font-semibold text-teal-950">Identificador del set de pruebas (TestSetId)</p>
      <p className="text-xs leading-relaxed text-teal-900/90">
        Punto: <span className="font-medium">{puntoVenta?.trim() || "—"}</span>. Este código queda registrado para que
        Grupo Bacatá lo vea y complete el envío en Alegra.
      </p>
      <label className="block">
        <span className="sr-only">Identificador del set de pruebas</span>
        <input
          type="text"
          value={testSetId}
          onChange={(e) => setTestSetId(e.target.value)}
          disabled={cargando || guardando}
          placeholder="Ej. a70562e0-631e-4ceb-aa65-36887b57dc17"
          className="w-full rounded-lg border border-teal-400 bg-white px-3 py-2.5 font-mono text-sm tracking-tight text-gray-900 shadow-inner disabled:opacity-60"
          spellCheck={false}
          autoComplete="off"
        />
      </label>
      <button
        type="button"
        disabled={cargando || guardando || !testSetId.trim()}
        onClick={onSolicitarGuardar}
        className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Guardar y enviar a Grupo Bacatá
      </button>
      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      {exitoMensaje && !error ? (
        <p className="text-xs font-medium text-teal-800" role="status">
          {exitoMensaje}
          {guardadoEn ? ` · ${new Date(guardadoEn).toLocaleString("es-CO")}` : ""}
        </p>
      ) : null}
      {cargando ? <p className="text-xs text-gray-500">Cargando código guardado…</p> : null}
    </div>
  );
}

export default function DianAlegraHabilitacionGuiaPanel({
  puntoVenta,
  onVolver,
  onIrAConfiguracionPos,
  onIrAProbarConexion,
}: Props) {
  const { user } = useAuth();
  const [tipoComprobantePredeterminado, setTipoComprobantePredeterminado] =
    useState<"documento_interno" | "factura_electronica">("documento_interno");
  const [facturacionHabilitada, setFacturacionHabilitada] = useState(false);
  const [cargandoComprobantePredeterminado, setCargandoComprobantePredeterminado] = useState(true);
  const [guardandoComprobantePredeterminado, setGuardandoComprobantePredeterminado] = useState(false);
  const [mensajeComprobantePredeterminado, setMensajeComprobantePredeterminado] = useState<string | null>(null);
  const [errorComprobantePredeterminado, setErrorComprobantePredeterminado] = useState<string | null>(null);
  const [testSetId, setTestSetId] = useState("");
  const [cargandoTestSet, setCargandoTestSet] = useState(true);
  const [guardandoTestSet, setGuardandoTestSet] = useState(false);
  const [testSetError, setTestSetError] = useState<string | null>(null);
  const [testSetGuardadoEn, setTestSetGuardadoEn] = useState<string | null>(null);
  const [modalConfirmar, setModalConfirmar] = useState(false);
  const [exitoEnvio, setExitoEnvio] = useState<string | null>(null);

  const cargarTestSet = useCallback(async () => {
    if (!user) return;
    setCargandoTestSet(true);
    setTestSetError(null);
    try {
      const token = await auth?.currentUser?.getIdToken();
      if (!token) {
        setTestSetError("No hay sesión.");
        return;
      }
      const r = await posDianTestSetGet(token);
      if (!r.ok) {
        setTestSetError(r.error);
        return;
      }
      setTestSetId(r.dianTestSetId);
      setTestSetGuardadoEn(r.enviadoABacataAt ?? r.updatedAt);
      if (r.enviadoABacataAt) {
        setExitoEnvio("Identificador enviado a Grupo Bacatá. Revisá la campana de notificaciones del POS.");
      }
    } finally {
      setCargandoTestSet(false);
    }
  }, [user]);

  useEffect(() => {
    void cargarTestSet();
  }, [cargarTestSet]);

  const cargarComprobantePredeterminado = useCallback(async () => {
    if (!user) return;
    setCargandoComprobantePredeterminado(true);
    setErrorComprobantePredeterminado(null);
    try {
      const token = await auth?.currentUser?.getIdToken();
      if (!token) return;
      const r = await wmsPosDianConfigGet(token);
      if (!r.ok) {
        setErrorComprobantePredeterminado(r.error);
        return;
      }
      setTipoComprobantePredeterminado(r.tipoComprobantePredeterminado);
      setFacturacionHabilitada(r.habilitado);
    } finally {
      setCargandoComprobantePredeterminado(false);
    }
  }, [user]);

  useEffect(() => {
    void cargarComprobantePredeterminado();
  }, [cargarComprobantePredeterminado]);

  const guardarComprobantePredeterminado = async (tipo: "documento_interno" | "factura_electronica") => {
    if (!user) return;
    setGuardandoComprobantePredeterminado(true);
    setMensajeComprobantePredeterminado(null);
    setErrorComprobantePredeterminado(null);
    try {
      const token = await auth?.currentUser?.getIdToken();
      if (!token) {
        setErrorComprobantePredeterminado("No hay sesión.");
        return;
      }
      const cfg = await wmsPosDianConfigGet(token);
      if (!cfg.ok) {
        setErrorComprobantePredeterminado(cfg.error);
        return;
      }
      if (tipo === "factura_electronica" && !cfg.habilitado) {
        setErrorComprobantePredeterminado("Primero activá la facturación electrónica del punto.");
        setFacturacionHabilitada(false);
        return;
      }
      const put = await wmsPosDianConfigPut(token, {
        emisorNit: cfg.emisorNit,
        alegraCompanyId: cfg.alegraCompanyId,
        dianResolutionNumber: cfg.dianResolutionNumber,
        razonSocialDian: cfg.razonSocialDian,
        prefijoFactura: cfg.prefijoFactura,
        habilitado: cfg.habilitado,
        tipoComprobantePredeterminado: tipo,
      });
      if (!put.ok) {
        setErrorComprobantePredeterminado(put.error);
        return;
      }
      setTipoComprobantePredeterminado(tipo);
      setFacturacionHabilitada(cfg.habilitado);
      setMensajeComprobantePredeterminado(
        tipo === "factura_electronica"
          ? "Listo: al abrir caja se seleccionará Factura electrónica de venta."
          : "Listo: al abrir caja se mantendrá Doc. interno como predeterminado."
      );
    } finally {
      setGuardandoComprobantePredeterminado(false);
    }
  };

  const confirmarYEnviarTestSet = async () => {
    setTestSetError(null);
    setGuardandoTestSet(true);
    try {
      const token = await auth?.currentUser?.getIdToken();
      if (!token) {
        setTestSetError("No hay sesión.");
        return;
      }
      const r = await posDianTestSetGuardarBorrador(token, { dianTestSetId: testSetId });
      if (!r.ok) {
        setTestSetError(r.error);
        return;
      }
      setModalConfirmar(false);
      const msg =
        "TestSetId guardado como borrador. Completá resolución y prefijo en Facturación electrónica (paso 1) y enviá todo a Grupo Bacatá.";
      setExitoEnvio(msg);
    } finally {
      setGuardandoTestSet(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-10">
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

      <header className="space-y-2">
        <h3 className="text-xl font-bold uppercase tracking-tight text-gray-900">
          Guía para habilitar tu facturación electrónica
        </h3>
        <p className="text-sm font-medium text-teal-800">
          Guía del Proceso de Habilitación en la DIAN — Factura Electrónica
        </p>
        <p className="text-sm leading-relaxed text-gray-600">{renderInline(ALEGRA_DIAN_HABILITACION_INTRO, "intro")}</p>
        <p className="text-xs text-gray-500">
          Contenido según la documentación oficial de Alegra (proveedor tecnológico).{" "}
          <a
            href={ALEGRA_DIAN_HABILITACION_DOC_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-teal-700 underline hover:text-teal-900"
          >
            Ver fuente original
          </a>
        </p>
      </header>

      {onIrAConfiguracionPos ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
          <p className="font-semibold">Después de completar la habilitación en la DIAN</p>
          <p className="mt-1 text-amber-950/95">
            Volvé al asistente del POS para cargar NIT, resolución y activar la factura electrónica en caja.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onIrAConfiguracionPos}
              className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-gray-900 hover:bg-amber-400"
            >
              Ir a Facturación electrónica (POS)
            </button>
            {onIrAProbarConexion ? (
              <button
                type="button"
                onClick={onIrAProbarConexion}
                className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
              >
                Probar conexión
              </button>
            ) : null}
          </div>
          <div className="mt-4 rounded-lg border border-amber-200 bg-white/80 px-3 py-3">
            <p className="text-xs font-semibold text-amber-950">Comprobante predeterminado al abrir caja</p>
            <p className="mt-1 text-xs text-amber-950/85">
              Todos los puntos inician con <strong>Doc. interno</strong>. Si tu punto ya quedó habilitado, podés elegir
              que la caja abra directamente en factura electrónica.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                disabled={guardandoComprobantePredeterminado || cargandoComprobantePredeterminado}
                onClick={() => void guardarComprobantePredeterminado("documento_interno")}
                className={`rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                  tipoComprobantePredeterminado === "documento_interno"
                    ? "border-amber-500 bg-amber-100 text-amber-950"
                    : "border-gray-200 bg-white text-gray-700 hover:bg-amber-50"
                } disabled:opacity-60`}
              >
                <span className="block font-semibold">Doc. interno</span>
                <span className="mt-0.5 block text-[11px] opacity-80">Recomendado por defecto para todos.</span>
              </button>
              <button
                type="button"
                disabled={
                  guardandoComprobantePredeterminado ||
                  cargandoComprobantePredeterminado ||
                  !facturacionHabilitada
                }
                onClick={() => void guardarComprobantePredeterminado("factura_electronica")}
                className={`rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                  tipoComprobantePredeterminado === "factura_electronica"
                    ? "border-emerald-500 bg-emerald-50 text-emerald-950"
                    : "border-gray-200 bg-white text-gray-700 hover:bg-emerald-50"
                } disabled:cursor-not-allowed disabled:opacity-60`}
              >
                <span className="block font-semibold">Factura electrónica</span>
                <span className="mt-0.5 block text-[11px] opacity-80">
                  Disponible cuando la facturación electrónica esté activa.
                </span>
              </button>
            </div>
            {mensajeComprobantePredeterminado ? (
              <p className="mt-2 text-xs font-medium text-emerald-800">{mensajeComprobantePredeterminado}</p>
            ) : null}
            {errorComprobantePredeterminado ? (
              <p className="mt-2 text-xs font-medium text-red-700">{errorComprobantePredeterminado}</p>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="space-y-10">
        {ALEGRA_DIAN_HABILITACION_PASOS.map((paso) => (
          <section
            key={paso.numero}
            id={`guia-dian-paso-${paso.numero}`}
            className="scroll-mt-6 space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
          >
            <h4 className="flex items-center gap-2 text-base font-bold text-gray-900">
              <span className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-teal-600 text-xs font-bold text-white">
                {paso.numero}
              </span>
              <span>✔️ Paso {paso.numero} — {paso.titulo}</span>
            </h4>
            <div className="space-y-4">
              {paso.bloques.map((bloque, i) => (
                <BloqueGuia key={`${paso.numero}-${i}`} bloque={bloque} keyPrefix={`${paso.numero}-${i}`} />
              ))}
              {paso.numero === PASO_TEST_SET ? (
                <BloqueTestSetId
                  puntoVenta={puntoVenta}
                  testSetId={testSetId}
                  setTestSetId={setTestSetId}
                  cargando={cargandoTestSet}
                  guardando={guardandoTestSet}
                  guardadoEn={testSetGuardadoEn}
                  error={testSetError}
                  onSolicitarGuardar={() => {
                    setTestSetError(null);
                    setExitoEnvio(null);
                    if (!testSetId.trim()) {
                      setTestSetError("Pegá el identificador del set de pruebas.");
                      return;
                    }
                    setModalConfirmar(true);
                  }}
                  exitoMensaje={exitoEnvio}
                />
              ) : null}
            </div>
          </section>
        ))}
      </div>

      <ConfirmarDianTestSetModal
        open={modalConfirmar}
        testSetId={testSetId}
        puntoVenta={puntoVenta}
        dianResolutionNumber=""
        prefijoFactura=""
        consecutivoDesde=""
        consecutivoHasta=""
        guardando={guardandoTestSet}
        onCancelar={() => setModalConfirmar(false)}
        onConfirmar={() => void confirmarYEnviarTestSet()}
      />
    </div>
  );
}
