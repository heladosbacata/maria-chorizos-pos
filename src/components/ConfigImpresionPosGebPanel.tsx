"use client";

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_IMPRESION_PREFS, loadImpresionPrefs, saveImpresionPrefs } from "@/lib/impresion-pos-storage";
import { probarImpresionQz, qzListarImpresoras } from "@/lib/pos-geb-print";
import type { ImpresionPosPrefs, MetodoImpresionPos } from "@/types/impresion-pos";

const QZ_DESCARGA_URL = "https://qz.io/download/";
const QZ_GUIA_URL = "https://qz.io/wiki/getting-started";

export interface ConfigImpresionPosGebPanelProps {
  onVolver: () => void;
}

export default function ConfigImpresionPosGebPanel({ onVolver }: ConfigImpresionPosGebPanelProps) {
  const [prefs, setPrefs] = useState<ImpresionPosPrefs>(DEFAULT_IMPRESION_PREFS);
  const [guardadoMsg, setGuardadoMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [qzEstado, setQzEstado] = useState<"comprobando" | "conectado" | "desconectado">("comprobando");
  const [probando, setProbando] = useState(false);

  useEffect(() => {
    setPrefs(loadImpresionPrefs());
  }, []);

  const comprobarQz = useCallback(async () => {
    setQzEstado("comprobando");
    setError(null);
    try {
      await qzListarImpresoras();
      setQzEstado("conectado");
    } catch {
      setQzEstado("desconectado");
    }
  }, []);

  useEffect(() => {
    void comprobarQz();
  }, [comprobarQz]);

  const guardar = () => {
    saveImpresionPrefs(prefs);
    setGuardadoMsg("Cambios guardados.");
    setTimeout(() => setGuardadoMsg(null), 3000);
  };

  const imprimirPrueba = async () => {
    if (prefs.metodo !== "directa") {
      setError("El documento de prueba con impresora requiere «Impresión directa».");
      return;
    }
    setProbando(true);
    setError(null);
    try {
      await probarImpresionQz(prefs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al imprimir prueba.");
    } finally {
      setProbando(false);
    }
  };

  const setMetodo = (m: MetodoImpresionPos) => {
    setPrefs((p) => ({ ...p, metodo: m }));
  };

  const directaActiva = prefs.metodo === "directa";

  return (
    <div className="mx-auto max-w-6xl pb-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 pb-4">
        <div>
          <button
            type="button"
            onClick={onVolver}
            className="mb-2 text-sm font-medium text-primary-600 hover:underline"
          >
            ← Volver a configuración
          </button>
          <h2 className="text-2xl font-bold text-gray-900">Configuración de impresión</h2>
          <p className="mt-1 text-sm text-gray-600">
            Configura el tipo de impresión, tamaño de papel y las impresoras usadas por defecto en POS GEB.
          </p>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Columna izquierda: método */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Método de impresión</h3>

          <label
            className={`flex cursor-pointer flex-col rounded-xl border-2 p-4 transition-colors ${
              prefs.metodo === "navegador" ? "border-primary-500 bg-primary-50/40" : "border-gray-200 bg-white hover:border-gray-300"
            }`}
          >
            <div className="flex items-start gap-3">
              <input
                type="radio"
                name="metodoImp"
                checked={prefs.metodo === "navegador"}
                onChange={() => setMetodo("navegador")}
                className="mt-1"
              />
              <div>
                <span className="font-semibold text-gray-900">Impresión por navegador</span>
                <p className="mt-1 text-sm text-gray-600">
                  Elige la impresora y ajustes desde el navegador antes de cada impresión.
                </p>
              </div>
            </div>
          </label>

          <label
            className={`relative flex cursor-pointer flex-col rounded-xl border-2 p-4 transition-colors ${
              prefs.metodo === "directa" ? "border-primary-500 bg-primary-50/40" : "border-gray-200 bg-white hover:border-gray-300"
            }`}
          >
            <span className="absolute right-3 top-3 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
              Recomendada
            </span>
            <div className="flex items-start gap-3 pr-24">
              <input
                type="radio"
                name="metodoImp"
                checked={prefs.metodo === "directa"}
                onChange={() => setMetodo("directa")}
                className="mt-1"
              />
              <div>
                <span className="font-semibold text-gray-900">Impresión directa</span>
                <p className="mt-1 text-sm text-gray-600">
                  Imprime automáticamente desde la impresora configurada sin pasos extra (con QZ Tray).
                </p>
              </div>
            </div>
          </label>

          {directaActiva && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/90 p-4">
              <p className="text-sm font-medium text-amber-950">
                Descarga e instala este complemento para poder imprimir directamente
              </p>
              <div className="mt-4 flex flex-col gap-3 rounded-lg border border-amber-100 bg-white p-4 sm:flex-row sm:items-center">
                <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-2xl" aria-hidden>
                  🖨️
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-gray-900">POS GEB Print</p>
                  <p className="text-xs text-gray-500">Powered by QZ</p>
                  <p className="mt-2 text-sm text-gray-700">
                    Estado:{" "}
                    {qzEstado === "comprobando" ? (
                      <span className="text-gray-600">Comprobando…</span>
                    ) : qzEstado === "conectado" ? (
                      <span className="font-medium text-emerald-700">Conectado</span>
                    ) : (
                      <span className="font-medium text-amber-800">Sin instalar o sin ejecutar</span>
                    )}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <a
                      href={QZ_DESCARGA_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700"
                    >
                      Descargar
                    </a>
                    <button
                      type="button"
                      onClick={() => void comprobarQz()}
                      className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
                    >
                      Comprobar de nuevo
                    </button>
                  </div>
                  <p className="mt-3 text-xs text-gray-600">
                    POS GEB Print es un complemento que permite una conexión directa y ágil entre POS GEB Web y tu
                    impresora térmica u oficina, mediante QZ Tray en tu equipo.
                  </p>
                  <a
                    href={QZ_GUIA_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block text-xs font-medium text-primary-600 hover:underline"
                  >
                    Guía para la descarga e instalación de POS GEB Print (QZ Tray)
                  </a>
                </div>
              </div>
            </div>
          )}

          <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-800">
            <input
              type="checkbox"
              checked={prefs.imprimirAutomaticoAlCobrar}
              onChange={(e) => setPrefs((p) => ({ ...p, imprimirAutomaticoAlCobrar: e.target.checked }))}
            />
            Imprimir automáticamente al cobrar una venta
          </label>

          <button
            type="button"
            onClick={guardar}
            className="rounded-lg bg-gray-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-gray-800"
          >
            Guardar cambios
          </button>
          {guardadoMsg && <p className="text-sm text-emerald-700">{guardadoMsg}</p>}
        </div>

        {/* Columna derecha: preferencias */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Preferencias de impresión para factura y documentos</h3>
          <p className="text-sm text-gray-600">
            {directaActiva
              ? "Edita las preferencias usando el método de impresión directa (QZ Tray)."
              : "Algunas opciones solo aplican con impresión directa; el navegador usará su propio cuadro de impresión."}
          </p>

          <ImpresoraSelectDynamic
            disabled={!directaActiva}
            value={prefs.impresoraNombre}
            onChange={(v) => setPrefs((p) => ({ ...p, impresoraNombre: v }))}
          />

          <div className={`grid gap-4 sm:grid-cols-2 ${directaActiva ? "" : "pointer-events-none opacity-50"}`}>
            <div>
              <label className="block text-sm font-medium text-gray-700">Tamaño del papel</label>
              <select
                value={prefs.tamanoPapel}
                onChange={(e) =>
                  setPrefs((p) => ({ ...p, tamanoPapel: e.target.value as ImpresionPosPrefs["tamanoPapel"] }))
                }
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="80mm">80 mm (térmica)</option>
                <option value="58mm">58 mm (térmica)</option>
                <option value="A4">A4</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Copias</label>
              <select
                value={prefs.copias}
                onChange={(e) => setPrefs((p) => ({ ...p, copias: Number(e.target.value) }))}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className={directaActiva ? "" : "pointer-events-none opacity-50"}>
            <p className="text-sm font-medium text-gray-800">Impresión simple (sin logo)</p>
            <label className="mt-2 flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={prefs.impresionSimpleSinLogo}
                onChange={(e) => setPrefs((p) => ({ ...p, impresionSimpleSinLogo: e.target.checked }))}
              />
              Ticket sin logo (solo texto)
            </label>
          </div>

          <div className={directaActiva ? "" : "pointer-events-none opacity-50"}>
            <p className="text-sm font-medium text-gray-800">Márgenes (mm)</p>
            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(
                [
                  ["margenSuperiorMm", "Superior"],
                  ["margenInferiorMm", "Inferior"],
                  ["margenIzquierdaMm", "Izquierda"],
                  ["margenDerechaMm", "Derecha"],
                ] as const
              ).map(([key, label]) => (
                <div key={key}>
                  <label className="text-xs text-gray-600">{label}</label>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={prefs[key]}
                    onChange={(e) =>
                      setPrefs((p) => ({
                        ...p,
                        [key]: Math.max(0, parseFloat(e.target.value) || 0),
                      }))
                    }
                    className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                  />
                </div>
              ))}
            </div>
          </div>

          <button
            type="button"
            disabled={!directaActiva || probando}
            onClick={() => void imprimirPrueba()}
            className="w-full rounded-lg border border-gray-300 bg-gray-100 py-3 text-sm font-semibold text-gray-800 hover:bg-gray-200 disabled:opacity-50"
          >
            {probando ? "Enviando…" : "Imprimir documento de prueba"}
          </button>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </div>
    </div>
  );
}

/** Selector de impresora con lista cargada desde QZ (evita duplicar el select vacío del bloque anterior). */
function ImpresoraSelectDynamic({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  const [opciones, setOpciones] = useState<string[]>([]);
  const [listando, setListando] = useState(false);

  const cargar = useCallback(async () => {
    setListando(true);
    try {
      const lista = await qzListarImpresoras();
      setOpciones(lista);
    } catch {
      setOpciones([]);
    } finally {
      setListando(false);
    }
  }, []);

  useEffect(() => {
    if (!disabled) void cargar();
  }, [disabled, cargar]);

  return (
    <div className={disabled ? "pointer-events-none opacity-50" : ""}>
      <label className="block text-sm font-medium text-gray-700">Impresora por defecto</label>
      <div className="mt-1 flex gap-2">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">(Predeterminada del sistema)</option>
          {opciones.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={listando || disabled}
          onClick={() => void cargar()}
          className="flex-shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
        >
          {listando ? "…" : "Actualizar"}
        </button>
      </div>
      <p className="mt-1 text-xs text-gray-500">Con QZ Tray en ejecución, pulsa «Actualizar» si no ves tu impresora.</p>
    </div>
  );
}
