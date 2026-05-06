"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { auth } from "@/lib/firebase";
import { getCatalogoPOS } from "@/lib/catalogo-pos";
import { solicitarCambioPrecioProductoPos } from "@/lib/pos-solicitud-cambio-precio";
import { solicitarNuevoProductoPos } from "@/lib/pos-solicitud-nuevo-producto";
import type { ProductoPOS } from "@/types";

export interface ProductosServiciosFranquiciaPanelProps {
  puntoVenta: string | null;
  onVolver?: () => void;
}

export default function ProductosServiciosFranquiciaPanel({
  puntoVenta,
  onVolver,
}: ProductosServiciosFranquiciaPanelProps) {
  const [catalogo, setCatalogo] = useState<ProductoPOS[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorCatalogo, setErrorCatalogo] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [productoSolicitud, setProductoSolicitud] = useState<ProductoPOS | null>(null);
  const [precioSolicitado, setPrecioSolicitado] = useState("");
  const [motivo, setMotivo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [mensajeOk, setMensajeOk] = useState<string | null>(null);
  const [mensajeError, setMensajeError] = useState<string | null>(null);
  const [modalNuevoProductoOpen, setModalNuevoProductoOpen] = useState(false);
  const [nuevoSkuSugerido, setNuevoSkuSugerido] = useState("");
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevoCategoria, setNuevoCategoria] = useState("");
  const [nuevoPrecioSugerido, setNuevoPrecioSugerido] = useState("");
  const [nuevoUnidad, setNuevoUnidad] = useState("");
  const [nuevoDescripcion, setNuevoDescripcion] = useState("");
  const [nuevoJustificacion, setNuevoJustificacion] = useState("");

  const cargarCatalogo = useCallback(async () => {
    setLoading(true);
    setErrorCatalogo(null);
    try {
      const token = await auth?.currentUser?.getIdToken().catch(() => null);
      const res = await getCatalogoPOS(token, puntoVenta, { forceRefresh: true });
      if (!res.ok) {
        setErrorCatalogo(res.message ?? "No se pudo cargar el catálogo.");
        setCatalogo([]);
        return;
      }
      const prev = new Set(catalogo.map((p) => p.sku));
      const next = res.productos ?? [];
      setCatalogo(next);
      const nuevos = next.filter((p) => !prev.has(p.sku));
      const overrides = next.filter((p) => p.precioPersonalizado);
      if (prev.size > 0 && (nuevos.length > 0 || overrides.length > 0)) {
        setMensajeOk(
          `Catálogo actualizado. Nuevos productos detectados: ${nuevos.length}. Productos con precio autorizado: ${overrides.length}.`
        );
      }
    } catch {
      setErrorCatalogo("Error al cargar el catálogo.");
      setCatalogo([]);
    } finally {
      setLoading(false);
    }
  }, [catalogo, puntoVenta]);

  useEffect(() => {
    void cargarCatalogo();
  }, [cargarCatalogo]);

  const catalogoFiltrado = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return catalogo;
    return catalogo.filter(
      (p) =>
        p.sku.toLowerCase().includes(q) ||
        p.descripcion.toLowerCase().includes(q) ||
        (p.categoria?.toLowerCase().includes(q) ?? false)
    );
  }, [catalogo, busqueda]);

  const abrirModal = useCallback((producto: ProductoPOS) => {
    setProductoSolicitud(producto);
    setPrecioSolicitado(producto.precioUnitario > 0 ? String(producto.precioUnitario) : "");
    setMotivo("");
    setDescripcion("");
    setMensajeError(null);
  }, []);

  const cerrarModal = useCallback(() => {
    if (enviando) return;
    setProductoSolicitud(null);
    setPrecioSolicitado("");
    setMotivo("");
    setDescripcion("");
    setMensajeError(null);
  }, [enviando]);

  const enviarSolicitud = useCallback(async () => {
    if (!productoSolicitud) return;
    setMensajeError(null);
    setMensajeOk(null);
    const precio = parseFloat(precioSolicitado.replace(/,/g, "."));
    if (!Number.isFinite(precio) || precio <= 0) {
      setMensajeError("El precio solicitado debe ser mayor a 0.");
      return;
    }
    if (!motivo.trim()) {
      setMensajeError("El motivo es obligatorio.");
      return;
    }
    const token = await auth?.currentUser?.getIdToken().catch(() => null);
    if (!token) {
      setMensajeError("No se pudo validar tu sesión. Inicia sesión nuevamente.");
      return;
    }
    setEnviando(true);
    const res = await solicitarCambioPrecioProductoPos(
      {
        skuBarcode: productoSolicitud.sku,
        precioSolicitado: precio,
        motivo: motivo.trim(),
        descripcion: descripcion.trim() || undefined,
      },
      token
    );
    setEnviando(false);
    if (!res.ok) {
      setMensajeError(res.message ?? "No se pudo enviar la solicitud.");
      return;
    }
    setMensajeOk(`${res.message ?? "Solicitud enviada correctamente."}${res.idSolicitud ? ` Código: ${res.idSolicitud}.` : ""}`);
    setProductoSolicitud(null);
    setPrecioSolicitado("");
    setMotivo("");
    setDescripcion("");
  }, [descripcion, motivo, precioSolicitado, productoSolicitud]);

  const limpiarFormularioNuevoProducto = useCallback(() => {
    setNuevoSkuSugerido("");
    setNuevoNombre("");
    setNuevoCategoria("");
    setNuevoPrecioSugerido("");
    setNuevoUnidad("");
    setNuevoDescripcion("");
    setNuevoJustificacion("");
  }, []);

  const enviarSolicitudNuevoProducto = useCallback(async () => {
    setMensajeError(null);
    setMensajeOk(null);
    const token = await auth?.currentUser?.getIdToken().catch(() => null);
    if (!token) {
      setMensajeError("No se pudo validar tu sesión. Inicia sesión nuevamente.");
      return;
    }
    const precio = parseFloat(nuevoPrecioSugerido.replace(/,/g, "."));
    const res = await solicitarNuevoProductoPos(
      {
        skuSugerido: nuevoSkuSugerido.trim(),
        nombreProducto: nuevoNombre.trim(),
        categoria: nuevoCategoria.trim(),
        precioSugerido: precio,
        unidad: nuevoUnidad.trim(),
        descripcion: nuevoDescripcion.trim(),
        justificacion: nuevoJustificacion.trim(),
      },
      token
    );
    if (!res.ok) {
      setMensajeError(res.message ?? "No se pudo enviar la solicitud de nuevo producto.");
      return;
    }
    setMensajeOk(
      `${res.message ?? "Solicitud de nuevo producto enviada."}${res.idSolicitud ? ` Código: ${res.idSolicitud}.` : ""}`
    );
    setModalNuevoProductoOpen(false);
    limpiarFormularioNuevoProducto();
  }, [
    limpiarFormularioNuevoProducto,
    nuevoCategoria,
    nuevoDescripcion,
    nuevoJustificacion,
    nuevoNombre,
    nuevoPrecioSugerido,
    nuevoSkuSugerido,
    nuevoUnidad,
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {onVolver ? (
        <button
          type="button"
          onClick={onVolver}
          className="inline-flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Configuración
        </button>
      ) : null}

      <div
        role="alert"
        className="rounded-2xl border-2 border-amber-300 bg-gradient-to-b from-amber-50 to-orange-50/90 p-6 shadow-sm ring-1 ring-amber-200/60"
      >
        <h3 className="text-lg font-bold text-amber-950">Productos y servicios</h3>
        <p className="mt-2 text-sm leading-relaxed text-amber-950/90">
          La creación de nuevos productos se realiza por el flujo autorizado de la marca. Desde aquí puedes solicitar cambio de
          precio para productos existentes.
        </p>
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setModalNuevoProductoOpen(true)}
            className="rounded-lg border border-amber-600 bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-200"
          >
            Solicitar crear nuevo producto
          </button>
        </div>
      </div>

      {mensajeOk ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {mensajeOk}
        </div>
      ) : null}
      {mensajeError ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">{mensajeError}</div>
      ) : null}

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h4 className="text-base font-semibold text-gray-900">Listado de productos del POS</h4>
          <button
            type="button"
            onClick={() => void cargarCatalogo()}
            disabled={loading}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {loading ? "Actualizando..." : "Actualizar precios"}
          </button>
        </div>
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por SKU, descripción o categoría..."
          className="mb-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
        />

        {loading ? <p className="py-6 text-center text-sm text-gray-500">Cargando catálogo...</p> : null}
        {errorCatalogo ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">{errorCatalogo}</div>
        ) : null}

        {!loading && !errorCatalogo ? (
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase text-gray-600">
                <tr>
                  <th className="px-3 py-2">SKU</th>
                  <th className="px-3 py-2">Descripción</th>
                  <th className="px-3 py-2 text-right">Precio actual</th>
                  <th className="px-3 py-2">Estado</th>
                  <th className="px-3 py-2 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {catalogoFiltrado.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-sm text-gray-500">
                      {busqueda.trim() ? "No hay productos que coincidan con la búsqueda." : "No hay productos para mostrar."}
                    </td>
                  </tr>
                ) : (
                  catalogoFiltrado.map((p) => (
                    <tr key={p.sku} className="hover:bg-gray-50/80">
                      <td className="px-3 py-2 font-mono text-xs text-gray-700">{p.sku}</td>
                      <td className="px-3 py-2 text-gray-900">{p.descripcion}</td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums text-gray-900">
                        ${Number(p.precioUnitario).toLocaleString("es-CO")}
                      </td>
                      <td className="px-3 py-2">
                        {p.precioPersonalizado ? (
                          <span className="inline-flex rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                            Precio autorizado
                          </span>
                        ) : (
                          <span className="text-xs text-gray-500">Precio base</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => abrirModal(p)}
                          className="rounded-lg border border-primary-300 bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-800 hover:bg-primary-100"
                        >
                          Solicitar cambio
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : null}
        <p className="mt-3 text-xs text-gray-600">
          Verificación: cuando WMS apruebe un cambio de precio o agregue un producto, presiona <strong>Actualizar precios</strong>
          para reflejarlo en POS.
        </p>
      </section>

      {productoSolicitud ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-black/45"
            aria-label="Cerrar"
            disabled={enviando}
            onClick={cerrarModal}
          />
          <div className="relative z-[1] w-full max-w-lg rounded-xl border border-gray-200 bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">Solicitar cambio de precio</h3>
            <p className="mt-1 text-sm text-gray-600">
              <span className="font-mono text-xs text-gray-700">{productoSolicitud.sku}</span> - {productoSolicitud.descripcion}
            </p>
            <p className="mt-1 text-sm text-gray-700">
              Precio actual:{" "}
              <span className="font-semibold tabular-nums">${Number(productoSolicitud.precioUnitario).toLocaleString("es-CO")}</span>
            </p>

            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-700">Precio solicitado</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={precioSolicitado}
                  onChange={(e) => setPrecioSolicitado(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-700">Motivo</span>
                <input
                  type="text"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-700">Descripción (opcional)</span>
                <textarea
                  rows={3}
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
              </label>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={enviando}
                onClick={cerrarModal}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={enviando}
                onClick={() => void enviarSolicitud()}
                className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {enviando ? "Enviando..." : "Enviar solicitud"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {modalNuevoProductoOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-black/45"
            aria-label="Cerrar"
            onClick={() => setModalNuevoProductoOpen(false)}
          />
          <div className="relative z-[1] w-full max-w-2xl rounded-xl border border-gray-200 bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">Solicitud de nuevo producto para autorización</h3>
            <p className="mt-1 text-sm text-gray-600">
              Completa toda la información para enviar la solicitud al flujo de aprobación en WMS.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-700">SKU sugerido</span>
                <input
                  type="text"
                  value={nuevoSkuSugerido}
                  onChange={(e) => setNuevoSkuSugerido(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-700">Nombre del producto</span>
                <input
                  type="text"
                  value={nuevoNombre}
                  onChange={(e) => setNuevoNombre(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-700">Categoría</span>
                <input
                  type="text"
                  value={nuevoCategoria}
                  onChange={(e) => setNuevoCategoria(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-700">Unidad (ej: unidad, paquete)</span>
                <input
                  type="text"
                  value={nuevoUnidad}
                  onChange={(e) => setNuevoUnidad(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
              </label>
              <label className="block md:col-span-2">
                <span className="mb-1 block text-xs font-medium text-gray-700">Precio sugerido</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={nuevoPrecioSugerido}
                  onChange={(e) => setNuevoPrecioSugerido(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
              </label>
              <label className="block md:col-span-2">
                <span className="mb-1 block text-xs font-medium text-gray-700">Descripción comercial</span>
                <textarea
                  rows={3}
                  value={nuevoDescripcion}
                  onChange={(e) => setNuevoDescripcion(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
              </label>
              <label className="block md:col-span-2">
                <span className="mb-1 block text-xs font-medium text-gray-700">Justificación para autorización</span>
                <textarea
                  rows={4}
                  value={nuevoJustificacion}
                  onChange={(e) => setNuevoJustificacion(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalNuevoProductoOpen(false)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void enviarSolicitudNuevoProducto()}
                className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700"
              >
                Enviar solicitud
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
