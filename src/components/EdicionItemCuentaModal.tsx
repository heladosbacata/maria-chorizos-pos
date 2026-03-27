"use client";

import { useEffect, useMemo, useState } from "react";
import {
  lineInputDesdeItemCuentaLike,
  montoDescuentoLinea,
  subtotalNetoLinea,
  totalBrutoLinea,
  type DescuentoModoLinea,
} from "@/lib/item-cuenta-linea";
import { formatPesosCop, parsePesosCopInput } from "@/lib/pesos-cop-input";
import type { ItemCuenta } from "@/types/pos-caja-item";

const CARGOS_OPCIONES = [{ value: "ninguno", label: "Ninguno" }] as const;

function parsePorcentajeInput(s: string): number {
  const t = String(s ?? "")
    .trim()
    .replace(/\s/g, "")
    .replace(/%/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const n = parseFloat(t);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(100, n);
}

type ModoDescuentoUi = "pesos" | "porcentaje";

interface EdicionItemCuentaModalProps {
  open: boolean;
  onClose: () => void;
  item: ItemCuenta | null;
  onGuardar: (actualizado: ItemCuenta) => void;
}

export default function EdicionItemCuentaModal({ open, onClose, item, onGuardar }: EdicionItemCuentaModalProps) {
  const [cantidad, setCantidad] = useState(1);
  const [precioStr, setPrecioStr] = useState("");
  const [modoDescuento, setModoDescuento] = useState<ModoDescuentoUi>("pesos");
  const [descuentoStr, setDescuentoStr] = useState("");
  const [cargo1, setCargo1] = useState("ninguno");

  useEffect(() => {
    if (!item || !open) return;
    setCantidad(Math.max(1, item.cantidad));
    const p = item.precioUnitarioOverride ?? item.producto.precioUnitario;
    setPrecioStr(formatPesosCop(p, true));
    const dm = item.descuentoModo ?? "ninguno";
    if (dm === "porcentaje") {
      setModoDescuento("porcentaje");
      setDescuentoStr(item.descuentoValor != null && item.descuentoValor > 0 ? String(item.descuentoValor).replace(".", ",") : "");
    } else {
      setModoDescuento("pesos");
      setDescuentoStr(
        dm === "pesos" && item.descuentoValor != null && item.descuentoValor > 0
          ? formatPesosCop(item.descuentoValor, true)
          : ""
      );
    }
    setCargo1(item.cargo1 ?? "ninguno");
  }, [item, open]);

  const preview = useMemo(() => {
    if (!item) {
      return { bruto: 0, desc: 0, neto: 0 };
    }
    const precio = parsePesosCopInput(precioStr);
    const q = Math.max(1, cantidad);
    let descModo: DescuentoModoLinea = "ninguno";
    let descVal = 0;
    if (modoDescuento === "pesos") {
      const d = parsePesosCopInput(descuentoStr);
      if (d > 0) {
        descModo = "pesos";
        descVal = d;
      }
    } else {
      const d = parsePorcentajeInput(descuentoStr);
      if (d > 0) {
        descModo = "porcentaje";
        descVal = d;
      }
    }
    const li = lineInputDesdeItemCuentaLike({
      ...item,
      cantidad: q,
      precioUnitarioOverride: Math.abs(precio - item.producto.precioUnitario) < 0.005 ? undefined : precio,
      descuentoModo: descModo,
      descuentoValor: descVal,
      cargo1,
    });
    return {
      bruto: totalBrutoLinea(li),
      desc: montoDescuentoLinea(li),
      neto: subtotalNetoLinea(li),
    };
  }, [item, cantidad, precioStr, modoDescuento, descuentoStr, cargo1]);

  const handleGuardar = () => {
    if (!item) return;
    const precio = parsePesosCopInput(precioStr);
    if (!Number.isFinite(precio) || precio <= 0) {
      window.alert("Indica un precio unitario válido mayor a $0.");
      return;
    }
    const q = Math.max(1, Math.floor(cantidad));
    if (q < 1) {
      window.alert("La cantidad debe ser al menos 1.");
      return;
    }
    let descuentoModo: DescuentoModoLinea = "ninguno";
    let descuentoValor: number | undefined;
    if (modoDescuento === "pesos") {
      const d = parsePesosCopInput(descuentoStr);
      if (d > 0) {
        descuentoModo = "pesos";
        descuentoValor = d;
      }
    } else {
      const d = parsePorcentajeInput(descuentoStr);
      if (d > 0) {
        descuentoModo = "porcentaje";
        descuentoValor = d;
      }
    }
    const catalogo = item.producto.precioUnitario;
    const precioUnitarioOverride = Math.abs(precio - catalogo) < 0.005 ? undefined : precio;

    onGuardar({
      ...item,
      cantidad: q,
      precioUnitarioOverride,
      descuentoModo,
      descuentoValor,
      cargo1,
    });
    onClose();
  };

  if (!open || !item) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <button
        type="button"
        className="absolute inset-0 bg-black/45"
        aria-label="Cerrar"
        onClick={onClose}
      />
      <div className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Edición de item</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Cerrar"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">
          <p className="mb-4 text-sm text-slate-600">La edición del item no afectará el catálogo.</p>

          <label className="mb-1 block text-xs font-medium text-slate-600">Cantidad</label>
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/80 p-1">
            <button
              type="button"
              onClick={() => setCantidad((c) => Math.max(1, c - 1))}
              className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-lg font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              −
            </button>
            <input
              type="number"
              min={1}
              step={1}
              value={cantidad}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                setCantidad(Number.isFinite(v) && v >= 1 ? v : 1);
              }}
              className="min-w-0 flex-1 border-0 bg-transparent text-center text-base font-semibold text-slate-900 outline-none focus:ring-0"
            />
            <button
              type="button"
              onClick={() => setCantidad((c) => c + 1)}
              className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-lg font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              +
            </button>
          </div>

          <label className="mb-1 block text-xs font-medium text-slate-600">Item</label>
          <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-800">
            {item.producto.descripcion}
          </div>

          <label className="mb-1 block text-xs font-medium text-slate-600">
            Precio unitario <span className="text-red-500">*</span>
          </label>
          <div className="mb-4 flex rounded-xl border border-slate-200 bg-white">
            <span className="flex items-center pl-3 text-slate-500">$</span>
            <input
              type="text"
              inputMode="decimal"
              value={precioStr}
              onChange={(e) => setPrecioStr(e.target.value)}
              className="w-full py-2.5 pr-3 text-sm outline-none"
            />
          </div>

          <div className="mb-4">
            <label className="mb-1 block text-xs font-medium text-slate-600">Descuento</label>
            <div className="mb-2 inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
              <button
                type="button"
                onClick={() => setModoDescuento("pesos")}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                  modoDescuento === "pesos" ? "bg-white text-sky-700 shadow-sm" : "text-slate-600"
                }`}
              >
                $
              </button>
              <button
                type="button"
                onClick={() => setModoDescuento("porcentaje")}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                  modoDescuento === "porcentaje" ? "bg-white text-sky-700 shadow-sm" : "text-slate-600"
                }`}
              >
                %
              </button>
            </div>
            <div className="flex rounded-xl border border-slate-200 bg-white">
              {modoDescuento === "pesos" ? (
                <>
                  <span className="flex items-center pl-3 text-sky-600">$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={descuentoStr}
                    onChange={(e) => setDescuentoStr(e.target.value)}
                    placeholder="0,00"
                    className="w-full py-2.5 pr-3 text-sm outline-none"
                  />
                </>
              ) : (
                <>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={descuentoStr}
                    onChange={(e) => setDescuentoStr(e.target.value)}
                    placeholder="0"
                    className="w-full py-2.5 pl-3 pr-2 text-sm outline-none"
                  />
                  <span className="flex items-center pr-3 text-sky-600">%</span>
                </>
              )}
            </div>
          </div>

          <label className="mb-1 block text-xs font-medium text-slate-600">
            Cargo 1 <span className="text-red-500">*</span>
          </label>
          <select
            value={cargo1}
            onChange={(e) => setCargo1(e.target.value)}
            className="mb-4 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
          >
            {CARGOS_OPCIONES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          <div className="space-y-2 rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Total bruto</span>
              <span className="font-medium tabular-nums text-slate-900">${formatPesosCop(preview.bruto)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Subtotal</span>
              <span className="font-medium tabular-nums text-slate-900">
                ${formatPesosCop(Math.max(0, preview.bruto - preview.desc))}
              </span>
            </div>
            <div className="flex justify-between rounded-lg bg-sky-100/80 px-3 py-2.5 font-semibold text-slate-900">
              <span>Total item</span>
              <span className="tabular-nums">${formatPesosCop(preview.neto)}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-3 border-t border-slate-100 bg-slate-50 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-300 bg-white py-2.5 text-sm font-semibold text-sky-700 hover:bg-slate-50"
          >
            Cerrar
          </button>
          <button
            type="button"
            onClick={handleGuardar}
            className="flex-1 rounded-xl bg-sky-600 py-2.5 text-sm font-semibold text-white hover:bg-sky-700"
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
