"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import ClienteFrecuenteAvisoModal from "@/components/ClienteFrecuenteAvisoModal";
import { formatPesosCop, parsePesosCopInput } from "@/lib/pesos-cop-input";

const TIPO_PAGO_OTRO = "Otro";
const TIPO_OTRO_MAX_LEN = 80;

export const TIPOS_PAGO_LINEA = [
  { value: "", label: "Seleccione tipo" },
  { value: "Nequi", label: "Nequi" },
  { value: "Daviplata", label: "Daviplata" },
  { value: "Transferencia", label: "Transferencia bancaria" },
  { value: "Datafono", label: "Datáfono / POS" },
  { value: TIPO_PAGO_OTRO, label: "Otro" },
] as const;

const PRESETS_EFECTIVO = [10_000, 20_000, 50_000, 100_000];
const OBS_MAX = 256;
const EPS = 0.01;

export interface DetallePagoConfirmado {
  efectivo: number;
  pagosLinea: { tipo: string; monto: number }[];
  observaciones: string;
  /** Si true, el ticket incluye QR (y texto en térmica) para fidelización María Chorizos. */
  incluirQrClienteFrecuente?: boolean;
}

export interface RegistrarPagoPanelProps {
  open: boolean;
  onClose: () => void;
  numProductos: number;
  clienteNombre: string;
  subtotal: number;
  descuento: number;
  iva: number;
  totalBruto: number;
  totalAPagar: number;
  cobrando: boolean;
  onConfirmar: (detalle: DetallePagoConfirmado) => void | Promise<void>;
  /**
   * Antes de activar «Soy cliente frecuente» (p. ej. descontar sticker en inventario).
   * Si devuelve ok: false, el modo no se activa y no se abre el aviso.
   */
  onAntesActivarClienteFrecuente?: () => Promise<{ ok: true } | { ok: false; message: string }>;
}

type LineaOnline = { id: string; tipo: string; tipoOtro: string; montoStr: string };

function nuevaLineaOnline(): LineaOnline {
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, tipo: "", tipoOtro: "", montoStr: "" };
}

