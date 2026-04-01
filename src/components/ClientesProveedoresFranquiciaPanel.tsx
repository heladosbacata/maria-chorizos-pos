"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import CrearClientePosModal from "@/components/CrearClientePosModal";
import {
  agregarProveedorComprasGastos,
  eliminarProveedorComprasGastos,
  leerBundleComprasGastos,
  type CgBundle,
} from "@/lib/compras-gastos-franquicia-storage";
import { auth } from "@/lib/firebase";
import {
  filtrarClientesPorBusqueda,
  listarClientesPorPuntoVenta,
  nombreDisplayCliente,
} from "@/lib/clientes-pos-firestore";
import { fechaColombia } from "@/lib/fecha-colombia";
import { POS_CONTADOR_ROLE } from "@/lib/auth-roles";
import type { ClientePosFirestoreDoc } from "@/types/clientes-pos";

export interface ClientesProveedoresFranquiciaPanelProps {
  puntoVenta: string | null;
  uid: string | null;
  role?: string | null;
  onVolver?: () => void;
}

type Pestaña = "clientes" | "proveedores";

function formatCreatedAt(c: ClientePosFirestoreDoc): string {
  const x = c.createdAt;
  if (x && typeof x === "object" && "toDate" in x && typeof (x as { toDate: () => Date }).toDate === "function") {
    try {
      return fechaColombia((x as { toDate: () => Date }).toDate(), {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "—";
    }
  }
  return "—";
}

function clienteToCsvRow(c: ClientePosFirestoreDoc, pv: string): string[] {
  const nombre = nombreDisplayCliente(c);
  const dc = c.datosComplementarios ?? {};
  const tel = [c.indicativoTelefono, c.telefono].filter(Boolean).join(" ");
  return [
    pv,
    c.tipoCliente,
    nombre,
    c.tipoIdentificacion,
    c.numeroIdentificacion,
    c.digitoVerificacion ?? "",
    c.email ?? "",
    tel,
    dc.direccion ?? "",
    dc.ciudad ?? "",
    (dc.notas ?? "").replace(/\r?\n/g, " "),
    c.id,
    c.createdByUid,
    formatCreatedAt(c),
  ];
}

const CSV_HEADER = [
  "puntoVenta",
  "tipoCliente",
  "nombreDisplay",
  "tipoIdentificacion",
  "numeroIdentificacion",
  "digitoVerificacion",
  "email",
  "telefono",
  "direccion",
  "ciudad",
  "notas",
  "idFirestore",
  "creadoPorUid",
  "creadoEnVista",
];

function descargarCsvClientes(clientes: ClientePosFirestoreDoc[], pv: string): void {
  const rows = [CSV_HEADER, ...clientes.map((c) => clienteToCsvRow(c, pv))];
  const esc = (cell: string) => {
    const t = cell.replace(/"/g, '""');
    return `"${t}"`;
  };
  const blob = new Blob([rows.map((r) => r.map(esc).join(",")).join("\r\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `pos_clientes_${pv.replace(/[^\w-]+/g, "_")}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function ClientesProveedoresFranquiciaPanel({
  puntoVenta,
  uid,
  role,
  onVolver,
}: ClientesProveedoresFranquiciaPanelProps) {
  const pv = (puntoVenta ?? "").replace(/\u00a0/g, " ").trim();
  const u = (uid ?? "").trim();
  const esContador = role === POS_CONTADOR_ROLE;

  const [pestaña, setPestaña] = useState<Pestaña>("clientes");
  const [clientes, setClientes] = useState<ClientePosFirestoreDoc[]>([]);
  const [cargandoClientes, setCargandoClientes] = useState(false);
  const [errorClientes, setErrorClientes] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [modalCliente, setModalCliente] = useState(false);
  const [exportandoSheet, setExportandoSheet] = useState(false);
  const [mensajeSheet, setMensajeSheet] = useState<string | null>(null);

  const [bundleProv, setBundleProv] = useState<CgBundle>({ proveedores: [], movimientos: [] });
  const [nuevoProvNombre, setNuevoProvNombre] = useState("");
  const [nuevoProvNotas, setNuevoProvNotas] = useState("");
  const [msgProv, setMsgProv] = useState<string | null>(null);

  const cargarClientes = useCallback(async () => {
    if (!pv) return;
    setCargandoClientes(true);
    setErrorClientes(null);
    try {
      const rows = await listarClientesPorPuntoVenta(pv, 500);
      setClientes(rows);
    } catch {
      setErrorClientes("No se pudo cargar el listado. Revisá conexión y reglas de Firestore.");
      setClientes([]);
    } finally {
      setCargandoClientes(false);
    }
  }, [pv]);

  useEffect(() => {
    void cargarClientes();
  }, [cargarClientes]);

  const refrescarProveedores = useCallback(() => {
    if (!pv) {
      setBundleProv({ proveedores: [], movimientos: [] });
      return;
    }
    setBundleProv(leerBundleComprasGastos(pv));
  }, [pv]);

  useEffect(() => {
    refrescarProveedores();
  }, [refrescarProveedores, pestaña]);

  const clientesFiltrados = useMemo(
    () => filtrarClientesPorBusqueda(clientes, busqueda),
    [clientes, busqueda]
  );

  const onExportarSheet = useCallback(async () => {
    setMensajeSheet(null);
    setExportandoSheet(true);
    try {
      const token = await auth?.currentUser?.getIdToken();
      if (!token) {
        setMensajeSheet("Sesión vencida: volvé a iniciar sesión.");
        return;
      }
      const res = await fetch("/api/pos_clientes_export_sheet", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as { ok?: boolean; message?: string; filasEscritas?: number };
      if (!json.ok) {
        setMensajeSheet(json.message ?? "No se pudo exportar.");
        return;
      }
      setMensajeSheet(json.message ?? `Se escribieron ${json.filasEscritas ?? 0} filas.`);
    } catch {
      setMensajeSheet("Error de red al exportar.");
    } finally {
      setExportandoSheet(false);
    }
  }, []);

  const onAgregarProv = useCallback(() => {
    if (!pv) return;
    const p = agregarProveedorComprasGastos(pv, nuevoProvNombre, nuevoProvNotas);
    if (!p) {
      setMsgProv("Escribí el nombre del proveedor.");
      return;
    }
    setMsgProv(null);
    setNuevoProvNombre("");
    setNuevoProvNotas("");
    refrescarProveedores();
  }, [pv, nuevoProvNombre, nuevoProvNotas, refrescarProveedores]);

  const onEliminarProv = useCallback(
    (id: string) => {
      if (!pv) return;
      const ok = eliminarProveedorComprasGastos(pv, id);
      if (!ok) {
        setMsgProv("No se puede borrar: hay compras asociadas en Compras y gastos.");
        return;
      }
      setMsgProv(null);
      refrescarProveedores();
    },
    [pv, refrescarProveedores]
  );

  if (!pv) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50/90 p-8 text-center text-amber-950">
        <p className="text-lg font-semibold">Sin punto de venta</p>
        <p className="mt-2 text-sm">Asigná un punto de venta en tu perfil.</p>
        {onVolver ? (
          <button
            type="button"
            onClick={onVolver}
            className="mt-6 rounded-xl border-2 border-amber-300 bg-white px-5 py-2.5 text-sm font-semibold text-amber-900 hover:bg-amber-100"
          >
            Volver
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          {onVolver ? (
            <button
              type="button"
              onClick={onVolver}
              className="mb-3 inline-flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Configuración
            </button>
          ) : null}
          <h2 className="text-2xl font-bold text-gray-900">Clientes y proveedores</h2>
          <p className="mt-1 text-sm text-gray-600">
            Clientes creados desde caja (Firestore) · Proveedores para compras y registro de gastos (misma base que Compras y
            gastos)
          </p>
        </div>
      </header>

      <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-2">
        <button
          type="button"
          onClick={() => setPestaña("clientes")}
          className={`rounded-lg px-4 py-2 text-sm font-semibold ${
            pestaña === "clientes" ? "bg-primary-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          Clientes ({clientes.length})
        </button>
        <button
          type="button"
          onClick={() => setPestaña("proveedores")}
          className={`rounded-lg px-4 py-2 text-sm font-semibold ${
            pestaña === "proveedores" ? "bg-primary-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          Proveedores ({bundleProv.proveedores.length})
        </button>
      </div>

      {pestaña === "clientes" ? (
        <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-gray-600">
              Listado de clientes que los cajeros registran en ventas. Podés exportar a CSV o, si está configurado en el
              servidor, volcar filas a una pestaña de Google Sheets.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void cargarClientes()}
                disabled={cargandoClientes}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50"
              >
                {cargandoClientes ? "Actualizando…" : "Actualizar"}
              </button>
              <button
                type="button"
                onClick={() => setModalCliente(true)}
                disabled={!u || esContador}
                title={esContador ? "Las cuentas de contador no registran clientes en Firestore." : undefined}
                className="rounded-lg bg-primary-600 px-3 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
              >
                Registrar cliente
              </button>
              <button
                type="button"
                onClick={() => descargarCsvClientes(clientes, pv)}
                disabled={clientes.length === 0}
                className="rounded-lg border border-emerald-600 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
              >
                Descargar CSV ({clientes.length})
              </button>
              <button
                type="button"
                onClick={() => void onExportarSheet()}
                disabled={exportandoSheet}
                className="rounded-lg border border-sky-600 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-900 hover:bg-sky-100 disabled:opacity-50"
              >
                {exportandoSheet ? "Exportando…" : "Enviar a Google Sheet"}
              </button>
            </div>
            <p className="w-full text-xs text-gray-500">
              Cada clic en «Enviar a Google Sheet» <strong className="text-gray-700">agrega filas al final</strong> de la pestaña
              (incluye encabezados solo la primera vez). Si exportás varias veces el mismo día, podés duplicar datos: en Sheets
              podés filtrar o deduplicar por la columna <code className="rounded bg-gray-100 px-0.5">idFirestore</code>.
            </p>
          </div>

          {errorClientes ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{errorClientes}</p> : null}
          {mensajeSheet ? (
            <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950">{mensajeSheet}</p>
          ) : null}

          <p className="text-xs text-gray-500">
            <strong className="text-gray-700">Google Sheets:</strong> creá una pestaña (ej.{" "}
            <code className="rounded bg-gray-100 px-1">DB_Pos_Clientes</code>) y compartila con el correo de la cuenta de
            servicio con permiso de <strong>editor</strong>. En Vercel definí{" "}
            <code className="rounded bg-gray-100 px-1">GOOGLE_SHEETS_CLIENTES_RANGE</code> como{" "}
            <code className="rounded bg-gray-100 px-1">{`'DB_Pos_Clientes'!A:P`}</code> (o el nombre de tu pestaña). Opcional:{" "}
            <code className="rounded bg-gray-100 px-1">GOOGLE_SHEETS_CLIENTES_SPREADSHEET_ID</code> si no usás la misma hoja
            que insumos.
          </p>

          <label className="block max-w-md">
            <span className="text-xs font-medium text-gray-600">Buscar</span>
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Nombre, documento, teléfono, correo…"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>

          {cargandoClientes && clientes.length === 0 ? (
            <p className="text-sm text-gray-500">Cargando…</p>
          ) : clientesFiltrados.length === 0 ? (
            <p className="text-sm text-gray-500">No hay clientes que coincidan. Los cajeros pueden crear clientes desde la pantalla de ventas.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-100">
              <table className="w-full min-w-[56rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-xs uppercase text-gray-500">
                    <th className="px-3 py-2">Cliente</th>
                    <th className="px-3 py-2">Identificación</th>
                    <th className="px-3 py-2">Contacto</th>
                    <th className="px-3 py-2">Registro</th>
                    <th className="px-3 py-2">Creado por</th>
                  </tr>
                </thead>
                <tbody>
                  {clientesFiltrados.map((c) => (
                    <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50/80">
                      <td className="px-3 py-2 font-medium text-gray-900">{nombreDisplayCliente(c)}</td>
                      <td className="px-3 py-2 text-gray-700">
                        {c.tipoIdentificacion} {c.numeroIdentificacion}
                        {c.digitoVerificacion ? `-${c.digitoVerificacion}` : ""}
                      </td>
                      <td className="px-3 py-2 text-gray-700">
                        {[c.email, [c.indicativoTelefono, c.telefono].filter(Boolean).join(" ")].filter(Boolean).join(" · ") ||
                          "—"}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-gray-600">{formatCreatedAt(c)}</td>
                      <td className="px-3 py-2 text-gray-600">
                        {c.createdByUid && u && c.createdByUid === u ? (
                          <span className="font-semibold text-primary-700">Tu cuenta</span>
                        ) : (
                          <span className="font-mono text-xs" title={c.createdByUid}>
                            {c.createdByUid ? `…${c.createdByUid.slice(-8)}` : "—"}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-600">
            Base de proveedores del punto de venta. Se usa al registrar <strong>compras</strong> en Compras y gastos. Los datos
            se guardan en este equipo (localStorage).
          </p>
          {msgProv ? <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">{msgProv}</p> : null}
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <label className="block min-w-[12rem] flex-1">
              <span className="text-xs font-medium text-gray-600">Nombre o razón social</span>
              <input
                value={nuevoProvNombre}
                onChange={(e) => setNuevoProvNombre(e.target.value)}
                placeholder="Ej. Carnes del Valle"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block min-w-[10rem] flex-1">
              <span className="text-xs font-medium text-gray-600">Notas (NIT, teléfono…)</span>
              <input
                value={nuevoProvNotas}
                onChange={(e) => setNuevoProvNotas(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <button
              type="button"
              onClick={onAgregarProv}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700"
            >
              Guardar proveedor
            </button>
          </div>
          {bundleProv.proveedores.length === 0 ? (
            <p className="text-sm text-gray-500">Todavía no hay proveedores.</p>
          ) : (
            <ul className="divide-y divide-gray-100 rounded-lg border border-gray-100">
              {bundleProv.proveedores.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span>
                    <span className="font-medium text-gray-900">{p.nombre}</span>
                    {p.notas ? <span className="ml-2 text-gray-500">· {p.notas}</span> : null}
                  </span>
                  <button
                    type="button"
                    onClick={() => onEliminarProv(p.id)}
                    className="text-xs font-semibold text-red-600 hover:underline"
                  >
                    Eliminar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <CrearClientePosModal
        open={modalCliente}
        onClose={() => setModalCliente(false)}
        puntoVenta={pv}
        uid={u}
        onCreado={(doc) => {
          setClientes((prev) => [doc, ...prev.filter((x) => x.id !== doc.id)]);
        }}
      />
    </div>
  );
}
