"use client";

import { useEffect, useState } from "react";
import { listarMovimientosInventario } from "@/lib/inventario-pos-firestore";
import type { InventarioSaldoRow } from "@/lib/inventario-pos-firestore";
import {
  construirPedidoSugerido,
  DIAS_COBERTURA_PEDIDO_DEFAULT,
  DIAS_VENTANA_ROTACION_DEFAULT,
  type ResultadoPedidoSugerido,
} from "@/lib/inventario-pedido-sugerido";
import type { InsumoKitItem } from "@/types/inventario-pos";

const SCAN_MOVIMIENTOS = 800;

export interface ModalPedidoSugeridoInventarioProps {
  open: boolean;
  onClose: () => void;
  puntoVenta: string;
  insumos: InsumoKitItem[];
  saldoRows: InventarioSaldoRow[];
  /** Mínimo efectivo por SKU normalizado. */
  minimoPorSku: Map<string, number | null | undefined>;
}

export default function ModalPedidoSugeridoInventario({
  open,
  onClose,
  puntoVenta,
  insumos,
  saldoRows,
  minimoPorSku,
}: ModalPedidoSugeridoInventarioProps) {
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoPedidoSugerido | null>(null);
  const [diasCobertura, setDiasCobertura] = useState(DIAS_COBERTURA_PEDIDO_DEFAULT);

  useEffect(() => {
    if (!open) return;
    setErrorMsg(null);
    setResultado(null);
    setBusy(true);
    let cancel = false;
    void (async () => {
      try {
        const movimientos = await listarMovimientosInventario(puntoVenta, SCAN_MOVIMIENTOS);
        if (cancel) return;
        const r = construirPedidoSugerido({
          puntoVenta,
          insumos,
          saldoRows,
          movimientos,
          minimoPorSku,
          diasVentana: DIAS_VENTANA_ROTACION_DEFAULT,
          diasCobertura,
        });
        setResultado(r);
      } catch {
        if (!cancel) setErrorMsg("No se pudieron leer los movimientos de la última semana.");
      } finally {
        if (!cancel) setBusy(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [open, puntoVenta, insumos, saldoRows, minimoPorSku, diasCobertura]);

  if (!open) return null;

  const copiarLista = async () => {
    if (!resultado || resultado.lineas.length === 0) return;
    const lines = [
      `Pedido sugerido (paquetes) — ${resultado.puntoVenta}`,
      `Rotación ${resultado.diasVentana} días · cobertura ${resultado.diasCobertura} días`,
      "",
      "SKU\tProducto\tPaquetes a pedir\tContenido und",
      ...resultado.lineas.map((l) => {
        const und =
          l.unidadesEquivPedir != null
            ? `${l.unidadesEquivPedir} und (x${l.unidadesPorEmpaque})`
            : "—";
        return `${l.sku}\t${l.descripcion}\t${l.paquetesPedir} paq.\t${und}${l.bajoMinimo ? "\t[bajo mínimo]" : ""}`;
      }),
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      className="fixed inset-0 z-[260] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pedido-sugerido-titulo"
    >
      <button type="button" className="absolute inset-0 bg-black/50" aria-label="Cerrar" onClick={onClose} />
      <div className="relative z-10 flex max-h-[min(92vh,52rem)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border-2 border-sky-200 bg-white shadow-2xl">
        <div className="border-b border-sky-100 bg-gradient-to-r from-sky-50 to-white px-5 py-4 sm:px-6">
          <h2 id="pedido-sugerido-titulo" className="text-lg font-bold text-sky-950 sm:text-xl">
            Pedido sugerido a casa matriz
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            Cantidades en <strong className="font-semibold">paquetes</strong> (como pide matriz: x6, x100…). Se basa en
            la rotación de {DIAS_VENTANA_ROTACION_DEFAULT} días y en productos bajo el mínimo.
          </p>
          <label className="mt-3 inline-flex items-center gap-2 text-sm text-gray-700">
            Días de cobertura del pedido
            <select
              value={diasCobertura}
              onChange={(e) => setDiasCobertura(Number(e.target.value))}
              className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm font-semibold"
            >
              <option value={7}>7 días</option>
              <option value={14}>14 días</option>
              <option value={21}>21 días</option>
            </select>
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-4 py-4 sm:px-6">
          {busy ? (
            <p className="py-10 text-center text-sm text-gray-600">Calculando rotación de inventario…</p>
          ) : null}
          {errorMsg ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
              {errorMsg}
            </p>
          ) : null}
          {!busy && resultado ? (
            <>
              <p className="mb-3 text-sm text-gray-700">
                <span className="font-semibold text-gray-900">{resultado.resumen.productosAPedir}</span> productos
                {" · "}
                <span className="font-semibold tabular-nums text-sky-900">
                  {resultado.resumen.totalPaquetesPedir} paquetes
                </span>{" "}
                a pedir
              </p>
              {resultado.lineas.length === 0 ? (
                <p className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-600">
                  No hay nada que pedir con la rotación actual y los mínimos configurados.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-gray-200">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase text-gray-600">
                      <tr>
                        <th className="px-3 py-2">Código</th>
                        <th className="px-3 py-2">Producto</th>
                        <th className="px-3 py-2 text-right">Saldo</th>
                        <th className="px-3 py-2 text-right">Consumo {resultado.diasVentana}d</th>
                        <th className="px-3 py-2 text-right">Empaque</th>
                        <th className="px-3 py-2 text-right">Pedir (paquetes)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {resultado.lineas.map((l) => (
                        <tr key={l.sku} className={l.bajoMinimo ? "bg-amber-50/80" : "bg-white"}>
                          <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-gray-700">{l.sku}</td>
                          <td className="px-3 py-2 text-gray-900">
                            {l.descripcion}
                            {l.bajoMinimo ? (
                              <span className="ml-2 inline-flex rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-900">
                                Bajo mín.
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            <span className="font-semibold">{l.saldoActual} und</span>
                            {l.saldoEnPaquetes && l.unidadesPorEmpaque > 1 ? (
                              <span className="mt-0.5 block text-[10px] text-gray-500">
                                {Math.floor(l.saldoActual / l.unidadesPorEmpaque)} paq. +{" "}
                                {l.saldoActual % l.unidadesPorEmpaque} und
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                            {l.consumoVentana} und
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                            {l.unidadesPorEmpaque > 1 ? `x${l.unidadesPorEmpaque}` : "und"}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <span className="block text-base font-bold tabular-nums text-sky-900">
                              {l.paquetesPedir} paq.
                            </span>
                            {l.unidadesEquivPedir != null ? (
                              <span className="text-[10px] text-gray-500">
                                ≈ {l.unidadesEquivPedir} und
                              </span>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-200 bg-gray-50 px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={() => void copiarLista()}
            disabled={!resultado || resultado.lineas.length === 0}
            className="rounded-xl border border-sky-300 bg-white px-4 py-2 text-sm font-semibold text-sky-900 hover:bg-sky-50 disabled:opacity-50"
          >
            Copiar lista (paquetes)
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
