"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { domicilioCambiarEstado, domiciliosListar } from "@/lib/pos-domicilios-api";
import { enviarMensajeChatDomicilio } from "@/lib/pos-domicilios-chat-api";
import {
  EVENT_DOMICILIOS_FORZAR_REFRESH,
  EVENT_DOMICILIOS_PEDIDO_NUEVO,
  type DomiciliosPedidoNuevoDetail,
} from "@/lib/pos-domicilios-nuevos-event";
import { reproducirAlertaNuevoPedidoDomicilio } from "@/lib/pos-domicilios-sonidos";
import {
  textoAceptacionPedidoParaCliente,
  textoRechazoPedidoParaCliente,
  textoResumenPedidoParaConfirmacion,
} from "@/lib/pos-domicilios-resumen-chat";
import type { PedidoDomicilio } from "@/types/pos-domicilios";

type Props = {
  puntoVenta?: string | null;
  habilitado?: boolean;
};

/** Polling rápido: prioridad al pedido que acaba de llegar. */
const INTERVALO_POLL_MS = 5_000;

function formatoMoneda(valor: number): string {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(
    valor
  );
}

function etiquetaCanal(canal: PedidoDomicilio["canal"]): string {
  if (canal === "whatsapp") return "WhatsApp";
  if (canal === "qr") return "QR";
  return "Web";
}

function etiquetaPago(metodo: PedidoDomicilio["metodoPago"]): string {
  if (metodo === "datafono") return "Datáfono";
  if (metodo === "transferencia") return "Transferencia";
  return "Efectivo";
}

