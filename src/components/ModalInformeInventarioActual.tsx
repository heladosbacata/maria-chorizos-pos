"use client";

import { useEffect, useMemo, useState } from "react";
import { construirDatosInformeInventarioActual } from "@/lib/inventario-actual-pos-data";
import { enviarInformeInventarioActualPorCorreo } from "@/lib/inventario-actual-pos-correo";
import { emailDesdeFichaFranquiciado, getFranquiciadoPorPuntoVenta } from "@/lib/franquiciado-pos";
import { auth } from "@/lib/firebase";
import { descargarPdfInformeInventarioActual } from "@/lib/inventario-actual-pos-pdf";
import type { MapaPreciosCarrito } from "@/lib/precios-compra-carrito";
import type { InventarioSaldoRow } from "@/lib/inventario-pos-firestore";
import type { InsumoKitItem } from "@/types/inventario-pos";

export interface ModalInformeInventarioActualProps {
  open: boolean;
  onClose: () => void;
  puntoVenta: string;
  insumos: InsumoKitItem[];
  saldoRows: InventarioSaldoRow[];
  mapaPreciosCarrito: MapaPreciosCarrito;
  fuenteCatalogo: "sheet" | "firestore" | null;
  emailSesion: string | null;
}

export default function ModalInformeInventarioActual({
  open,
  onClose,
  puntoVenta,
  insumos,
  saldoRows,
  mapaPreciosCarrito,
  fuenteCatalogo,
  emailSesion,
}: ModalInformeInventarioActualProps) {
  const [emailPara, setEmailPara] = useState("");
  const [busy, setBusy] = useState<"idle" | "pdf" | "correo">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [exitoMsg, setExitoMsg] = useState<string | null>(null);

  const datos = useMemo(
    () =>
      construirDatosInformeInventarioActual({
        puntoVenta,
        insumos,
        saldoRows,
        mapaPreciosCarrito,
        fuenteCatalogo,
      }),
    [puntoVenta, insumos, saldoRows, mapaPreciosCarrito, fuenteCatalogo]
  );

  useEffect(() => {
    if (!open) return;
    setErrorMsg(null);
    setExitoMsg(null);
    setBusy("idle");

    let cancel = false;
    void (async () => {
      const token = await auth?.currentUser?.getIdToken().catch(() => null);
      const r = await getFranquiciadoPorPuntoVenta(puntoVenta, token);
      if (cancel) return;
      const fromFicha = emailDesdeFichaFranquiciado(r.franquiciado ?? null);
      setEmailPara(fromFicha ?? emailSesion?.trim() ?? "");
    })();

    return () => {
      cancel = true;
    };
  }, [open, puntoVenta, emailSesion]);

  if (!open) return null;

  const ocupado = busy !== "idle";
  const r = datos.resumen;

  const descargarPdf = async () => {
    setErrorMsg(null);
    setExitoMsg(null);
    setBusy("pdf");
    try {
      await descargarPdfInformeInventarioActual(datos);
      setExitoMsg("PDF descargado en tu equipo.");
    } catch {
      setErrorMsg("No se pudo generar el PDF. Intentá de nuevo.");
    } finally {
      setBusy("idle");
    }
  };

  const enviarCorreo = async () => {
    setErrorMsg(null);
    setExitoMsg(null);
    setBusy("correo");
    try {
      const token = await auth?.currentUser?.getIdToken();
      if (!token) {
        setErrorMsg("No hay sesión válida. Volvé a iniciar sesión e intentá de nuevo.");
        return;
      }
      const result = await enviarInformeInventarioActualPorCorreo({
        idToken: token,
        datos,
        to: emailPara,
      });
      if (!result.ok) {
        setErrorMsg(result.message);
        return;
      }
      setExitoMsg("Informe enviado por correo con el PDF adjunto.");
    } catch {
      setErrorMsg("No se pudo enviar el correo. Revisá la conexión e intentá de nuevo.");
    } finally {
      setBusy("idle");
    }
  };

  return (
    <div
      className="fixed inset-0 z-[260] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-informe-inv-titulo"
    >
      <div className="absolute inset-0 bg-black/55" onClick={() => !ocupado && onClose()} aria-hidden="true" />
      <div className="relative flex max-h-[min(92vh,640px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
        <div className="shrink-0 bg-gradient-to-br from-[#0f4d35] to-[#0a3324] px-5 py-4 text-white">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-200">Inventario actual</p>
              <h2 id="modal-informe-inv-titulo" className="mt-1 text-lg font-bold">
                Informe PDF y correo
              </h2>
              <p className="mt-1 text-xs text-white/80">{puntoVenta}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={ocupado}
              className="rounded-lg px-2 py-1 text-white/80 hover:bg-white/10 disabled:opacity-50"
              aria-label="Cerrar"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <p className="text-sm text-gray-700">
            Generá un PDF con todos los productos del catálogo: saldo, precio de compra y valor en stock. Incluye fecha
            y hora de generación (Colombia).
          </p>

          <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-800">
            <p>
              <span className="text-gray-600">Productos con stock:</span>{" "}
              <strong>{r.productosConSaldo}</strong> de {r.productosCatalogo}
            </p>
            <p className="mt-1">
              <span className="text-gray-600">Valor total en stock:</span>{" "}
              <strong className="tabular-nums">
                {r.totalValorStock.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 })}
              </strong>
            </p>
          </div>

          <div className="mt-4">
            <label htmlFor="informe-inv-email" className="mb-1 block text-sm font-medium text-gray-800">
              Enviar a (correo)
            </label>
            <input
              id="informe-inv-email"
              type="email"
              value={emailPara}
              onChange={(e) => setEmailPara(e.target.value)}
              disabled={ocupado}
              placeholder="franquiciado@ejemplo.com"
              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30 disabled:bg-gray-100"
            />
          </div>

          {errorMsg && (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              {errorMsg}
            </p>
          )}
          {exitoMsg && (
            <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              {exitoMsg}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-gray-100 bg-gray-50 px-5 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={ocupado}
            className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50"
          >
            Cerrar
          </button>
          <button
            type="button"
            onClick={() => void descargarPdf()}
            disabled={ocupado || insumos.length === 0}
            className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 hover:bg-gray-100 disabled:opacity-50"
          >
            {busy === "pdf" ? "Generando PDF…" : "Descargar PDF"}
          </button>
          <button
            type="button"
            onClick={() => void enviarCorreo()}
            disabled={ocupado || insumos.length === 0 || !emailPara.trim()}
            className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {busy === "correo" ? "Enviando…" : "Enviar PDF por correo"}
          </button>
        </div>
      </div>
    </div>
  );
}
