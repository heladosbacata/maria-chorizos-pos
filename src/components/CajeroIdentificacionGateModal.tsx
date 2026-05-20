"use client";

import { useCallback, useEffect, useState } from "react";
import CajeroFichaFormFields from "@/components/CajeroFichaFormFields";
import {
  buscarCajeroTurnoPorDocumento,
  crearCajeroTurnoFirestore,
  nombreDisplayCajeroTurno,
  type CajeroTurnoDoc,
} from "@/lib/cajeros-turno-firestore";
import type { CajeroFichaDatos } from "@/types/pos-perfil-cajero";
import { emptyCajeroFicha } from "@/types/pos-perfil-cajero";

export type CajeroIdentificacionMotivo = "arranque" | "periodica";

export interface CajeroIdentificacionGateModalProps {
  open: boolean;
  puntoVenta: string;
  uidSesion: string;
  /** `arranque`: carga/F5 del POS. `periodica`: revalidación cada hora en sesión. */
  motivo?: CajeroIdentificacionMotivo;
  onIdentificado: (cajero: CajeroTurnoDoc) => void;
  /** Salir del POS (cuenta franquiciado) sin validar documento. */
  onCerrarSesion?: () => void | Promise<void>;
}

type Paso = "documento" | "aviso_primera_vez" | "registro" | "exito_registro" | "inactivo";

