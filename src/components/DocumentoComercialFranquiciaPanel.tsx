"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { esContadorInvitado } from "@/lib/auth-roles";
import { auth } from "@/lib/firebase";
import {
  actualizarDocumentoComercial,
  crearDocumentoComercial,
  eliminarDocumentoComercial,
  listarDocumentosComerciales,
  type DocumentoComercialFirestoreDoc,
} from "@/lib/documentos-comerciales-firestore";
import { getCatalogoPOS } from "@/lib/catalogo-pos";
import { descargarPdfDocumentoComercial, formatoMonedaCop } from "@/lib/pdf-documento-ventas";
import type { ProductoPOS } from "@/types";

export interface DocumentoComercialFranquiciaPanelProps {
  tipo: "cotizacion" | "remision";
  onVolver: () => void;
}

interface LineaEdicion {
  id: string;
  sku: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
}

function idLinea(): string {
  return `l-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function hoyInput(): string {
  return new Date().toISOString().slice(0, 10);
}

function numeroSugerido(tipo: "cotizacion" | "remision"): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const suf = Math.random().toString(36).slice(2, 6).toUpperCase();
  return tipo === "cotizacion" ? `COT-${y}${m}${day}-${suf}` : `REM-${y}${m}${day}-${suf}`;
}

function lineasFirestoreAEdicion(lineas: DocumentoComercialFirestoreDoc["lineas"]): LineaEdicion[] {
  return lineas.map((l) => ({
    id: idLinea(),
    sku: l.sku,
    descripcion: l.descripcion,
    cantidad: l.cantidad,
    precioUnitario: l.precioUnitario,
  }));
}

function totalLineas(lineas: { cantidad: number; precioUnitario: number }[]): number {
  return lineas.reduce((s, l) => s + Math.max(0, l.cantidad) * l.precioUnitario, 0);
}

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100";

function enriquecerMensajeFirestore(msg: string | undefined): string {
  const m = (msg ?? "").trim();
  if (!m) return "Operación no realizada.";
  if (/permission|permissions|insufficient/i.test(m)) {
    return `${m} Copia el bloque «posDocumentosComerciales» del archivo firestore.rules.example del proyecto en Firebase Console → Firestore → Reglas y pulsa Publicar (las reglas antiguas sin esa colección deniegan lectura y escritura).`;
  }
  return m;
}

export default function DocumentoComercialFranquiciaPanel({
  tipo,
  onVolver,
}: DocumentoComercialFranquiciaPanelProps) {
  const { user } = useAuth();
  const soloContador = user != null && esContadorInvitado(user.role);
  const puntoVenta = user?.puntoVenta?.trim() ?? "";

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [numeroDocumento, setNumeroDocumento] = useState(() => numeroSugerido(tipo));
  const [fecha, setFecha] = useState(hoyInput);
  const [clienteNombre, setClienteNombre] = useState("");
  const [clienteDocumento, setClienteDocumento] = useState("");
  const [clienteTelefono, setClienteTelefono] = useState("");
  const [eventoReferencia, setEventoReferencia] = useState("");
  const [direccionEntrega, setDireccionEntrega] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [lineas, setLineas] = useState<LineaEdicion[]>([]);

  const [lista, setLista] = useState<DocumentoComercialFirestoreDoc[]>([]);
  const [listaLoading, setListaLoading] = useState(true);
  const [listaError, setListaError] = useState<string | null>(null);

  const [catalogo, setCatalogo] = useState<ProductoPOS[]>([]);
  const [catalogoLoading, setCatalogoLoading] = useState(false);
  const [catalogoError, setCatalogoError] = useState<string | null>(null);
  const [pickerAbierto, setPickerAbierto] = useState(false);
  const [busquedaCat, setBusquedaCat] = useState("");

  const [guardando, setGuardando] = useState(false);
  const [generandoPdf, setGenerandoPdf] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [mensajeOk, setMensajeOk] = useState<string | null>(null);

  const titulo = tipo === "cotizacion" ? "Cotizaciones para eventos" : "Remisiones";
  const tituloLista = tipo === "cotizacion" ? "Cotizaciones guardadas" : "Remisiones guardadas";

  const limpiarMensajes = () => {
    setMensaje(null);
    setMensajeOk(null);
  };

  const resetFormularioNuevo = useCallback(() => {
    setEditandoId(null);
    setNumeroDocumento(numeroSugerido(tipo));
    setFecha(hoyInput());
    setClienteNombre("");
    setClienteDocumento("");
    setClienteTelefono("");
    setEventoReferencia("");
    setDireccionEntrega("");
    setObservaciones("");
    setLineas([]);
    limpiarMensajes();
  }, [tipo]);

  const aplicarDocumentoAlFormulario = useCallback((d: DocumentoComercialFirestoreDoc) => {
    setEditandoId(d.id);
    setNumeroDocumento(d.numeroDocumento);
    setFecha(d.fechaIso.length >= 10 ? d.fechaIso.slice(0, 10) : hoyInput());
    setClienteNombre(d.clienteNombre);
    setClienteDocumento(d.clienteDocumento ?? "");
    setClienteTelefono(d.clienteTelefono ?? "");
    setEventoReferencia(d.eventoReferencia ?? "");
    setDireccionEntrega(d.direccionEntrega ?? "");
    setObservaciones(d.observaciones ?? "");
    setLineas(lineasFirestoreAEdicion(d.lineas));
    limpiarMensajes();
  }, []);

  const cargarLista = useCallback(async () => {
    if (!puntoVenta || soloContador) {
      setLista([]);
      setListaLoading(false);
      return;
    }
    setListaLoading(true);
    setListaError(null);
    const res = await listarDocumentosComerciales(puntoVenta, tipo);
    if (res.ok) setLista(res.items);
    else {
      setListaError(enriquecerMensajeFirestore(res.message));
      setLista([]);
    }
    setListaLoading(false);
  }, [puntoVenta, soloContador, tipo]);

  useEffect(() => {
    void cargarLista();
  }, [cargarLista]);

  const cargarCatalogo = useCallback(async () => {
    if (soloContador) return;
    setCatalogoLoading(true);
    setCatalogoError(null);
    try {
      const token = auth?.currentUser ? await auth.currentUser.getIdToken() : null;
      const res = await getCatalogoPOS(token);
      if (res.ok && res.productos) setCatalogo(res.productos);
      else setCatalogoError(res.message ?? "No se pudo cargar el catálogo.");
    } catch {
      setCatalogoError("Error al cargar el catálogo.");
    } finally {
      setCatalogoLoading(false);
    }
  }, [soloContador]);

  useEffect(() => {
    void cargarCatalogo();
  }, [cargarCatalogo]);

  const catalogoFiltrado = useMemo(() => {
    const q = busquedaCat.trim().toLowerCase();
    if (!q) return catalogo;
    return catalogo.filter(
      (p) =>
        p.sku.toLowerCase().includes(q) ||
        (p.descripcion && p.descripcion.toLowerCase().includes(q)) ||
        (p.categoria && p.categoria.toLowerCase().includes(q))
    );
  }, [catalogo, busquedaCat]);

  const agregarProducto = (p: ProductoPOS) => {
    setLineas((prev) => [
      ...prev,
      {
        id: idLinea(),
        sku: p.sku,
        descripcion: p.descripcion,
        cantidad: 1,
        precioUnitario: p.precioUnitario,
      },
    ]);
    setPickerAbierto(false);
    setBusquedaCat("");
    limpiarMensajes();
  };

  const actualizarLinea = (id: string, patch: Partial<Pick<LineaEdicion, "cantidad" | "precioUnitario">>) => {
    setLineas((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  const quitarLinea = (id: string) => {
    setLineas((prev) => prev.filter((l) => l.id !== id));
  };

  const total = useMemo(
    () => lineas.reduce((s, l) => s + Math.max(0, l.cantidad) * l.precioUnitario, 0),
    [lineas]
  );

  const lineasParaGuardar = () =>
    lineas.map((l) => ({
      sku: l.sku,
      descripcion: l.descripcion,
      cantidad: Math.max(0, l.cantidad),
      precioUnitario: l.precioUnitario,
    }));

  const validarAntesDeGuardarOPdf = (): boolean => {
    if (!puntoVenta) {
      setMensaje("Tu usuario necesita punto de venta en Firestore para guardar documentos.");
      return false;
    }
    if (!clienteNombre.trim()) {
      setMensaje("Indica el nombre del cliente o empresa.");
      return false;
    }
    if (lineas.length === 0) {
      setMensaje("Agrega al menos un producto desde el catálogo.");
      return false;
    }
    return true;
  };

  const guardarEnFirestore = async () => {
    limpiarMensajes();
    if (!validarAntesDeGuardarOPdf()) return;
    if (!user?.uid) {
      setMensaje("Sesión no válida.");
      return;
    }
    setGuardando(true);
    try {
      const lineasP = lineasParaGuardar();
      if (editandoId) {
        const r = await actualizarDocumentoComercial(editandoId, {
          numeroDocumento: numeroDocumento.trim() || numeroSugerido(tipo),
          fechaIso: fecha,
          clienteNombre: clienteNombre.trim(),
          clienteDocumento: clienteDocumento.trim() || undefined,
          clienteTelefono: clienteTelefono.trim() || undefined,
          eventoReferencia: tipo === "cotizacion" ? eventoReferencia.trim() || undefined : undefined,
          direccionEntrega: tipo === "remision" ? direccionEntrega.trim() || undefined : undefined,
          observaciones: observaciones.trim() || undefined,
          lineas: lineasP,
        });
        if (!r.ok) {
          setMensaje(enriquecerMensajeFirestore(r.message ?? "No se pudo actualizar."));
          return;
        }
        setMensajeOk("Cambios guardados.");
      } else {
        const r = await crearDocumentoComercial({
          tipo,
          numeroDocumento: numeroDocumento.trim() || numeroSugerido(tipo),
          fechaIso: fecha,
          puntoVenta,
          createdByUid: user.uid,
          clienteNombre: clienteNombre.trim(),
          clienteDocumento: clienteDocumento.trim() || undefined,
          clienteTelefono: clienteTelefono.trim() || undefined,
          eventoReferencia: tipo === "cotizacion" ? eventoReferencia.trim() || undefined : undefined,
          direccionEntrega: tipo === "remision" ? direccionEntrega.trim() || undefined : undefined,
          observaciones: observaciones.trim() || undefined,
          lineas: lineasP,
        });
        if (!r.ok) {
          setMensaje(enriquecerMensajeFirestore(r.message ?? "No se pudo guardar."));
          return;
        }
        setEditandoId(r.id);
        setMensajeOk("Documento guardado. Puedes seguir editando o generar el PDF.");
      }
      await cargarLista();
    } finally {
      setGuardando(false);
    }
  };

  const descargarPdf = async () => {
    limpiarMensajes();
    if (!validarAntesDeGuardarOPdf()) return;
    setGenerandoPdf(true);
    try {
      await descargarPdfDocumentoComercial({
        tipo,
        numeroDocumento: numeroDocumento.trim() || numeroSugerido(tipo),
        fechaIso: fecha,
        puntoVenta: puntoVenta || undefined,
        clienteNombre: clienteNombre.trim(),
        clienteDocumento: clienteDocumento.trim() || undefined,
        clienteTelefono: clienteTelefono.trim() || undefined,
        eventoReferencia: tipo === "cotizacion" ? eventoReferencia.trim() || undefined : undefined,
        direccionEntrega: tipo === "remision" ? direccionEntrega.trim() || undefined : undefined,
        observaciones: observaciones.trim() || undefined,
        lineas: lineasParaGuardar(),
      });
    } catch (e) {
      setMensaje(e instanceof Error ? e.message : "No se pudo generar el PDF.");
    } finally {
      setGenerandoPdf(false);
    }
  };

  const confirmarEliminar = async (id: string, etiqueta: string) => {
    if (!window.confirm(`¿Eliminar ${etiqueta}? Esta acción no se puede deshacer.`)) return;
    setMensaje(null);
    setMensajeOk(null);
    const r = await eliminarDocumentoComercial(id);
    if (!r.ok) {
      setMensaje(enriquecerMensajeFirestore(r.message ?? "No se pudo eliminar."));
      return;
    }
    if (editandoId === id) resetFormularioNuevo();
    setMensajeOk("Eliminado.");
    await cargarLista();
  };

  const abrirParaEditar = (d: DocumentoComercialFirestoreDoc) => {
    aplicarDocumentoAlFormulario(d);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (soloContador) {
    return (
      <div className="mx-auto max-w-2xl pb-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 pb-4">
          <h2 className="text-xl font-bold text-gray-900 md:text-2xl">{titulo}</h2>
          <button
            type="button"
            onClick={onVolver}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            Volver
          </button>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
          <p className="font-medium">Herramienta solo para el franquiciado</p>
          <p className="mt-2 text-amber-900/90">
            Las cotizaciones y remisiones las gestiona el usuario principal del punto de venta. Tu cuenta de contador
            no incluye esta función.
          </p>
        </div>
      </div>
    );
  }

  if (!puntoVenta) {
    return (
      <div className="mx-auto max-w-2xl pb-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 pb-4">
          <h2 className="text-xl font-bold text-primary-600 md:text-2xl">{titulo}</h2>
          <button
            type="button"
            onClick={onVolver}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            Volver
          </button>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
          <p className="font-medium">Falta punto de venta</p>
          <p className="mt-2">
            Asigna un punto de venta a tu usuario (WMS / Firestore) para guardar cotizaciones y remisiones.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl pb-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 pb-4">
        <div>
          <h2 className="text-xl font-bold text-primary-600 md:text-2xl">{titulo}</h2>
          <p className="mt-1 max-w-2xl text-sm text-gray-600">
            {tipo === "cotizacion"
              ? "Guarda cotizaciones, edítalas cuando quieras y descarga PDF con el logo de Maria Chorizos."
              : "Guarda remisiones, edítalas o elimínalas y genera PDF para entregar o archivar."}
          </p>
        </div>
        <button
          type="button"
          onClick={onVolver}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
        >
          Volver
        </button>
      </div>

      <section className="mb-8 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold uppercase tracking-wide text-gray-500">{tituloLista}</h3>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void cargarLista()}
              disabled={listaLoading}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {listaLoading ? "Cargando…" : "Actualizar lista"}
            </button>
            <button
              type="button"
              onClick={resetFormularioNuevo}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              Nueva {tipo === "cotizacion" ? "cotización" : "remisión"}
            </button>
          </div>
        </div>
        {listaError && <p className="mt-2 text-sm text-red-600">{listaError}</p>}
        <div className="mt-3 overflow-x-auto rounded-lg border border-gray-100">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase text-gray-600">
                <th className="px-3 py-2">Número</th>
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {!listaLoading && lista.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-gray-500">
                    No hay documentos guardados aún.
                  </td>
                </tr>
              )}
              {lista.map((d) => {
                const tot = totalLineas(d.lineas);
                const fechaFmt =
                  d.fechaIso.length >= 10
                    ? d.fechaIso.slice(0, 10)
                    : d.fechaIso;
                return (
                  <tr key={d.id} className="border-b border-gray-100 hover:bg-gray-50/80">
                    <td className="px-3 py-2 font-mono text-xs text-gray-900">{d.numeroDocumento}</td>
                    <td className="px-3 py-2 text-gray-800">{d.clienteNombre}</td>
                    <td className="px-3 py-2 text-gray-600">{fechaFmt}</td>
                    <td className="px-3 py-2 text-right font-medium text-gray-900">{formatoMonedaCop(tot)}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => abrirParaEditar(d)}
                          className="text-xs font-semibold text-primary-600 hover:underline"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            void (async () => {
                              setMensaje(null);
                              setMensajeOk(null);
                              setGenerandoPdf(true);
                              try {
                                await descargarPdfDocumentoComercial({
                                  tipo: d.tipo,
                                  numeroDocumento: d.numeroDocumento,
                                  fechaIso: d.fechaIso,
                                  puntoVenta: d.puntoVenta,
                                  clienteNombre: d.clienteNombre,
                                  clienteDocumento: d.clienteDocumento,
                                  clienteTelefono: d.clienteTelefono,
                                  eventoReferencia: d.eventoReferencia,
                                  direccionEntrega: d.direccionEntrega,
                                  observaciones: d.observaciones,
                                  lineas: d.lineas,
                                });
                              } catch {
                                setMensaje("No se pudo generar el PDF.");
                              } finally {
                                setGenerandoPdf(false);
                              }
                            })();
                          }}
                          disabled={generandoPdf}
                          className="text-xs font-semibold text-gray-700 hover:underline disabled:opacity-50"
                        >
                          PDF
                        </button>
                        <button
                          type="button"
                          onClick={() => void confirmarEliminar(d.id, d.numeroDocumento)}
                          className="text-xs font-semibold text-red-600 hover:underline"
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {editandoId && (
          <p className="mt-2 text-xs text-gray-600">
            Editando documento guardado. <button type="button" className="font-semibold text-primary-600 hover:underline" onClick={resetFormularioNuevo}>Cancelar edición</button>
          </p>
        )}
      </section>

      <p className="mb-3 text-sm font-medium text-gray-800">
        {editandoId ? "Editar documento" : "Nuevo documento"}
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-bold uppercase tracking-wide text-gray-500">Documento</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Número</label>
              <input className={inputClass} value={numeroDocumento} onChange={(e) => setNumeroDocumento(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Fecha</label>
              <input type="date" className={inputClass} value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
          </div>
          <div className="mt-3">
            <label className="mb-1 block text-xs font-medium text-gray-600">Cliente o empresa</label>
            <input
              className={inputClass}
              value={clienteNombre}
              onChange={(e) => setClienteNombre(e.target.value)}
              placeholder="Nombre o razón social"
            />
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Documento (NIT / CC)</label>
              <input className={inputClass} value={clienteDocumento} onChange={(e) => setClienteDocumento(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Teléfono</label>
              <input className={inputClass} value={clienteTelefono} onChange={(e) => setClienteTelefono(e.target.value)} />
            </div>
          </div>
          {tipo === "cotizacion" ? (
            <div className="mt-3">
              <label className="mb-1 block text-xs font-medium text-gray-600">Evento o referencia</label>
              <input
                className={inputClass}
                value={eventoReferencia}
                onChange={(e) => setEventoReferencia(e.target.value)}
                placeholder="Ej. Boda 15 de agosto, feria empresa X…"
              />
            </div>
          ) : (
            <div className="mt-3">
              <label className="mb-1 block text-xs font-medium text-gray-600">Dirección de entrega</label>
              <textarea
                className={`${inputClass} min-h-[72px] resize-y`}
                value={direccionEntrega}
                onChange={(e) => setDireccionEntrega(e.target.value)}
                placeholder="Dirección completa de despacho"
              />
            </div>
          )}
          <div className="mt-3">
            <label className="mb-1 block text-xs font-medium text-gray-600">Observaciones</label>
            <textarea
              className={`${inputClass} min-h-[64px] resize-y`}
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Condiciones, plazo de validez, notas al cliente…"
            />
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold uppercase tracking-wide text-gray-500">Productos</h3>
            <button
              type="button"
              onClick={() => {
                setPickerAbierto(true);
                void cargarCatalogo();
              }}
              className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              Agregar desde catálogo
            </button>
          </div>
          {catalogoError && <p className="mt-2 text-xs text-amber-800">{catalogoError}</p>}
          <p className="mt-2 text-xs text-gray-500">
            Los precios vienen del catálogo del WMS; puedes ajustar cantidad y valor unitario en la tabla.
          </p>

          <div className="mt-4 overflow-x-auto rounded-lg border border-gray-100">
            <table className="w-full min-w-[520px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase text-gray-600">
                  <th className="px-2 py-2">Producto</th>
                  <th className="px-2 py-2 w-20">Cant.</th>
                  <th className="px-2 py-2 w-28">V. unit.</th>
                  <th className="px-2 py-2 w-28">Subtotal</th>
                  <th className="px-2 py-2 w-10" />
                </tr>
              </thead>
              <tbody>
                {lineas.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-gray-500">
                      Aún no hay ítems. Usa «Agregar desde catálogo».
                    </td>
                  </tr>
                ) : (
                  lineas.map((l) => {
                    const sub = Math.max(0, l.cantidad) * l.precioUnitario;
                    return (
                      <tr key={l.id} className="border-b border-gray-100">
                        <td className="px-2 py-2">
                          <div className="font-medium text-gray-900">{l.descripcion}</div>
                          <div className="text-xs text-gray-500">SKU {l.sku}</div>
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            min={0}
                            step={1}
                            className={`${inputClass} py-1 text-xs`}
                            value={l.cantidad}
                            onChange={(e) =>
                              actualizarLinea(l.id, { cantidad: Math.max(0, parseInt(e.target.value, 10) || 0) })
                            }
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            min={0}
                            step={100}
                            className={`${inputClass} py-1 text-xs`}
                            value={l.precioUnitario}
                            onChange={(e) =>
                              actualizarLinea(l.id, {
                                precioUnitario: Math.max(0, parseFloat(e.target.value) || 0),
                              })
                            }
                          />
                        </td>
                        <td className="px-2 py-2 text-gray-800">{formatoMonedaCop(sub)}</td>
                        <td className="px-2 py-2">
                          <button
                            type="button"
                            onClick={() => quitarLinea(l.id)}
                            className="text-xs font-semibold text-red-600 hover:underline"
                          >
                            Quitar
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3">
            <span className="text-sm font-semibold text-gray-700">Total estimado</span>
            <span className="text-lg font-bold text-emerald-700">{formatoMonedaCop(total)}</span>
          </div>
        </section>
      </div>

      {mensaje && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800" role="alert">
          {mensaje}
        </p>
      )}
      {mensajeOk && (
        <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-900">
          {mensajeOk}
        </p>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={guardando}
          onClick={() => void guardarEnFirestore()}
          className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-md hover:bg-blue-700 disabled:opacity-50"
        >
          {guardando ? "Guardando…" : editandoId ? "Guardar cambios" : "Guardar en la nube"}
        </button>
        <button
          type="button"
          disabled={generandoPdf}
          onClick={() => void descargarPdf()}
          className="rounded-xl bg-primary-600 px-6 py-3 text-sm font-bold text-white shadow-md hover:bg-primary-700 disabled:opacity-50"
        >
          {generandoPdf ? "Generando PDF…" : "Descargar PDF"}
        </button>
      </div>

      {pickerAbierto && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Cerrar"
            onClick={() => setPickerAbierto(false)}
          />
          <div className="relative flex max-h-[min(85vh,640px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <h4 className="font-bold text-gray-900">Catálogo de productos</h4>
              <button
                type="button"
                onClick={() => setPickerAbierto(false)}
                className="rounded p-1 text-gray-500 hover:bg-gray-100"
              >
                ✕
              </button>
            </div>
            <div className="border-b border-gray-100 px-4 py-2">
              <input
                className={inputClass}
                placeholder="Buscar por SKU, nombre o categoría…"
                value={busquedaCat}
                onChange={(e) => setBusquedaCat(e.target.value)}
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {catalogoLoading ? (
                <p className="p-4 text-center text-sm text-gray-500">Cargando catálogo…</p>
              ) : (
                <ul className="space-y-1">
                  {catalogoFiltrado.map((p) => (
                    <li key={p.sku}>
                      <button
                        type="button"
                        onClick={() => agregarProducto(p)}
                        className="flex w-full flex-col items-start rounded-lg border border-transparent px-3 py-2 text-left hover:border-emerald-200 hover:bg-emerald-50/60"
                      >
                        <span className="font-medium text-gray-900">{p.descripcion}</span>
                        <span className="text-xs text-gray-600">
                          {p.sku}
                          {p.categoria ? ` · ${p.categoria}` : ""} · {formatoMonedaCop(p.precioUnitario)}
                          {p.unidad ? ` / ${p.unidad}` : ""}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {!catalogoLoading && catalogoFiltrado.length === 0 && (
                <p className="p-4 text-center text-sm text-gray-500">No hay resultados.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
