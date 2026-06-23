"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { LOGO_ORG_URL, MARIA_CHORIZOS_IG_HANDLE } from "@/lib/brand";
import {
  INVITACION_CLUB_TIRILLA_CUERPO,
  INVITACION_CLUB_TIRILLA_LLAMADO,
  INVITACION_CLUB_TIRILLA_TITULO,
  esAvisoErrorClubMillasEnTicket,
  ticketTieneQrAcumulacionClubMillas,
  ticketTieneSaldoClubMillasEnTirilla,
} from "@/lib/club-millas-invitacion-ticket";
import {
  MENSAJE_TIRILLA_CLUB_ACUMULADO_AUTO,
  MENSAJE_TIRILLA_CLUB_CONSULTA_PASO,
  MENSAJE_TIRILLA_CLUB_GANADAS_LABEL,
  MENSAJE_TIRILLA_CLUB_SALDO_ANTES_LABEL,
  MENSAJE_TIRILLA_CLUB_SALDO_DESPUES_LABEL,
  MENSAJE_TIRILLA_CLUB_SALDO_TITULO,
} from "@/lib/club-millas-consulta-url";
import {
  MENSAJE_TIRILLA_CLUB_CODIGO_LABEL,
  MENSAJE_TIRILLA_CLUB_FRECUENTE_PASO1,
  MENSAJE_TIRILLA_CLUB_FRECUENTE_PASO2,
  MENSAJE_TIRILLA_CLUB_FRECUENTE_TITULO,
  esCodigoCortoTirillaClubMillas,
} from "@/lib/fidelizacion-qr";
import {
  MENSAJE_DOMICILIOS_TIRILLA_LINEA1,
  MENSAJE_DOMICILIOS_TIRILLA_LINEA2,
} from "@/lib/domicilios-qr-ticket";
import { loadImpresionPrefs } from "@/lib/impresion-pos-storage";
import type { TicketVentaPayload } from "@/types/impresion-pos";

function formatCop(n: number): string {
  return n.toLocaleString("es-CO", { maximumFractionDigits: 0, minimumFractionDigits: 0 });
}

export interface TicketPrevisualizacionModalProps {
  open: boolean;
  ticket: TicketVentaPayload | null;
  /** Consulta histórica (ventas y comprobantes): permite cerrar sin imprimir. */
  modoConsulta?: boolean;
  onCerrar?: () => void;
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
  modoConsulta = false,
  onCerrar,
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