export default function CajeroIdentificacionGateModal({
  open,
  puntoVenta,
  uidSesion,
  motivo = "arranque",
  onIdentificado,
  onCerrarSesion,
}: CajeroIdentificacionGateModalProps) {
  const [paso, setPaso] = useState<Paso>("documento");
  const [documentoInput, setDocumentoInput] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cajeroInactivo, setCajeroInactivo] = useState<CajeroTurnoDoc | null>(null);
  const [ficha, setFicha] = useState<CajeroFichaDatos>(emptyCajeroFicha());
  const [cajeroRegistroExito, setCajeroRegistroExito] = useState<CajeroTurnoDoc | null>(null);

  const setCampo = useCallback(<K extends keyof CajeroFichaDatos>(k: K, v: CajeroFichaDatos[K]) => {
    setFicha((prev) => ({ ...prev, [k]: v }));
  }, []);

  useEffect(() => {
    if (!open) return;
    setPaso("documento");
    setDocumentoInput("");
    setError(null);
    setCajeroInactivo(null);
    setFicha(emptyCajeroFicha());
    setCajeroRegistroExito(null);
    setBuscando(false);
    setGuardando(false);
  }, [open]);

  const finalizar = useCallback(
    (cajero: CajeroTurnoDoc) => {
      onIdentificado(cajero);
      setPaso("documento");
      setDocumentoInput("");
      setError(null);
      setCajeroInactivo(null);
    },
    [onIdentificado]
  );

  const validarDocumento = async () => {
    const doc = documentoInput.trim();
    if (!doc) {
      setError("Ingresa el número de documento.");
      return;
    }
    setBuscando(true);
    setError(null);
    setCajeroInactivo(null);
    try {
      const r = await buscarCajeroTurnoPorDocumento(puntoVenta, doc);
      if (r.estado === "activo") {
        finalizar(r.cajero);
        return;
      }
      if (r.estado === "inactivo") {
        setCajeroInactivo(r.cajero);
        setPaso("inactivo");
        return;
      }
      const base = emptyCajeroFicha();
      setFicha({
        ...base,
        numeroDocumento: doc,
      });
      setPaso("aviso_primera_vez");
    } finally {
      setBuscando(false);
    }
  };

  const guardarNuevoCajero = async () => {
    const doc = ficha.numeroDocumento.trim();
    if (!doc) {
      setError("El número de documento es obligatorio.");
      return;
    }
    const nom = `${ficha.nombres} ${ficha.apellidos}`.trim();
    if (!nom) {
      setError("Indica nombres y apellidos del cajero.");
      return;
    }
    const correo = ficha.correo.trim();
    if (!correo) {
      setError("Indica el correo electrónico personal del cajero.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
      setError("El correo electrónico personal no es válido.");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const r = await crearCajeroTurnoFirestore({
        puntoVenta,
        ficha,
        createdByUid: uidSesion,
      });
      if (!r.ok || !r.id) {
        setError(r.message ?? "No se pudo crear el cajero.");
        return;
      }
      const ver = await buscarCajeroTurnoPorDocumento(puntoVenta, doc);
      if (ver.estado === "activo") {
        setCajeroRegistroExito(ver.cajero);
        setPaso("exito_registro");
        return;
      }
      setError("El cajero se guardó pero no aparece activo. Contacta al administrador del punto.");
    } finally {
      setGuardando(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={paso === "exito_registro" ? "registro-exito-titulo" : "cajero-identificacion-title"}
    >
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" aria-hidden="true" />
      <div
        className={`relative flex max-h-[min(92vh,720px)] w-full flex-col overflow-hidden rounded-2xl border shadow-2xl ${
          paso === "exito_registro"
            ? "max-w-md border-emerald-200/80 bg-gradient-to-b from-emerald-50 via-white to-cyan-50"
            : "max-w-lg border-gray-200 bg-white"
        }`}
      >
        {paso !== "exito_registro" ? (
          <div className="border-b border-gray-200 px-6 py-4">
            <h2 id="cajero-identificacion-title" className="text-lg font-semibold text-gray-900">
              {paso === "registro"
                ? "Registrar operador — primera vez"
                : paso === "aviso_primera_vez"
                  ? "Registro obligatorio"
                  : motivo === "periodica" && paso === "documento"
                    ? "Validación de identidad"
                    : "Identificación para usar el POS"}
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              Punto de venta: <strong className="text-gray-900">{puntoVenta}</strong>
            </p>
            {paso === "documento" && motivo === "periodica" ? (
              <div
                className="mt-3 rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3.5"
                role="status"
              >
                <p className="text-sm font-semibold leading-snug text-amber-950">
                  Necesitamos validar tu identidad. Por favor digita tu número de documento para continuar vendiendo.
                </p>
              </div>
            ) : null}
            {paso === "documento" && motivo === "arranque" ? (
              <p className="mt-2 text-xs text-gray-500">
                Protocolo de seguridad: cada vez que abrís o recargás el POS (F5) ingresá tu documento. Cada hora en
                sesión volveremos a pedir tu documento para seguir vendiendo. Si ya estás registrado y activo en
                cualquier punto del país, podés identificarte aquí aunque hayas rotado de sede. La primera vez debés
                completar tus datos en este punto.
              </p>
            ) : null}
          </div>
        ) : null}

        <div className={`flex-1 overflow-y-auto ${paso === "exito_registro" ? "px-6 py-8" : "px-6 py-5"}`}>
          {paso === "documento" && motivo === "periodica" ? (
            <p className="mb-3 text-xs text-gray-500">
              Validación programada cada hora. No podés cobrar ni registrar ventas hasta confirmar tu documento.
            </p>
          ) : null}
          {paso === "documento" && (
            <div className="space-y-4">
              <div>
                <label htmlFor="doc-cajero-gate" className="mb-1 block text-sm font-medium text-gray-700">
                  Número de documento <span className="text-red-500">*</span>
                </label>
                <input
                  id="doc-cajero-gate"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={documentoInput}
                  onChange={(e) => setDocumentoInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void validarDocumento();
                  }}
                  placeholder="Ej. 1234567890"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
              </div>
              {error ? (
                <p className="text-sm text-red-600" role="alert">
                  {error}
                </p>
              ) : null}
            </div>
          )}

          {paso === "inactivo" && cajeroInactivo ? (
            <div className="space-y-4">
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
                El documento <strong>{documentoInput.trim()}</strong> corresponde a{" "}
                <strong>{nombreDisplayCajeroTurno(cajeroInactivo.ficha)}</strong>, pero el cajero está{" "}
                <strong>inactivo</strong>. Pide al administrador que lo reactive en el WMS (Facturación GEB → Cajeros a
                nivel nacional) o en Espacio Franquiciado → Cajeros de
                turno.
              </p>
              <button
                type="button"
                onClick={() => {
                  setPaso("documento");
                  setCajeroInactivo(null);
                  setError(null);
                }}
                className="text-sm font-semibold text-primary-600 hover:underline"
              >
                Probar otro documento
              </button>
            </div>
          ) : null}

          {paso === "aviso_primera_vez" && (
            <div className="space-y-4" role="alert">
              <div className="rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-4">
                <p className="text-sm font-bold text-amber-950">Protocolo de seguridad del punto de venta</p>
                <p className="mt-2 text-sm leading-relaxed text-amber-950/95">
                  El documento <strong className="font-mono">{documentoInput.trim()}</strong> no está registrado en el
                  catálogo nacional de operadores María Chorizos.
                </p>
                <p className="mt-3 text-sm leading-relaxed text-amber-950/95">
                  <strong>Primera vez:</strong> debés diligenciar tus datos personales en el formulario siguiente. Quedás
                  registrado en <strong>{puntoVenta}</strong> y podrás identificarte con el mismo documento en cualquier
                  POS del país.
                </p>
                <p className="mt-3 text-sm leading-relaxed text-amber-950/90">
                  <strong>Después del registro:</strong> en cada ingreso al POS solo ingresás tu número de documento y
                  podés continuar trabajando.
                </p>
              </div>
            </div>
          )}

          {paso === "registro" && (
            <div className="space-y-3">
              <p className="rounded-lg border border-sky-100 bg-sky-50/80 px-3 py-2 text-sm text-sky-950">
                Completa todos los campos con datos reales. Documento:{" "}
                <strong className="font-mono">{ficha.numeroDocumento.trim()}</strong>
              </p>
              <CajeroFichaFormFields datos={ficha} setCampo={setCampo} />
              {error ? (
                <p className="text-sm text-red-600" role="alert">
                  {error}
                </p>
              ) : null}
            </div>
          )}

          {paso === "exito_registro" && cajeroRegistroExito ? (
            <div
              className="registro-exito-card relative text-center"
              role="status"
              aria-labelledby="registro-exito-titulo"
            >
              <div
                className="registro-exito-glow pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full bg-emerald-300/50 blur-3xl"
                aria-hidden
              />
              <div
                className="registro-exito-glow pointer-events-none absolute -bottom-12 -right-8 h-44 w-44 rounded-full bg-cyan-300/40 blur-3xl"
                style={{ animationDelay: "0.4s" }}
                aria-hidden
              />
              <span
                className="registro-exito-sparkle absolute left-4 top-2 text-2xl"
                aria-hidden
              >
                ✨
              </span>
              <span
                className="registro-exito-sparkle-delay absolute right-6 top-6 text-xl"
                aria-hidden
              >
                🎉
              </span>
              <div className="relative mx-auto mb-5 flex h-20 w-20 items-center justify-center">
                <span
                  className="registro-exito-check inline-flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/40"
                  aria-hidden
                >
                  <svg className="h-10 w-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </span>
              </div>
              <h2 id="registro-exito-titulo" className="text-2xl font-extrabold tracking-tight text-emerald-950">
                ¡Gracias por registrarte!
              </h2>
              <p className="mt-2 text-lg font-semibold text-emerald-800">
                ¡Hola, {nombreDisplayCajeroTurno(cajeroRegistroExito.ficha)}!
              </p>
              <p className="mx-auto mt-4 max-w-sm text-sm leading-relaxed text-gray-700">
                Apreciamos que hayas diligenciado tus datos con cuidado. Quedaste activo con registro en{" "}
                <strong className="text-gray-900">{puntoVenta}</strong> y podés identificarte con tu documento en
                cualquier punto de venta del país.
              </p>
              <p className="mx-auto mt-4 rounded-xl border border-emerald-200/80 bg-white/80 px-4 py-3 text-sm font-medium text-emerald-900 shadow-sm">
                En tus próximos ingresos (en este u otro POS) solo ingresá tu{" "}
                <strong className="font-mono">número de documento</strong> y seguís trabajando al instante. ¡Nos vemos en
                caja!
              </p>
            </div>
          ) : null}
        </div>

        <div
          className={`flex flex-col gap-3 px-6 py-4 ${
            paso === "exito_registro"
              ? "border-t border-emerald-100/80 bg-white/60"
              : "border-t border-gray-200 bg-gray-50"
          }`}
        >
          <div className="flex flex-wrap gap-3">
          {paso === "documento" && (
            <>
              <button
                type="button"
                disabled={buscando}
                onClick={() => void validarDocumento()}
                className="min-w-0 flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {buscando ? "Validando…" : "Continuar"}
              </button>
            </>
          )}
          {paso === "aviso_primera_vez" && (
            <>
              <button
                type="button"
                onClick={() => {
                  setPaso("documento");
                  setError(null);
                }}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Volver
              </button>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setPaso("registro");
                }}
                className="flex-1 rounded-lg bg-amber-600 py-2.5 text-sm font-semibold text-white hover:bg-amber-700"
              >
                Diligenciar mis datos
              </button>
            </>
          )}
          {paso === "inactivo" && (
            <button
              type="button"
              onClick={() => {
                setPaso("documento");
                setCajeroInactivo(null);
              }}
              className="flex-1 rounded-lg border border-gray-300 bg-white py-2.5 text-sm font-medium text-gray-800 hover:bg-gray-50"
            >
              Volver
            </button>
          )}
          {paso === "registro" && (
            <>
              <button
                type="button"
                disabled={guardando}
                onClick={() => {
                  setPaso("aviso_primera_vez");
                  setError(null);
                }}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Atrás
              </button>
              <button
                type="button"
                disabled={guardando}
                onClick={() => void guardarNuevoCajero()}
                className="flex-1 rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {guardando ? "Guardando…" : "Registrar y continuar"}
              </button>
            </>
          )}
          {paso === "exito_registro" && cajeroRegistroExito ? (
            <button
              type="button"
              onClick={() => finalizar(cajeroRegistroExito)}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 py-3.5 text-base font-bold text-white shadow-lg shadow-emerald-600/30 transition hover:from-emerald-700 hover:to-teal-700 active:scale-[0.98]"
            >
              ¡Entrar al POS!
              <span aria-hidden>→</span>
            </button>
          ) : null}
          </div>
          {onCerrarSesion ? (
            <button
              type="button"
              disabled={buscando || guardando}
              onClick={() => void onCerrarSesion()}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-white py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
            >
              <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
              Cerrar sesión
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
