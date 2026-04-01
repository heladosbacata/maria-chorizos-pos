"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { LOGO_ORG_URL, MARIA_CHORIZOS_IG_HANDLE } from "@/lib/brand";
import { loadImpresionPrefs } from "@/lib/impresion-pos-storage";
import type { TicketVentaPayload } from "@/types/impresion-pos";

function formatCop(n: number): string {
  return n.toLocaleString("es-CO", { maximumFractionDigits: 0, minimumFractionDigits: 0 });
}

export interface TicketPrevisualizacionModalProps {
  open: boolean;
  ticket: TicketVentaPayload | null;
  /** Cierra el modal y dispara el flujo de impresión; toda venta debe salir con recibo. */
  onImprimir: () => void;
  /**
   * Anula la venta recién registrada, restaura la cuenta en pantalla y ajusta inventario/nube como en «Últimos recibos».
   * Si no se pasa, no se muestra el botón.
   */
  onCancelarTransaccion?: () => void | Promise<void>;
  cancelandoTransaccion?: boolean;
}

/**
 * Vista previa del comprobante tras cobrar; tirilla 58 mm, logo + marca y pie con redes @mariachorizos.
 */
export default function TicketPrevisualizacionModal({
  open,
  ticket,
  onImprimir,
  onCancelarTransaccion,
  cancelandoTransaccion = false,
}: TicketPrevisualizacionModalProps) {
  const [mounted, setMounted] = useState(false);
  const [ocultarLogo, setOcultarLogo] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setOcultarLogo(loadImpresionPrefs().impresionSimpleSinLogo);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!mounted || !open || !ticket) return null;

  const qr = ticket.fidelizacionQrDataUrl?.trim();
  const busy = cancelandoTransaccion;
  const notaPie =
    ticket.notaPie?.trim() || "Gracias por elegirnos — calidad y sabor en cada visita.";

  return createPortal(
    <div
      className="fixed inset-0 z-[240] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ticket-prev-titulo"
    >
      <div className="absolute inset-0 bg-slate-900/55 backdrop-blur-sm" aria-hidden role="presentation" />

      <div className="relative z-[1] flex max-h-[min(92vh,780px)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl">
        <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-amber-50/30 px-5 py-4">
          <h2 id="ticket-prev-titulo" className="text-lg font-bold text-slate-900">
            Vista previa del comprobante
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Tirilla 58 mm · Tocá <span className="font-semibold text-slate-800">Imprimir</span> para continuar.
            {onCancelarTransaccion ? (
              <>
                {" "}
                Si el cobro fue por error, usá{" "}
                <span className="font-medium text-rose-800">Cancelar transacción</span>.
              </>
            ) : null}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-100/80 px-4 py-5">
          {/* Simula rollo térmico 58 mm (~220px) */}
          <article
            className="mx-auto rounded-lg border border-slate-200/90 bg-white px-3 py-4 shadow-[0_12px_40px_-12px_rgba(15,23,42,0.35)] ring-1 ring-black/[0.04]"
            style={{ width: "min(58mm, 100%)", maxWidth: "100%" }}
          >
            {!ocultarLogo ? (
              <div className="mb-3 border-b border-slate-100 pb-3 text-center">
                <div className="flex justify-center">
                  <Image
                    src={LOGO_ORG_URL}
                    alt="María Chorizos"
                    width={128}
                    height={44}
                    className="h-10 w-auto object-contain"
                    priority
                  />
                </div>
                <p className="mt-2 text-[10px] font-extrabold tracking-[0.22em] text-red-700">MARÍA CHORIZOS</p>
              </div>
            ) : (
              <p className="mb-2 text-center text-[10px] font-extrabold tracking-[0.22em] text-red-700">
                MARÍA CHORIZOS
              </p>
            )}

            <p className="text-center text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              {ticket.titulo}
            </p>
            <p className="mt-0.5 text-center text-[8px] tracking-[0.14em] text-slate-400">POS GEB</p>
            <p className="mt-1 text-center text-[8px] tabular-nums text-slate-500">{ticket.fechaHora}</p>

            <div className="my-3 h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent" />

            <dl className="space-y-1.5 text-[8.5px] leading-snug text-slate-700">
              <div className="flex justify-between gap-2">
                <dt className="shrink-0 text-slate-500">Punto de venta</dt>
                <dd className="text-right font-medium text-slate-800">{ticket.puntoVenta}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="shrink-0 text-slate-500">Cuenta</dt>
                <dd className="text-right font-medium text-slate-800">{ticket.precuentaNombre}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="shrink-0 text-slate-500">Cliente</dt>
                <dd className="text-right font-medium text-slate-800">{ticket.clienteNombre}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="shrink-0 text-slate-500">Documento</dt>
                <dd className="text-right font-medium text-slate-800">{ticket.tipoComprobanteLabel}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="shrink-0 text-slate-500">Vendedor</dt>
                <dd className="break-all text-right font-medium text-slate-800">{ticket.vendedorLabel}</dd>
              </div>
            </dl>

            <div className="my-3 h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent" />

            <ul className="space-y-2">
              {ticket.lineas.map((l, i) => (
                <li
                  key={`${l.descripcion}-${i}`}
                  className="border-b border-dotted border-slate-200 pb-2 text-[9px] last:border-0"
                >
                  <div className="flex justify-between gap-2">
                    <div className="min-w-0 flex-1 leading-relaxed text-slate-800">
                      <span className="font-semibold tabular-nums">{l.cantidad}</span>
                      <span className="text-slate-400"> × </span>
                      <span>{l.descripcion}</span>
                      {l.detalleVariante ? (
                        <span className="block text-[8px] text-slate-500">({l.detalleVariante})</span>
                      ) : null}
                    </div>
                    <div className="shrink-0 font-bold tabular-nums text-slate-900">$ {formatCop(l.subtotal)}</div>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-3 flex items-center justify-between rounded-md bg-slate-900 px-2.5 py-2 text-[11px] font-extrabold tracking-wide text-white">
              <span>TOTAL</span>
              <span className="tabular-nums">$ {formatCop(ticket.total)}</span>
            </div>

            <p className="mt-3 text-center text-[8px] leading-relaxed text-slate-600">{notaPie}</p>

            <div className="mt-4 border-t-2 border-slate-200 pt-3 text-center">
              <p className="text-[7px] font-semibold uppercase tracking-[0.2em] text-slate-500">Seguinos en redes</p>
              <p className="mt-1 text-[12px] font-extrabold tracking-wide text-pink-700">@{MARIA_CHORIZOS_IG_HANDLE}</p>
              <p className="mt-1 text-[7px] tracking-[0.12em] text-slate-400">María Chorizos · POS GEB</p>
            </div>

            {qr ? (
              <div className="mt-4 border-t border-dashed border-slate-200 pt-3 text-center">
                <p className="text-[8px] font-bold uppercase tracking-widest text-slate-600">Cliente frecuente</p>
                {/* eslint-disable-next-line @next/next/no-img-element -- data URL del QR */}
                <img
                  src={qr}
                  width={140}
                  height={140}
                  alt="Código QR fidelización"
                  className="mx-auto mt-2 rounded-md border border-slate-200 bg-white p-1"
                  style={{ imageRendering: "pixelated" }}
                />
                <p className="mt-2 text-[7px] text-slate-500">Escaneá con la app María Chorizos</p>
              </div>
            ) : null}
          </article>
        </div>

        <div className="flex flex-shrink-0 flex-col gap-2 border-t border-slate-100 bg-slate-50/90 px-5 py-4 sm:flex-row sm:flex-wrap sm:justify-end">
          {onCancelarTransaccion ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void onCancelarTransaccion()}
              className="w-full rounded-xl border-2 border-rose-200 bg-rose-50 px-5 py-3 text-sm font-semibold text-rose-900 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60 sm:order-1 sm:mr-auto sm:w-auto"
            >
              {busy ? "Anulando…" : "Cancelar transacción"}
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={onImprimir}
            className="w-full rounded-xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white shadow-md transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 sm:order-2 sm:w-auto sm:min-w-[200px]"
          >
            Imprimir
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
