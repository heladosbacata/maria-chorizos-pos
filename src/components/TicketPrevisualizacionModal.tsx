"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { LOGO_ORG_URL } from "@/lib/brand";
import { textoParaPrevisualizacionTicket } from "@/lib/pos-geb-print";
import type { TicketVentaPayload } from "@/types/impresion-pos";

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
 * Vista previa del comprobante tras cobrar; al confirmar se dispara la impresión y el overlay de celebración existente.
 */
export default function TicketPrevisualizacionModal({
  open,
  ticket,
  onImprimir,
  onCancelarTransaccion,
  cancelandoTransaccion = false,
}: TicketPrevisualizacionModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!mounted || !open || !ticket) return null;

  const texto = textoParaPrevisualizacionTicket(ticket);
  const qr = ticket.fidelizacionQrDataUrl?.trim();
  const busy = cancelandoTransaccion;

  return createPortal(
    <div
      className="fixed inset-0 z-[240] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ticket-prev-titulo"
    >
      <div className="absolute inset-0 bg-slate-900/55 backdrop-blur-sm" aria-hidden role="presentation" />

      <div className="relative z-[1] flex max-h-[min(92vh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl">
        <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-sky-50/40 px-5 py-4">
          <h2 id="ticket-prev-titulo" className="text-lg font-bold text-slate-900">
            Vista previa del comprobante
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Toda venta debe salir con recibo: tocá <span className="font-semibold text-slate-800">Imprimir</span> para
            continuar.
            {onCancelarTransaccion ? (
              <>
                {" "}
                Si el cobro fue por error, usá{" "}
                <span className="font-medium text-rose-800">Cancelar transacción</span>.
              </>
            ) : null}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/90 p-4 shadow-inner">
            <div className="mb-3 flex justify-center border-b border-slate-200/80 pb-3">
              <Image
                src={LOGO_ORG_URL}
                alt="María Chorizos"
                width={140}
                height={48}
                className="h-11 w-auto object-contain"
                priority
              />
            </div>
            <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-slate-800">
              {texto}
            </pre>
            {qr ? (
              <div className="mt-4 border-t border-slate-200 pt-4 text-center">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-600">Cliente frecuente</p>
                {/* eslint-disable-next-line @next/next/no-img-element -- data URL del QR */}
                <img
                  src={qr}
                  width={180}
                  height={180}
                  alt="Código QR fidelización"
                  className="mx-auto mt-2 inline-block rounded-lg border border-slate-200 bg-white p-1"
                  style={{ imageRendering: "pixelated" }}
                />
              </div>
            ) : null}
          </div>
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