export default function RegistrarPagoPanel({
  open,
  onClose,
  numProductos,
  clienteNombre,
  subtotal,
  descuento,
  iva,
  totalBruto,
  totalAPagar,
  cobrando,
  onConfirmar,
  onAntesActivarClienteFrecuente,
}: RegistrarPagoPanelProps) {
  const baseId = useId();
  const [tab, setTab] = useState<"contado">("contado");
  const [efectivoStr, setEfectivoStr] = useState("");
  /** Monto del botón rápido seleccionado; null si el usuario escribió otro valor a mano. */
  const [presetEfectivoActivo, setPresetEfectivoActivo] = useState<number | null>(null);
  const [lineasOnline, setLineasOnline] = useState<LineaOnline[]>(() => [nuevaLineaOnline()]);
  const [observaciones, setObservaciones] = useState("");
  const [clienteFrecuenteActivo, setClienteFrecuenteActivo] = useState(false);
  const [avisoClienteFrecuenteOpen, setAvisoClienteFrecuenteOpen] = useState(false);
  const [aplicandoClienteFrecuente, setAplicandoClienteFrecuente] = useState(false);

  const resetForm = useCallback(() => {
    setTab("contado");
    setEfectivoStr("");
    setPresetEfectivoActivo(null);
    setLineasOnline([nuevaLineaOnline()]);
    setObservaciones("");
    setClienteFrecuenteActivo(false);
    setAvisoClienteFrecuenteOpen(false);
    setAplicandoClienteFrecuente(false);
  }, []);

  useEffect(() => {
    if (open) resetForm();
  }, [open, resetForm]);

  const valorEfectivo = useMemo(() => parsePesosCopInput(efectivoStr), [efectivoStr]);

  const valorLineaSum = useMemo(() => {
    let s = 0;
    for (const l of lineasOnline) {
      s += parsePesosCopInput(l.montoStr);
    }
    return Math.round(s * 100) / 100;
  }, [lineasOnline]);

  const totalPagado = useMemo(
    () => Math.round((valorEfectivo + valorLineaSum) * 100) / 100,
    [valorEfectivo, valorLineaSum]
  );

  const restante = useMemo(() => Math.max(0, Math.round((totalAPagar - totalPagado) * 100) / 100), [totalAPagar, totalPagado]);

  const cambio = useMemo(() => Math.max(0, Math.round((totalPagado - totalAPagar) * 100) / 100), [totalAPagar, totalPagado]);

  const cubreTotal = totalPagado + EPS >= totalAPagar;

  const setNumLineasOnline = (n: number) => {
    const next = Math.max(1, Math.min(8, n));
    setLineasOnline((prev) => {
      if (next === prev.length) return prev;
      if (next > prev.length) {
        const add = next - prev.length;
        return [...prev, ...Array.from({ length: add }, () => nuevaLineaOnline())];
      }
      return prev.slice(0, next);
    });
  };

  /** Un solo valor: el botón reemplaza el campo (no suma). */
  const seleccionarPresetEfectivo = (monto: number) => {
    setEfectivoStr(formatPesosCop(monto, true));
    setPresetEfectivoActivo(monto);
  };

  const actualizarLinea = (id: string, patch: Partial<LineaOnline>) => {
    setLineasOnline((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  const eliminarLinea = (id: string) => {
    setLineasOnline((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.id !== id)));
  };

  const handleGuardarYCobrar = async () => {
    const pagosLinea: { tipo: string; monto: number }[] = [];
    for (const l of lineasOnline) {
      const m = parsePesosCopInput(l.montoStr);
      if (m <= 0) continue;
      if (!l.tipo.trim()) {
        window.alert("Selecciona el tipo de cada pago en línea con valor mayor a $0.");
        return;
      }
      if (l.tipo === TIPO_PAGO_OTRO) {
        const texto = l.tipoOtro.trim();
        if (!texto) {
          window.alert("Si eliges «Otro», escribe qué medio de pago fue.");
          return;
        }
        pagosLinea.push({ tipo: texto, monto: m });
      } else {
        pagosLinea.push({ tipo: l.tipo.trim(), monto: m });
      }
    }

    const tp = Math.round((valorEfectivo + pagosLinea.reduce((s, p) => s + p.monto, 0)) * 100) / 100;
    if (tp + EPS < totalAPagar) {
      window.alert(
        `El total registrado ($${formatPesosCop(tp)}) no cubre el total a pagar ($${formatPesosCop(totalAPagar)}). Falta $${formatPesosCop(totalAPagar - tp)}.`
      );
      return;
    }

    await onConfirmar({
      efectivo: valorEfectivo,
      pagosLinea,
      observaciones: observaciones.slice(0, OBS_MAX).trim(),
      incluirQrClienteFrecuente: clienteFrecuenteActivo,
    });
  };

  if (!open) return null;

  return (
    <>
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-slate-100"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${baseId}-titulo`}
    >
      <header className="flex flex-shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
        <button
          type="button"
          onClick={() => !cobrando && onClose()}
          disabled={cobrando}
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          aria-label="Volver"
        >
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 id={`${baseId}-titulo`} className="text-lg font-semibold text-slate-900">
          Registrar pago
        </h1>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-6">
          <div className="mb-4 flex border-b border-slate-200 bg-white rounded-t-xl">
            <button
              type="button"
              onClick={() => setTab("contado")}
              className={`border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${
                tab === "contado"
                  ? "border-sky-600 text-sky-700"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              Contado
            </button>
          </div>

          <div className="space-y-5">
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
                <span className="text-slate-500" aria-hidden>
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
                    />
                  </svg>
                </span>
                <h2 className="text-sm font-semibold text-slate-800">Pagos en efectivo</h2>
              </div>
              <div className="p-4">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {PRESETS_EFECTIVO.map((m) => {
                    const seleccionado = presetEfectivoActivo === m;
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => seleccionarPresetEfectivo(m)}
                        disabled={cobrando}
                        aria-pressed={seleccionado}
                        className={`rounded-lg border py-2.5 text-sm font-semibold shadow-sm transition-colors disabled:opacity-50 ${
                          seleccionado
                            ? "border-sky-600 bg-sky-100 text-sky-900 ring-2 ring-sky-400/60"
                            : "border-sky-200 bg-white text-sky-700 hover:bg-sky-50"
                        }`}
                      >
                        ${m.toLocaleString("es-CO")}
                      </button>
                    );
                  })}
                </div>
                <label className="mt-4 block text-xs font-medium text-slate-600">Otro valor</label>
                <div className="mt-1 flex rounded-lg border border-slate-200 bg-white">
                  <span className="flex items-center pl-3 text-slate-500">$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={efectivoStr}
                    onChange={(e) => {
                      setEfectivoStr(e.target.value);
                      setPresetEfectivoActivo(null);
                    }}
                    disabled={cobrando}
                    placeholder="0,00"
                    className="w-full py-2.5 pr-3 text-sm outline-none focus:ring-0"
                    autoComplete="off"
                  />
                </div>
              </div>
              <div className="flex justify-end border-t border-sky-100 bg-sky-50/80 px-4 py-2.5 text-sm font-medium text-sky-900">
                Valor en efectivo: ${formatPesosCop(valorEfectivo)}
              </div>
            </section>

            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-slate-500" aria-hidden>
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                      />
                    </svg>
                  </span>
                  <h2 className="text-sm font-semibold text-slate-800">Pagos en línea</h2>
                </div>
                <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                  <button
                    type="button"
                    disabled={cobrando || lineasOnline.length <= 1}
                    onClick={() => setNumLineasOnline(lineasOnline.length - 1)}
                    className="flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-white disabled:opacity-40"
                    aria-label="Menos líneas"
                  >
                    −
                  </button>
                  <span className="min-w-[1.5rem] text-center text-sm font-semibold tabular-nums">{lineasOnline.length}</span>
                  <button
                    type="button"
                    disabled={cobrando || lineasOnline.length >= 8}
                    onClick={() => setNumLineasOnline(lineasOnline.length + 1)}
                    className="flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-white disabled:opacity-40"
                    aria-label="Más líneas"
                  >
                    +
                  </button>
                </div>
              </div>
              <div className="space-y-3 p-4">
                {lineasOnline.map((linea) => (
                  <div key={linea.id} className="flex w-full flex-col gap-2">
                    <div className="flex flex-wrap items-end gap-2">
                    <div className="min-w-[140px] flex-1">
                      <label className="mb-1 block text-xs font-medium text-slate-600">
                        Tipo <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={linea.tipo}
                        onChange={(e) => {
                          const v = e.target.value;
                          actualizarLinea(linea.id, {
                            tipo: v,
                            ...(v !== TIPO_PAGO_OTRO ? { tipoOtro: "" } : {}),
                          });
                        }}
                        disabled={cobrando}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
                      >
                        {TIPOS_PAGO_LINEA.map((t) => (
                          <option key={t.value || "empty"} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="w-full min-w-[120px] flex-1 sm:max-w-[200px]">
                      <label className="mb-1 block text-xs font-medium text-slate-600">Valor</label>
                      <div className="flex rounded-lg border border-slate-200 bg-white">
                        <span className="flex items-center pl-3 text-slate-500">$</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={linea.montoStr}
                          onChange={(e) => actualizarLinea(linea.id, { montoStr: e.target.value })}
                          disabled={cobrando}
                          placeholder="0,00"
                          className="w-full py-2 pr-3 text-sm outline-none"
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={cobrando || lineasOnline.length <= 1}
                      onClick={() => eliminarLinea(linea.id)}
                      className="mb-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                      title="Quitar línea"
                      aria-label="Quitar línea"
                    >
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                    </div>
                    {linea.tipo === TIPO_PAGO_OTRO && (
                      <div className="w-full pl-0 sm:max-w-xl">
                        <label className="mb-1 block text-xs font-medium text-slate-600">
                          Especificar medio <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={linea.tipoOtro}
                          onChange={(e) =>
                            actualizarLinea(linea.id, {
                              tipoOtro: e.target.value.slice(0, TIPO_OTRO_MAX_LEN),
                            })
                          }
                          disabled={cobrando}
                          placeholder="Ej. Livu, Bold CF, banco…"
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
                          autoComplete="off"
                        />
                        <p className="mt-0.5 text-right text-[11px] text-slate-400">
                          {linea.tipoOtro.length}/{TIPO_OTRO_MAX_LEN}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex justify-end border-t border-sky-100 bg-sky-50/80 px-4 py-2.5 text-sm font-medium text-sky-900">
                Valor pago en línea: ${formatPesosCop(valorLineaSum)}
              </div>
            </section>

            <section>
              <h2 className="mb-2 text-sm font-semibold text-slate-800">Observaciones</h2>
              <div className="rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
                <textarea
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value.slice(0, OBS_MAX))}
                  disabled={cobrando}
                  rows={4}
                  className="w-full resize-y rounded-lg px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400"
                  placeholder="Notas opcionales sobre el pago…"
                />
                <p className="px-3 pb-2 text-right text-xs text-slate-400">
                  {observaciones.length}/{OBS_MAX}
                </p>
              </div>
            </section>
          </div>
        </div>

        <aside className="w-full flex-shrink-0 border-t border-slate-200 bg-white p-4 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] lg:w-[380px] lg:border-l lg:border-t-0 lg:shadow-none">
          <h2 className="text-sm font-semibold text-slate-800">Información de pago</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-slate-600">Nro. de productos</dt>
              <dd className="font-medium text-slate-900 tabular-nums">{numProductos}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-600">Cliente</dt>
              <dd className="max-w-[60%] text-right font-medium text-slate-900">{clienteNombre}</dd>
            </div>
            <div className="my-3 border-t border-slate-100" />
            <div className="flex justify-between gap-2">
              <dt className="text-slate-600">Subtotal</dt>
              <dd className="tabular-nums text-slate-900">${formatPesosCop(subtotal)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-600">Descuento aplicado</dt>
              <dd className="tabular-nums text-slate-900">${formatPesosCop(descuento)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-600">Total IVA</dt>
              <dd className="tabular-nums text-slate-900">${formatPesosCop(iva)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-600">Total bruto</dt>
              <dd className="tabular-nums font-medium text-slate-900">${formatPesosCop(totalBruto)}</dd>
            </div>
          </dl>

          <div className="mt-5 rounded-xl border border-sky-200 bg-sky-50/90 px-4 py-4 text-center">
            <p className="text-xs font-medium uppercase tracking-wide text-sky-800">Total a pagar</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">${formatPesosCop(totalAPagar)}</p>
          </div>

          <div className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-600">Restante</span>
              <span className={`font-semibold tabular-nums ${restante > EPS ? "text-amber-700" : "text-emerald-700"}`}>
                ${formatPesosCop(restante)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Cambio</span>
              <span className="font-semibold tabular-nums text-slate-900">${formatPesosCop(cambio)}</span>
            </div>
          </div>

          <button
            type="button"
            disabled={cobrando || !cubreTotal}
            onClick={() => void handleGuardarYCobrar()}
            className="mt-6 w-full rounded-xl bg-emerald-500 py-3.5 text-sm font-bold text-white shadow-md transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {cobrando ? "Procesando…" : "Guardar y cobrar"}
          </button>
          <button
            type="button"
            disabled={cobrando || aplicandoClienteFrecuente}
            onClick={() => {
              void (async () => {
                if (cobrando || aplicandoClienteFrecuente) return;
                if (clienteFrecuenteActivo) {
                  setAvisoClienteFrecuenteOpen(false);
                  setClienteFrecuenteActivo(false);
                  return;
                }
                if (onAntesActivarClienteFrecuente) {
                  setAplicandoClienteFrecuente(true);
                  try {
                    const r = await onAntesActivarClienteFrecuente();
                    if (!r.ok) {
                      window.alert(r.message);
                      return;
                    }
                  } finally {
                    setAplicandoClienteFrecuente(false);
                  }
                }
                setClienteFrecuenteActivo(true);
                setAvisoClienteFrecuenteOpen(true);
              })();
            }}
            aria-pressed={clienteFrecuenteActivo}
            aria-busy={aplicandoClienteFrecuente}
            className={`mt-3 flex w-full items-center justify-center gap-2 rounded-xl border-2 py-3 text-sm font-bold transition-all ${
              clienteFrecuenteActivo
                ? "border-amber-400 bg-gradient-to-r from-amber-100 to-orange-100 text-amber-950 shadow-inner ring-2 ring-amber-300/60"
                : "border-slate-200 bg-white text-slate-700 hover:border-amber-300 hover:bg-amber-50/80"
            } disabled:cursor-not-allowed disabled:opacity-45`}
          >
            <span className="text-lg" aria-hidden>
              {clienteFrecuenteActivo ? "⭐" : "☆"}
            </span>
            {aplicandoClienteFrecuente ? "Aplicando…" : "SOY CLIENTE FRECUENTE"}
          </button>
          <p className="mt-1.5 text-center text-[11px] leading-snug text-slate-500">
            {onAntesActivarClienteFrecuente
              ? clienteFrecuenteActivo
                ? "El ticket llevará QR para sumar puntos en la app María Chorizos. Ya se descontó 1 sticker de fidelización en inventario."
                : "Activá antes de cobrar: se descuenta 1 sticker de fidelización y el aviso recuerda qué decirle al cliente (app, tarjeta y QR)."
              : clienteFrecuenteActivo
                ? "El ticket llevará QR para sumar puntos en la app María Chorizos."
                : "Activá antes de cobrar si el cliente quiere acumular puntos."}
          </p>
          {!cubreTotal && (
            <p className="mt-2 text-center text-xs text-amber-700">Registra pagos que sumen al menos el total a pagar.</p>
          )}
        </aside>
      </div>
    </div>
    <ClienteFrecuenteAvisoModal
      open={avisoClienteFrecuenteOpen}
      onCerrar={() => setAvisoClienteFrecuenteOpen(false)}
    />
    </>
  );
}