export default function PosDomiciliosNuevoPedidoAlerta({ puntoVenta, habilitado = true }: Props) {
  const pv = (puntoVenta ?? "").trim();
  const [cola, setCola] = useState<PedidoDomicilio[]>([]);
  const [modoRechazo, setModoRechazo] = useState(false);
  const [motivoRechazo, setMotivoRechazo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);
  const pedidosNuevosPrevRef = useRef<string[]>([]);
  const inicializadoRef = useRef(false);
  const resumenEnviadoRef = useRef<Set<string>>(new Set());
  const resumenEnProcesoRef = useRef<Set<string>>(new Set());

  const pedidoVisible = cola[0] ?? null;

  const enviarResumenSiFalta = useCallback(async (pedido: PedidoDomicilio) => {
    const pid = pedido.id;
    if (resumenEnviadoRef.current.has(pid) || resumenEnProcesoRef.current.has(pid)) return;
    resumenEnProcesoRef.current.add(pid);
    try {
      const resp = await enviarMensajeChatDomicilio({
        puntoVenta: pedido.puntoVenta,
        pedidoId: pid,
        autor: "pos",
        autorLabel: "POS",
        texto: textoResumenPedidoParaConfirmacion(pedido),
        tipoMensaje: "texto",
      });
      if (resp.ok) resumenEnviadoRef.current.add(pid);
    } finally {
      resumenEnProcesoRef.current.delete(pid);
    }
  }, []);

  const encolarPedidos = useCallback(
    (recien: PedidoDomicilio[], { sonar }: { sonar: boolean }) => {
      if (recien.length === 0) return;
      if (sonar) {
        reproducirAlertaNuevoPedidoDomicilio(pv);
        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
          try {
            navigator.vibrate([140, 70, 140, 70, 220]);
          } catch {
            /* ignore */
          }
        }
      }
      setCola((cur) => {
        const ids = new Set(cur.map((p) => p.id));
        const extra = recien.filter((p) => !ids.has(p.id));
        return extra.length ? [...cur, ...extra] : cur;
      });
      for (const p of recien) void enviarResumenSiFalta(p);
    },
    [pv, enviarResumenSiFalta]
  );

  const encolarPedidosNuevosDesdeLista = useCallback(
    (pedidos: PedidoDomicilio[]) => {
      const nuevosActuales = pedidos.filter((p) => p.estado === "NUEVO").map((p) => p.id);
      const prev = pedidosNuevosPrevRef.current;
      const llegados = nuevosActuales.filter((id) => !prev.includes(id));
      pedidosNuevosPrevRef.current = nuevosActuales;

      // Primera pasada: solo sincroniza IDs (no alertar pedidos ya en bandeja al abrir caja).
      if (!inicializadoRef.current) {
        inicializadoRef.current = true;
        return;
      }
      if (llegados.length === 0) return;

      const recien = pedidos.filter((p) => llegados.includes(p.id));
      encolarPedidos(recien, { sonar: true });
    },
    [encolarPedidos]
  );

  const cargarPedidos = useCallback(
    async (detectarNuevos: boolean) => {
      if (!pv || !habilitado) return;
      const res = await domiciliosListar(pv);
      if (detectarNuevos) encolarPedidosNuevosDesdeLista(res.data);
    },
    [pv, habilitado, encolarPedidosNuevosDesdeLista]
  );

  useEffect(() => {
    if (!pv || !habilitado) {
      pedidosNuevosPrevRef.current = [];
      inicializadoRef.current = false;
      setCola([]);
      return;
    }
    let activo = true;
    void cargarPedidos(true).catch(() => undefined);
    const timer = window.setInterval(() => {
      if (!activo) return;
      void cargarPedidos(true).catch(() => undefined);
    }, INTERVALO_POLL_MS);
    const onRefresh = () => {
      if (!activo) return;
      void cargarPedidos(true).catch(() => undefined);
    };
    window.addEventListener(EVENT_DOMICILIOS_FORZAR_REFRESH, onRefresh);
    return () => {
      activo = false;
      window.clearInterval(timer);
      window.removeEventListener(EVENT_DOMICILIOS_FORZAR_REFRESH, onRefresh);
    };
  }, [pv, habilitado, cargarPedidos]);

  // Refuerzo: si otro watcher emite el evento, encolar al instante.
  useEffect(() => {
    if (!pv || !habilitado) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<DomiciliosPedidoNuevoDetail>).detail;
      const pedido = detail?.pedido;
      if (!pedido || pedido.estado !== "NUEVO") return;
      if ((pedido.puntoVenta ?? "").trim() && (pedido.puntoVenta ?? "").trim() !== pv) return;
      pedidosNuevosPrevRef.current = Array.from(new Set([...pedidosNuevosPrevRef.current, pedido.id]));
      inicializadoRef.current = true;
      encolarPedidos([pedido], { sonar: false });
    };
    window.addEventListener(EVENT_DOMICILIOS_PEDIDO_NUEVO, handler);
    return () => window.removeEventListener(EVENT_DOMICILIOS_PEDIDO_NUEVO, handler);
  }, [pv, habilitado, encolarPedidos]);

  useEffect(() => {
    if (!pedidoVisible) {
      setModoRechazo(false);
      setMotivoRechazo("");
      setError(null);
    }
  }, [pedidoVisible?.id]);

  // Bloquear scroll y Escape mientras la alerta a pantalla completa está activa.
  useEffect(() => {
    if (!pedidoVisible) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [pedidoVisible]);

  const cerrarActual = () => {
    setModoRechazo(false);
    setMotivoRechazo("");
    setError(null);
    setCola((cur) => cur.slice(1));
  };

  const aceptarPedido = async () => {
    if (!pedidoVisible || procesando) return;
    setProcesando(true);
    setError(null);
    const pedido = pedidoVisible;
    const result = await domicilioCambiarEstado({
      puntoVenta: pedido.puntoVenta,
      pedidoId: pedido.id,
      estado: "ACEPTADO",
    });
    if (!result.ok) {
      setError(result.message ?? "No se pudo aceptar el pedido.");
      setProcesando(false);
      return;
    }
    await enviarMensajeChatDomicilio({
      puntoVenta: pedido.puntoVenta,
      pedidoId: pedido.id,
      autor: "pos",
      autorLabel: "POS",
      texto: textoAceptacionPedidoParaCliente(),
      tipoMensaje: "texto",
    });
    setProcesando(false);
    cerrarActual();
  };

  const confirmarRechazo = async () => {
    if (!pedidoVisible || procesando) return;
    const motivo = motivoRechazo.trim();
    if (!motivo) {
      setError("Escribí el motivo del rechazo. El cliente lo verá en su pantalla.");
      return;
    }
    setProcesando(true);
    setError(null);
    const pedido = pedidoVisible;
    const result = await domicilioCambiarEstado({
      puntoVenta: pedido.puntoVenta,
      pedidoId: pedido.id,
      estado: "RECHAZADO",
      motivo,
    });
    if (!result.ok) {
      setError(result.message ?? "No se pudo rechazar el pedido.");
      setProcesando(false);
      return;
    }
    await enviarMensajeChatDomicilio({
      puntoVenta: pedido.puntoVenta,
      pedidoId: pedido.id,
      autor: "pos",
      autorLabel: "POS",
      texto: textoRechazoPedidoParaCliente(motivo),
      tipoMensaje: "texto",
    });
    setProcesando(false);
    cerrarActual();
  };

  if (!pv || !habilitado) return null;

  return (
    <AnimatePresence>
      {pedidoVisible ? (
        <motion.div
          key={pedidoVisible.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[320] flex h-[100dvh] w-screen flex-col bg-slate-950"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="domicilios-alerta-titulo"
        >
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-br from-amber-600/40 via-rose-700/30 to-cyan-900/50"
            aria-hidden
          />
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ type: "spring", stiffness: 260, damping: 28 }}
            className="relative z-10 flex h-full min-h-0 w-full flex-col"
          >
            <header className="shrink-0 border-b border-amber-300/40 bg-gradient-to-r from-amber-500 via-orange-500 to-rose-600 px-4 py-5 text-white sm:px-8 sm:py-7">
              <motion.div
                animate={{ scale: [1, 1.06, 1] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 text-3xl shadow-lg backdrop-blur-sm sm:h-16 sm:w-16 sm:text-4xl"
                aria-hidden
              >
                🔔
              </motion.div>
              <p className="text-center text-[11px] font-bold uppercase tracking-[0.22em] text-amber-100">
                Prioridad en caja · domicilio
              </p>
              <h2
                id="domicilios-alerta-titulo"
                className="mt-1 text-center text-2xl font-black leading-tight sm:text-4xl"
              >
                ¡Llegó un pedido nuevo!
              </h2>
              <p className="mx-auto mt-2 max-w-2xl text-center text-sm font-semibold text-amber-50/95 sm:text-base">
                Atendé este pedido antes de seguir en caja. No se puede cerrar hasta aceptar o rechazar.
              </p>
              {cola.length > 1 ? (
                <p className="mt-2 text-center text-xs font-bold text-amber-100">
                  +{cola.length - 1} pedido(s) más en cola
                </p>
              ) : null}
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-8 sm:py-6">
              <div className="mx-auto flex min-h-full max-w-3xl flex-col justify-center gap-4">
                <div className="rounded-3xl border border-cyan-200/80 bg-white p-4 shadow-2xl sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-cyan-700">Pedido</p>
                      <p className="text-2xl font-black text-slate-900 sm:text-3xl">{pedidoVisible.id}</p>
                    </div>
                    <span className="rounded-full bg-cyan-100 px-3 py-1 text-xs font-bold text-cyan-900">
                      {etiquetaCanal(pedidoVisible.canal)}
                    </span>
                  </div>
                  <p className="mt-4 text-xl font-extrabold text-slate-900 sm:text-2xl">{pedidoVisible.cliente}</p>
                  <p className="text-base font-medium text-slate-600">{pedidoVisible.telefono}</p>
                  <p className="mt-2 text-sm text-slate-700 sm:text-base">{pedidoVisible.direccion}</p>
                  {pedidoVisible.referencia ? (
                    <p className="mt-1 text-sm text-slate-500">Ref: {pedidoVisible.referencia}</p>
                  ) : null}
                  {pedidoVisible.items.length > 0 ? (
                    <ul className="mt-4 max-h-48 space-y-1.5 overflow-y-auto text-sm text-slate-800 sm:max-h-64 sm:text-base">
                      {pedidoVisible.items.map((item, i) => (
                        <li key={`${pedidoVisible.id}-item-${i}`} className="flex gap-2">
                          <span className="text-amber-600" aria-hidden>
                            •
                          </span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4">
                    <span className="text-sm font-semibold text-slate-600 sm:text-base">
                      {etiquetaPago(pedidoVisible.metodoPago)}
                    </span>
                    <span className="text-2xl font-black text-emerald-700 sm:text-3xl">
                      {formatoMoneda(pedidoVisible.total)}
                    </span>
                  </div>
                </div>

                {modoRechazo ? (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-3 rounded-3xl border border-rose-200 bg-rose-50 p-4 sm:p-5"
                  >
                    <p className="text-sm font-bold text-rose-950 sm:text-base">¿Por qué rechazás este pedido?</p>
                    <p className="text-xs font-medium text-rose-800 sm:text-sm">
                      El cliente verá este mensaje en su pantalla y en el chat.
                    </p>
                    <textarea
                      value={motivoRechazo}
                      onChange={(e) => setMotivoRechazo(e.target.value)}
                      rows={3}
                      maxLength={400}
                      placeholder="Ej.: Producto agotado, fuera de horario, dirección fuera de cobertura…"
                      className="w-full resize-y rounded-xl border border-rose-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-rose-200 focus:border-rose-400 focus:ring-2"
                      disabled={procesando}
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setModoRechazo(false);
                          setMotivoRechazo("");
                          setError(null);
                        }}
                        disabled={procesando}
                        className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                      >
                        Volver
                      </button>
                      <button
                        type="button"
                        onClick={() => void confirmarRechazo()}
                        disabled={procesando}
                        className="min-h-[48px] flex-1 rounded-xl bg-rose-600 px-4 py-3 text-sm font-bold text-white shadow-md transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {procesando ? "Rechazando…" : "Confirmar rechazo"}
                      </button>
                    </div>
                  </motion.div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => void aceptarPedido()}
                      disabled={procesando}
                      className="min-h-[56px] rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-4 text-lg font-black text-white shadow-lg transition hover:from-emerald-700 hover:to-teal-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {procesando ? "Procesando…" : "✓ Aceptar pedido"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setModoRechazo(true);
                        setError(null);
                      }}
                      disabled={procesando}
                      className="min-h-[56px] rounded-2xl border-2 border-rose-300 bg-white px-5 py-4 text-lg font-black text-rose-700 shadow-sm transition hover:border-rose-400 hover:bg-rose-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Rechazar pedido
                    </button>
                  </div>
                )}

                {error ? (
                  <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-center text-sm font-semibold text-rose-800">
                    {error}
                  </p>
                ) : null}
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
