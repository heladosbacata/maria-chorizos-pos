"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { domicilioCambiarEstado, domiciliosListar } from "@/lib/pos-domicilios-api";
import { enviarMensajeChatDomicilio } from "@/lib/pos-domicilios-chat-api";
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

  const encolarPedidosNuevos = useCallback(
    (pedidos: PedidoDomicilio[]) => {
      const nuevosActuales = pedidos.filter((p) => p.estado === "NUEVO").map((p) => p.id);
      const prev = pedidosNuevosPrevRef.current;
      const llegados = nuevosActuales.filter((id) => !prev.includes(id));
      pedidosNuevosPrevRef.current = nuevosActuales;
      if (prev.length === 0 || llegados.length === 0) return;
      const recien = pedidos.filter((p) => llegados.includes(p.id));
      if (recien.length === 0) return;
      reproducirAlertaNuevoPedidoDomicilio(pv);
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        try {
          navigator.vibrate([120, 60, 120, 60, 180]);
        } catch {
          /* ignore */
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

  const cargarPedidos = useCallback(
    async (detectarNuevos: boolean) => {
      if (!pv || !habilitado) return;
      const res = await domiciliosListar(pv);
      if (detectarNuevos) encolarPedidosNuevos(res.data);
    },
    [pv, habilitado, encolarPedidosNuevos]
  );

  useEffect(() => {
    if (!pv || !habilitado) {
      pedidosNuevosPrevRef.current = [];
      setCola([]);
      return;
    }
    let activo = true;
    void cargarPedidos(true).catch(() => undefined);
    const timer = window.setInterval(() => {
      if (!activo) return;
      void cargarPedidos(true).catch(() => undefined);
    }, 10000);
    return () => {
      activo = false;
      window.clearInterval(timer);
    };
  }, [pv, habilitado, cargarPedidos]);

  useEffect(() => {
    if (!pedidoVisible) {
      setModoRechazo(false);
      setMotivoRechazo("");
      setError(null);
    }
  }, [pedidoVisible?.id]);

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
          className="fixed inset-0 z-[270] flex items-center justify-center p-4 sm:p-6"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="domicilios-alerta-titulo"
        >
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" aria-hidden />
          <motion.div
            initial={{ opacity: 0, scale: 0.88, y: 28 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 12 }}
            transition={{ type: "spring", stiffness: 280, damping: 26 }}
            className="relative z-10 w-full max-w-2xl overflow-hidden rounded-3xl border-2 border-amber-300/80 bg-gradient-to-br from-amber-50 via-white to-cyan-50 shadow-[0_0_60px_rgba(251,191,36,0.35),0_25px_50px_-12px_rgba(15,23,42,0.45)]"
          >
            <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-amber-300/30 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-12 -left-10 h-40 w-40 rounded-full bg-cyan-400/25 blur-3xl" />

            <header className="relative border-b border-amber-200/80 bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 px-5 py-6 text-white sm:px-7">
              <motion.div
                animate={{ scale: [1, 1.08, 1], rotate: [0, -4, 4, 0] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
                className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 text-4xl shadow-lg backdrop-blur-sm"
                aria-hidden
              >
                🔔
              </motion.div>
              <p className="text-center text-[11px] font-bold uppercase tracking-[0.22em] text-amber-100">
                ¡Atención en caja!
              </p>
              <h2 id="domicilios-alerta-titulo" className="mt-1 text-center text-2xl font-black leading-tight sm:text-3xl">
                ¡Llegó un pedido nuevo!
              </h2>
              <p className="mt-2 text-center text-sm font-semibold text-amber-50/95 sm:text-base">
                Alguien acaba de pedir en tu punto. Respondé rápido para no perder la venta.
              </p>
              {cola.length > 1 ? (
                <p className="mt-2 text-center text-xs font-bold text-amber-100">
                  +{cola.length - 1} pedido(s) más en cola
                </p>
              ) : null}
            </header>

            <div className="relative space-y-4 px-5 py-5 sm:px-7 sm:py-6">
              <div className="rounded-2xl border border-cyan-200 bg-white/90 p-4 shadow-inner">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-cyan-700">Pedido</p>
                    <p className="text-xl font-black text-slate-900">{pedidoVisible.id}</p>
                  </div>
                  <span className="rounded-full bg-cyan-100 px-3 py-1 text-xs font-bold text-cyan-900">
                    {etiquetaCanal(pedidoVisible.canal)}
                  </span>
                </div>
                <p className="mt-3 text-lg font-extrabold text-slate-900">{pedidoVisible.cliente}</p>
                <p className="text-sm font-medium text-slate-600">{pedidoVisible.telefono}</p>
                <p className="mt-2 text-sm text-slate-700">{pedidoVisible.direccion}</p>
                {pedidoVisible.items.length > 0 ? (
                  <ul className="mt-3 space-y-1 text-sm text-slate-800">
                    {pedidoVisible.items.slice(0, 6).map((item, i) => (
                      <li key={`${pedidoVisible.id}-item-${i}`} className="flex gap-2">
                        <span className="text-amber-600" aria-hidden>
                          •
                        </span>
                        <span>{item}</span>
                      </li>
                    ))}
                    {pedidoVisible.items.length > 6 ? (
                      <li className="text-xs font-semibold text-slate-500">+{pedidoVisible.items.length - 6} ítem(s) más</li>
                    ) : null}
                  </ul>
                ) : null}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                  <span className="text-sm font-semibold text-slate-600">{etiquetaPago(pedidoVisible.metodoPago)}</span>
                  <span className="text-xl font-black text-emerald-700">{formatoMoneda(pedidoVisible.total)}</span>
                </div>
              </div>

              {modoRechazo ? (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-3 rounded-2xl border border-rose-200 bg-rose-50/90 p-4"
                >
                  <p className="text-sm font-bold text-rose-950">¿Por qué rechazás este pedido?</p>
                  <p className="text-xs font-medium text-rose-800">
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
                      className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                    >
                      Volver
                    </button>
                    <button
                      type="button"
                      onClick={() => void confirmarRechazo()}
                      disabled={procesando}
                      className="flex-1 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-bold text-white shadow-md transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
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
                    className="rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-4 text-base font-black text-white shadow-lg transition hover:from-emerald-700 hover:to-teal-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
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
                    className="rounded-2xl border-2 border-rose-300 bg-white px-5 py-4 text-base font-black text-rose-700 shadow-sm transition hover:border-rose-400 hover:bg-rose-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
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
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
