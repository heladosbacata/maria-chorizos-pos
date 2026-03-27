"use client";

import { useCallback, useEffect, useState } from "react";
import CajeroFichaFormFields from "@/components/CajeroFichaFormFields";
import {
  actualizarCajeroTurnoFirestore,
  crearCajeroTurnoFirestore,
  listarCajerosTurnoPorPuntoVenta,
  nombreDisplayCajeroTurno,
  setCajeroTurnoActivoFirestore,
  type CajeroTurnoDoc,
} from "@/lib/cajeros-turno-firestore";
import type { CajeroFichaDatos } from "@/types/pos-perfil-cajero";
import { emptyCajeroFicha } from "@/types/pos-perfil-cajero";

export interface CajerosTurnoPanelProps {
  puntoVenta: string | undefined;
  uidSesion: string;
}

export default function CajerosTurnoPanel({ puntoVenta, uidSesion }: CajerosTurnoPanelProps) {
  const [lista, setLista] = useState<CajeroTurnoDoc[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [ficha, setFicha] = useState<CajeroFichaDatos>(emptyCajeroFicha());
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const setCampo = useCallback(<K extends keyof CajeroFichaDatos>(k: K, v: CajeroFichaDatos[K]) => {
    setFicha((prev) => ({ ...prev, [k]: v }));
  }, []);

  const cargar = useCallback(async () => {
    if (!puntoVenta?.trim()) {
      setLista([]);
      setCargando(false);
      return;
    }
    setCargando(true);
    setError(null);
    try {
      const rows = await listarCajerosTurnoPorPuntoVenta(puntoVenta);
      setLista(rows);
    } catch {
      setError("No se pudo cargar la lista de cajeros.");
      setLista([]);
    } finally {
      setCargando(false);
    }
  }, [puntoVenta]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const abrirNuevo = () => {
    setEditandoId(null);
    const base = emptyCajeroFicha();
    setFicha(base);
    setMensaje(null);
    setModalAbierto(true);
  };

  const abrirEditar = (row: CajeroTurnoDoc) => {
    setEditandoId(row.id);
    setFicha({ ...emptyCajeroFicha(), ...row.ficha });
    setMensaje(null);
    setModalAbierto(true);
  };

  const cerrarModal = () => {
    if (guardando) return;
    setModalAbierto(false);
  };

  const guardar = async () => {
    if (!puntoVenta?.trim()) {
      setMensaje("No hay punto de venta asignado a tu sesión.");
      return;
    }
    const nom = `${ficha.nombres} ${ficha.apellidos}`.trim();
    if (!nom && !ficha.correo.trim()) {
      setMensaje("Indica al menos nombres y apellidos o un correo para identificar al cajero.");
      return;
    }
    setGuardando(true);
    setMensaje(null);
    try {
      if (editandoId) {
        const r = await actualizarCajeroTurnoFirestore({
          firestoreId: editandoId,
          ficha,
        });
        if (!r.ok) {
          setMensaje(r.message ?? "No se pudo guardar.");
          setGuardando(false);
          return;
        }
      } else {
        const r = await crearCajeroTurnoFirestore({
          puntoVenta,
          ficha,
          createdByUid: uidSesion,
        });
        if (!r.ok) {
          setMensaje(r.message ?? "No se pudo crear.");
          setGuardando(false);
          return;
        }
      }
      setModalAbierto(false);
      await cargar();
      setMensaje(null);
    } finally {
      setGuardando(false);
    }
  };

  const toggleActivo = async (row: CajeroTurnoDoc) => {
    const r = await setCajeroTurnoActivoFirestore(row.id, !row.activo);
    if (!r.ok) {
      setError(r.message ?? "No se pudo actualizar el estado.");
      return;
    }
    await cargar();
  };

  if (!puntoVenta?.trim()) {
    return (
      <section className="mb-8 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        <p className="font-medium">Cajeros para turno en caja</p>
        <p className="mt-1">Asigna un punto de venta a tu usuario para registrar cajeros y usarlos al abrir turno.</p>
      </section>
    );
  }

  return (
    <section className="mb-8 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-gray-900">Cajeros del punto de venta (turno en caja)</h3>
          <p className="mt-1 max-w-3xl text-sm text-gray-600">
            Alta de los cajeros que pueden seleccionarse al <strong>abrir un turno</strong> en el POS. Los datos son los
            mismos campos que el perfil del cajero. Si Firebase pide un índice compuesto al listar, créalo desde el enlace
            del error de consola (punto de venta + activo).
          </p>
        </div>
        <button
          type="button"
          onClick={() => void cargar()}
          disabled={cargando}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50"
        >
          {cargando ? "Cargando…" : "Actualizar lista"}
        </button>
      </div>

      {error && (
        <p className="mt-3 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={abrirNuevo}
        className="mt-4 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
      >
        Nuevo cajero (turno)
      </button>

      <div className="mt-4 overflow-x-auto rounded-lg border border-gray-100">
        <table className="min-w-[640px] w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-600">
              <th className="px-3 py-2">Nombre</th>
              <th className="px-3 py-2">Documento</th>
              <th className="px-3 py-2">Correo</th>
              <th className="px-3 py-2">Cargo</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {!cargando && lista.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-gray-500">
                  No hay cajeros registrados. Crea al menos uno para exigir selección al abrir turno (o usa la opción de
                  respaldo «Usuario en sesión» si no hay lista).
                </td>
              </tr>
            )}
            {lista.map((row) => (
              <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50/80">
                <td className="px-3 py-2 font-medium text-gray-900">{nombreDisplayCajeroTurno(row.ficha)}</td>
                <td className="px-3 py-2 text-gray-700">{row.ficha.numeroDocumento || "—"}</td>
                <td className="px-3 py-2 text-gray-700">{row.ficha.correo || "—"}</td>
                <td className="px-3 py-2 text-gray-700">{row.ficha.cargo || "—"}</td>
                <td className="px-3 py-2">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                      row.activo ? "bg-emerald-100 text-emerald-800" : "bg-gray-200 text-gray-700"
                    }`}
                  >
                    {row.activo ? "Activo" : "Inactivo"}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => abrirEditar(row)}
                      className="text-xs font-semibold text-primary-600 hover:underline"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => void toggleActivo(row)}
                      className="text-xs font-semibold text-gray-600 hover:underline"
                    >
                      {row.activo ? "Desactivar" : "Activar"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalAbierto && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <button type="button" className="absolute inset-0 bg-black/50" aria-label="Cerrar" onClick={cerrarModal} />
          <div className="relative flex max-h-[min(90vh,800px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
              <h4 className="text-lg font-bold text-gray-900">{editandoId ? "Editar cajero" : "Nuevo cajero"}</h4>
              <button type="button" onClick={cerrarModal} className="rounded p-1 text-gray-500 hover:bg-gray-100">
                ✕
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
              <p className="mb-3 text-xs text-gray-500">
                Punto de venta: <strong className="text-gray-800">{puntoVenta}</strong>
              </p>
              <CajeroFichaFormFields datos={ficha} setCampo={setCampo} />
              {mensaje && (
                <p className="mt-3 text-sm text-red-600" role="alert">
                  {mensaje}
                </p>
              )}
            </div>
            <div className="flex gap-2 border-t border-gray-100 bg-gray-50 px-5 py-3">
              <button
                type="button"
                onClick={cerrarModal}
                disabled={guardando}
                className="flex-1 rounded-lg border border-gray-300 bg-white py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={guardando}
                onClick={() => void guardar()}
                className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {guardando ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