  const esFacturaElectronica = Boolean(
    ticket.facturaElectronica && (ticket.facturaElectronica.cufe?.trim() || ticket.facturaElectronica.numero?.trim())
  );
  const incluirQrPromocionales = !esFacturaElectronica;
  const tieneSaldoClub = ticketTieneSaldoClubMillasEnTirilla(ticket);
  const qrConsultaClub = ticket.clubMillasConsultaQrDataUrl?.trim();
  const qr = ticket.fidelizacionQrDataUrl?.trim();
  const codigoClub = ticket.clubMillasCodigoCorto?.trim().toUpperCase() ?? "";
  const msgClubMillas = ticket.fidelizacionPayloadTexto?.trim() ?? "";
  const tieneAcumulacionClub = ticketTieneQrAcumulacionClubMillas(ticket);
  const esAvisoClub = esAvisoErrorClubMillasEnTicket(ticket);
  const qrInvitacionClub = ticket.clubMillasInvitacionQrDataUrl?.trim();
  const mostrarClubSaldo = incluirQrPromocionales && tieneSaldoClub;
  const mostrarClubFrecuente = Boolean(incluirQrPromocionales && !tieneSaldoClub && (tieneAcumulacionClub || esAvisoClub));
  const mostrarInvitacionClub = Boolean(
    incluirQrPromocionales && !tieneAcumulacionClub && (qrInvitacionClub || ticket.clubMillasInvitacionUrl?.trim())
  );
  const qrDomicilios = ticket.domiciliosQrDataUrl?.trim();
  const mostrarPromoDomicilios = Boolean(incluirQrPromocionales && (qrDomicilios || ticket.domiciliosLandingUrl?.trim()));
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
            {modoConsulta ? "Comprobante entregado al cliente" : "Vista previa del comprobante"}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {modoConsulta ? (
              <>
                Tirilla 58 mm tal como se imprimió al cobrar. Podés{" "}
                <span className="font-semibold text-slate-800">reimprimir</span> o cerrar.
              </>
            ) : (
              <>
                Tirilla 58 mm · Tocá <span className="font-semibold text-slate-800">Imprimir</span> para continuar.
              </>
            )}
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
            {mostrarPromoDomicilios ? (
              <div className="mb-3 rounded-lg border border-cyan-200 bg-gradient-to-b from-cyan-50 to-white px-2 py-2.5 text-center">
                <p className="text-[8px] font-bold uppercase leading-snug tracking-wide text-cyan-800">
                  {MENSAJE_DOMICILIOS_TIRILLA_LINEA1}
                </p>
                <p className="mt-0.5 text-[13px] font-black tracking-[0.22em] text-teal-800">
                  {MENSAJE_DOMICILIOS_TIRILLA_LINEA2}
                </p>
                {qrDomicilios ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element -- data URL del QR */}
                    <img
                      src={qrDomicilios}
                      width={130}
                      height={130}
                      alt="QR pedidos a domicilio"
                      className="mx-auto mt-1"
                    />
                    <p className="mt-1 text-[7px] uppercase tracking-widest text-slate-500">Escanea y pide a domicilio</p>
                  </>
                ) : null}
              </div>
            ) : null}
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

            {ticket.desgloseIvaPreciosIncluidos &&
            (ticket.desgloseIvaPreciosIncluidos.subtotalSinIva > 0 ||
              ticket.desgloseIvaPreciosIncluidos.iva > 0) ? (
              <div className="mt-2 space-y-1 rounded-md bg-slate-100 px-2 py-2 text-[8px] text-slate-700">
                <div className="flex justify-between gap-2 font-medium">
                  <span>Subtotal (sin IVA)</span>
                  <span className="tabular-nums">$ {formatCop(ticket.desgloseIvaPreciosIncluidos.subtotalSinIva)}</span>
                </div>
                <div className="flex justify-between gap-2 font-medium">
                  <span>IVA {ticket.desgloseIvaPreciosIncluidos.tasaPorcentaje}%</span>
                  <span className="tabular-nums">$ {formatCop(ticket.desgloseIvaPreciosIncluidos.iva)}</span>
                </div>
              </div>
            ) : null}

            <div className="mt-3 flex items-center justify-between rounded-md bg-slate-900 px-2.5 py-2 text-[11px] font-extrabold tracking-wide text-white">
              <span>TOTAL</span>
              <span className="tabular-nums">$ {formatCop(ticket.total)}</span>
            </div>

            {ticket.facturaElectronica &&
            (ticket.facturaElectronica.cufe?.trim() || ticket.facturaElectronica.numero?.trim()) ? (
              <div className="mt-3 rounded-md border border-slate-300 bg-slate-50 px-2 py-2 text-[8px] leading-relaxed text-slate-700">
                <p className="text-center text-[9px] font-black tracking-wide text-slate-950">
                  Factura Electrónica de Venta
                </p>
                <p className="mt-2 text-center font-black uppercase tracking-wide text-slate-700">Emisor</p>
                <p>{ticket.facturaElectronica.emisorNombre?.trim() || "María Chorizos"}</p>
                {ticket.facturaElectronica.emisorNit?.trim() ? <p>NIT: {ticket.facturaElectronica.emisorNit}</p> : null}
                <p className="mt-2 text-center font-black uppercase tracking-wide text-slate-700">Adquirente</p>
                <p>{ticket.facturaElectronica.adquirenteNombre?.trim() || ticket.clienteNombre}</p>
                {ticket.facturaElectronica.adquirenteNit?.trim() ? (
                  <p>Doc/NIT: {ticket.facturaElectronica.adquirenteNit}</p>
                ) : null}
                <p className="mt-2 text-center font-black uppercase tracking-wide text-slate-700">DIAN</p>
                {ticket.facturaElectronica.numero?.trim() ? <p>No: {ticket.facturaElectronica.numero}</p> : null}
                {ticket.facturaElectronica.resolucionNumero?.trim() ? (
                  <p>Resolución: {ticket.facturaElectronica.resolucionNumero}</p>
                ) : null}
                <p>
                  Rango: {ticket.facturaElectronica.rangoDesde?.trim() || "1"} al{" "}
                  {ticket.facturaElectronica.rangoHasta?.trim() || "—"}
                </p>
                {ticket.facturaElectronica.cufe?.trim() ? <p className="break-all">CUFE: {ticket.facturaElectronica.cufe}</p> : null}
                <p>Proveedor: {ticket.facturaElectronica.proveedorTecnologico?.trim() || "Alegra / e-provider Colombia"}</p>
              </div>
            ) : null}

            <p className="mt-3 text-center text-[8px] leading-relaxed text-slate-600">{notaPie}</p>

            <div className="mt-4 border-t-2 border-slate-200 pt-3 text-center">
              <p className="text-[7px] font-semibold uppercase tracking-[0.2em] text-slate-500">Seguinos en redes</p>
              <p className="mt-1 text-[12px] font-extrabold tracking-wide text-pink-700">@{MARIA_CHORIZOS_IG_HANDLE}</p>
              <p className="mt-1 text-[7px] tracking-[0.12em] text-slate-400">María Chorizos · POS GEB</p>
            </div>

            {mostrarClubSaldo ? (
              <div className="mt-4 rounded-xl border-2 border-amber-400 bg-gradient-to-b from-amber-50 to-white px-3 py-3 text-center">
                <p className="text-[8px] font-extrabold uppercase tracking-wide text-amber-950">
                  {MENSAJE_TIRILLA_CLUB_SALDO_TITULO}
                </p>
                <p className="mt-1 text-[7px] font-semibold leading-snug text-amber-900">
                  {MENSAJE_TIRILLA_CLUB_ACUMULADO_AUTO}
                </p>
                {ticket.clubMillasSaldoAntes != null && Number.isFinite(ticket.clubMillasSaldoAntes) ? (
                  <>
                    <p className="mt-3 text-[7px] font-extrabold uppercase tracking-[0.2em] text-amber-800">
                      {MENSAJE_TIRILLA_CLUB_SALDO_ANTES_LABEL}
                    </p>
                    <p className="mt-1 text-[30px] font-black leading-none tabular-nums tracking-tight text-orange-700">
                      {ticket.clubMillasSaldoAntes.toLocaleString("es-CO")}
                    </p>
                  </>
                ) : null}
                {ticket.clubMillasSaldoTotal != null && Number.isFinite(ticket.clubMillasSaldoTotal) ? (
                  <>
                    <p className="mt-3 text-[7px] font-extrabold uppercase tracking-[0.2em] text-emerald-800">
                      {MENSAJE_TIRILLA_CLUB_SALDO_DESPUES_LABEL}
                    </p>
                    <p className="mt-1 text-[34px] font-black leading-none tabular-nums tracking-tight text-emerald-700">
                      {ticket.clubMillasSaldoTotal.toLocaleString("es-CO")}
                    </p>
                  </>
                ) : null}
                {(ticket.clubMillasGanadasCompra ?? 0) > 0 ? (
                  <>
                    <p className="mt-2 text-[7px] font-bold uppercase text-amber-800">
                      {MENSAJE_TIRILLA_CLUB_GANADAS_LABEL}
                    </p>
                    <p className="text-[18px] font-extrabold tabular-nums text-orange-600">
                      + {(ticket.clubMillasGanadasCompra ?? 0).toLocaleString("es-CO")}
                    </p>
                  </>
                ) : null}
                <p className="mt-2 text-[7px] font-semibold leading-snug text-amber-900">
                  {MENSAJE_TIRILLA_CLUB_CONSULTA_PASO}
                </p>
                {qrConsultaClub ? (
                  /* eslint-disable-next-line @next/next/no-img-element -- data URL del QR */
                  <img
                    src={qrConsultaClub}
                    width={150}
                    height={150}
                    alt="QR Mi plan Club de Millas"
                    className="mx-auto mt-2 rounded-md border border-amber-200 bg-white p-1"
                    style={{ imageRendering: "pixelated" }}
                  />
                ) : null}
              </div>
            ) : null}

            {mostrarClubFrecuente ? (
              <div className="mt-4 rounded-xl border border-amber-300 bg-gradient-to-b from-amber-50 to-white px-3 py-3 text-center">
                <p className="text-[8px] font-extrabold uppercase tracking-wide text-amber-950">
                  {MENSAJE_TIRILLA_CLUB_FRECUENTE_TITULO}
                </p>
                {esAvisoClub ? (
                  <p className="mt-2 text-[7px] font-semibold leading-snug text-rose-800">{msgClubMillas}</p>
                ) : (
                  <>
                    <p className="mt-2 text-[7px] font-semibold leading-snug text-amber-900">
                      {MENSAJE_TIRILLA_CLUB_FRECUENTE_PASO1}
                    </p>
                    <p className="mt-1 text-[7px] font-semibold leading-snug text-amber-900">
                      {MENSAJE_TIRILLA_CLUB_FRECUENTE_PASO2}
                    </p>
                  </>
                )}
                {esCodigoCortoTirillaClubMillas(codigoClub) ? (
                  <div className="mt-2 rounded-lg border border-amber-400 bg-white px-2 py-2">
                    <p className="text-[7px] font-extrabold uppercase tracking-[0.2em] text-amber-800">
                      {MENSAJE_TIRILLA_CLUB_CODIGO_LABEL}
                    </p>
                    <p className="mt-1 font-mono text-[20px] font-black tracking-[0.35em] text-orange-700">
                      {codigoClub}
                    </p>
                  </div>
                ) : null}
                {qr ? (
                  /* eslint-disable-next-line @next/next/no-img-element -- data URL del QR */
                  <img
                    src={qr}
                    width={140}
                    height={140}
                    alt="Código QR Club de Millas"
                    className="mx-auto mt-2 rounded-md border border-amber-200 bg-white p-1"
                    style={{ imageRendering: "pixelated" }}
                  />
                ) : null}
                {ticket.clubMillasLandingUrl?.trim() ? (
                  <p className="mt-2 break-all text-[6px] leading-snug text-slate-500">
                    {ticket.clubMillasLandingUrl.trim()}
                  </p>
                ) : null}
              </div>
            ) : null}

            {mostrarInvitacionClub ? (
              <div className="mt-4 rounded-xl border-2 border-amber-400 bg-gradient-to-b from-amber-50 via-orange-50 to-white px-3 py-3 text-center shadow-sm">
                <p className="text-[7px] font-extrabold uppercase tracking-[0.2em] text-amber-800">
                  Programa nacional
                </p>
                <p className="mt-1 text-[8px] font-extrabold uppercase tracking-wide text-amber-950">
                  {INVITACION_CLUB_TIRILLA_TITULO}
                </p>
                <p className="mt-1 text-[14px] font-black uppercase tracking-[0.14em] text-orange-700">
                  {INVITACION_CLUB_TIRILLA_LLAMADO}
                </p>
                <p className="mt-2 text-[7px] font-semibold leading-snug text-amber-900">
                  {INVITACION_CLUB_TIRILLA_CUERPO}
                </p>
                {qrInvitacionClub ? (
                  /* eslint-disable-next-line @next/next/no-img-element -- data URL del QR */
                  <img
                    src={qrInvitacionClub}
                    width={148}
                    height={148}
                    alt="QR inscripción Club de Millas"
                    className="mx-auto mt-2 rounded-md border border-amber-300 bg-white p-1"
                    style={{ imageRendering: "pixelated" }}
                  />
                ) : null}
                <p className="mt-2 text-[7px] font-bold uppercase tracking-widest text-amber-800">
                  Escanea el QR · Registrate gratis
                </p>
              </div>
            ) : null}
          </article>
        </div>

        <div className="flex flex-shrink-0 flex-col gap-2 border-t border-slate-100 bg-slate-50/90 px-5 py-4 sm:flex-row sm:flex-wrap sm:justify-end">
          {modoConsulta && onCerrar ? (
            <button
              type="button"
              disabled={busy}
              onClick={onCerrar}
              className="w-full rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 sm:order-1 sm:w-auto"
            >
              Cerrar
            </button>
          ) : null}
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
