"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { filtrarClientesPorBusqueda, nombreDisplayCliente } from "@/lib/clientes-pos-firestore";
import { CONSUMIDOR_FINAL_ID, type ClientePosFirestoreDoc, type ClienteVentaRef } from "@/types/clientes-pos";

const consumidorFinalRef: ClienteVentaRef = {
  id: CONSUMIDOR_FINAL_ID,
  nombreDisplay: "Consumidor final",
};

export interface SeleccionClienteVentaProps {
  clienteActivo: ClienteVentaRef;
  onChange: (c: ClienteVentaRef) => void;
  clientesGuardados: ClientePosFirestoreDoc[];
  onCrearClick: () => void;
  disabled?: boolean;
}

export default function SeleccionClienteVenta({
  clienteActivo,
  onChange,
  clientesGuardados,
  onCrearClick,
  disabled,
}: SeleccionClienteVentaProps) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const filtrados = useMemo(() => filtrarClientesPorBusqueda(clientesGuardados, busqueda), [clientesGuardados, busqueda]);

  useEffect(() => {
    if (!abierto) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setAbierto(false);
        setBusqueda("");
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [abierto]);

  const elegir = (c: ClienteVentaRef) => {
    onChange(c);
    setAbierto(false);
    setBusqueda("");
  };

  const elegirDoc = (doc: ClientePosFirestoreDoc) => {
    elegir({
      id: doc.id,
      nombreDisplay: nombreDisplayCliente(doc),
      numeroIdentificacion: doc.numeroIdentificacion,
      tipoIdentificacion: doc.tipoIdentificacion,
    });
  };

  return (
    <div ref={rootRef} className="relative">
      <label className="mb-1 flex items-center gap-1 text-xs font-medium text-gray-700">
        Cliente <span className="text-red-500" aria-hidden>*</span>
      </label>
      <div className="flex gap-1.5">
        <div className="relative min-w-0 flex-1">
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              if (disabled) return;
              setAbierto((v) => !v);
              if (!abierto) setBusqueda("");
            }}
            className="flex w-full items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-left text-sm text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:bg-gray-100"
          >
            <svg className="h-4 w-4 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <span className="min-w-0 flex-1 truncate">{clienteActivo.nombreDisplay}</span>
          </button>
          {abierto && (
            <div className="absolute left-0 right-0 z-50 mt-1 max-h-52 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
              <input
                type="search"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre, documento, correo…"
                className="w-full border-b border-gray-100 px-3 py-2 text-sm focus:outline-none"
                autoFocus
              />
              <button
                type="button"
                onClick={() => elegir(consumidorFinalRef)}
                className={`flex w-full px-3 py-2 text-left text-sm hover:bg-primary-50 ${
                  clienteActivo.id === CONSUMIDOR_FINAL_ID ? "bg-primary-50 font-medium text-primary-900" : "text-gray-800"
                }`}
              >
                Consumidor final
              </button>
              {filtrados.map((doc) => (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => elegirDoc(doc)}
                  className={`flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                    clienteActivo.id === doc.id ? "bg-gray-100" : ""
                  }`}
                >
                  <span className="font-medium text-gray-900">{nombreDisplayCliente(doc)}</span>
                  <span className="text-xs text-gray-500">
                    {doc.tipoIdentificacion} {doc.numeroIdentificacion}
                    {doc.digitoVerificacion != null && doc.digitoVerificacion !== "" ? `-${doc.digitoVerificacion}` : ""}
                  </span>
                </button>
              ))}
              {filtrados.length === 0 && busqueda.trim() !== "" && (
                <p className="px-3 py-2 text-xs text-gray-500">Sin coincidencias. Usa + para crear.</p>
              )}
            </div>
          )}
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={onCrearClick}
          title="Crear cliente"
          className="flex h-[38px] w-[38px] flex-shrink-0 items-center justify-center rounded-lg bg-primary-600 text-xl font-bold text-white shadow-sm hover:bg-primary-700 disabled:opacity-50"
        >
          +
        </button>
      </div>
    </div>
  );
}
