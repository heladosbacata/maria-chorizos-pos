"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { auth } from "@/lib/firebase";
import { getCatalogoPOS } from "@/lib/catalogo-pos";
import { enviarReporteVenta } from "@/lib/enviar-venta";
import type { EnvioEstado } from "@/lib/enviar-venta";
import type { ProductoPOS } from "@/types";

const FOTO_PERFIL_KEY = "pos-cajero-foto";

function formatFechaHoy(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface PrecuentaTab {
  id: string;
  nombre: string;
}

const initialPrecuentaDatos = (): Record<string, { valorVenta: string; estado: EnvioEstado; mensaje: string }> => ({
  "1": { valorVenta: "", estado: "idle", mensaje: "" },
});

type ModuloActivo = "ventas" | "turnos" | "reportes" | "mas";

export default function CajaPage() {
  const { user, signOut, loading } = useAuth();
  const router = useRouter();
  const [moduloActivo, setModuloActivo] = useState<ModuloActivo>("ventas");
  const [precuentas, setPrecuentas] = useState<PrecuentaTab[]>([
    { id: "1", nombre: "Nueva pre-cuenta" },
  ]);
  const [activePrecuentaId, setActivePrecuentaId] = useState("1");
  const [precuentaDatos, setPrecuentaDatos] = useState(initialPrecuentaDatos);
  const [turnoAbierto, setTurnoAbierto] = useState(true);
  const [fotoPerfil, setFotoPerfil] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(FOTO_PERFIL_KEY);
  });
  const [showModalAgradecimiento, setShowModalAgradecimiento] = useState(false);
  const inputFotoRef = useRef<HTMLInputElement>(null);
  const [catalogoProductos, setCatalogoProductos] = useState<ProductoPOS[]>([]);
  const [catalogoLoading, setCatalogoLoading] = useState(false);
  const [catalogoError, setCatalogoError] = useState<string | null>(null);
  const [busquedaCatalogo, setBusquedaCatalogo] = useState("");

  useEffect(() => {
    if (moduloActivo !== "ventas") return;
    let cancelled = false;
    setCatalogoLoading(true);
    setCatalogoError(null);
    const tokenPromise = auth?.currentUser ? auth.currentUser.getIdToken() : Promise.resolve(null);
    tokenPromise
      .then((token) => getCatalogoPOS(token))
      .then((res) => {
        if (cancelled) return;
        if (res.ok && res.productos) setCatalogoProductos(res.productos);
        else setCatalogoError(res.message ?? "No se pudo cargar el catálogo");
      })
      .catch(() => {
        if (!cancelled) setCatalogoError("Error al cargar el catálogo");
      })
      .finally(() => {
        if (!cancelled) setCatalogoLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [moduloActivo]);

  const catalogosFiltrados = useMemo(() => {
    const q = busquedaCatalogo.trim().toLowerCase();
    if (!q) return catalogoProductos;
    return catalogoProductos.filter(
      (p) =>
        p.sku.toLowerCase().includes(q) ||
        (p.descripcion && p.descripcion.toLowerCase().includes(q)) ||
        (p.categoria && p.categoria.toLowerCase().includes(q))
    );
  }, [catalogoProductos, busquedaCatalogo]);

  const activeDatos = precuentaDatos[activePrecuentaId] ?? {
    valorVenta: "",
    estado: "idle" as EnvioEstado,
    mensaje: "",
  };

  const handleEnviar = async () => {
    const valorVentaStr = activeDatos.valorVenta;
    const valor = parseFloat(valorVentaStr.replace(/,/g, "."));
    if (isNaN(valor) || valor < 0) {
      setPrecuentaDatos((prev) => ({
        ...prev,
        [activePrecuentaId]: { ...prev[activePrecuentaId], estado: "error", mensaje: "Ingresa un valor numérico válido" },
      }));
      return;
    }

    if (!user?.puntoVenta) {
      setPrecuentaDatos((prev) => ({
        ...prev,
        [activePrecuentaId]: { ...prev[activePrecuentaId], estado: "error", mensaje: "No hay punto de venta seleccionado" },
      }));
      return;
    }

    setPrecuentaDatos((prev) => ({
      ...prev,
      [activePrecuentaId]: { ...prev[activePrecuentaId], estado: "enviando", mensaje: "" },
    }));

    const resultado = await enviarReporteVenta({
      fecha: formatFechaHoy(),
      uen: "Maria Chorizos",
      ventas: [{ puntoVenta: user.puntoVenta, valorVenta: valor }],
    });

    setPrecuentaDatos((prev) => ({
      ...prev,
      [activePrecuentaId]: {
        ...prev[activePrecuentaId],
        estado: resultado.estado,
        mensaje: resultado.mensaje ?? "",
      },
    }));
  };

  const agregarPrecuenta = () => {
    const nextNum = precuentas.length + 1;
    const id = String(Date.now());
    setPrecuentas((prev) => [...prev, { id, nombre: `Pre-cuenta ${nextNum}` }]);
    setPrecuentaDatos((prev) => ({
      ...prev,
      [id]: { valorVenta: "", estado: "idle", mensaje: "" },
    }));
    setActivePrecuentaId(id);
  };

  const cerrarPrecuenta = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (precuentas.length <= 1) return;
    const idx = precuentas.findIndex((p) => p.id === id);
    if (idx < 0) return;
    const next = precuentas.filter((p) => p.id !== id);
    setPrecuentas(next);
    setPrecuentaDatos((prev) => {
      const nextData = { ...prev };
      delete nextData[id];
      return nextData;
    });
    if (activePrecuentaId === id) {
      setActivePrecuentaId(next[idx === 0 ? 1 : idx - 1]!.id);
    }
  };

  const handleCerrarSesion = async () => {
    await signOut();
    router.replace("/");
  };

  const inicialesCajero = user?.email
    ? user.email
        .split("@")[0]
        .replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ]/g, "")
        .slice(0, 2)
        .toUpperCase() || "CA"
    : "CA";

  const handleCambiarFoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file?.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setFotoPerfil(dataUrl);
      try {
        localStorage.setItem(FOTO_PERFIL_KEY, dataUrl);
      } catch {
        // quota or disabled
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const abrirModalPerfil = () => setShowModalAgradecimiento(true);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100/90">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    router.replace("/");
    return null;
  }

  const fechaHoy = formatFechaHoy();
  const fechaFormateada = new Date().toLocaleDateString("es-CO", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const tituloModulo =
    moduloActivo === "ventas"
      ? "Ventas e ingresos"
      : moduloActivo === "turnos"
        ? "Turnos"
        : moduloActivo === "reportes"
          ? "Reportes"
          : "Más";

  return (
    <div className="flex min-h-screen bg-gray-100/90">
      {/* Sidebar izquierdo */}
      <aside className="fixed left-0 top-0 z-10 flex w-52 flex-col border-r border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col items-center gap-1 border-b border-gray-100 bg-white px-3 py-4">
          <Image
            src="/images/logo-red-bg.png"
            alt="Maria Chorizos"
            width={140}
            height={50}
            className="h-10 w-auto object-contain"
          />
          <span className="text-xs font-medium text-primary-600">POS</span>
        </div>
        <nav className="flex-1 space-y-0.5 p-2">
          <button
            type="button"
            onClick={() => setModuloActivo("ventas")}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
              moduloActivo === "ventas" ? "bg-primary-50 text-primary-600" : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Ventas e ingresos
          </button>
          <button
            type="button"
            onClick={() => setModuloActivo("turnos")}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
              moduloActivo === "turnos" ? "bg-primary-50 text-primary-600" : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Turnos
          </button>
          <button
            type="button"
            onClick={() => setModuloActivo("reportes")}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
              moduloActivo === "reportes" ? "bg-primary-50 text-primary-600" : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Reportes
          </button>
          <button
            type="button"
            onClick={() => setModuloActivo("mas")}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
              moduloActivo === "mas" ? "bg-primary-50 text-primary-600" : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            Más
          </button>
        </nav>
        <div className="border-t border-gray-100 p-2">
          {/* Estado del turno */}
          <button
            type="button"
            onClick={() => setTurnoAbierto((v) => !v)}
            className={`mb-3 flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors hover:opacity-90 ${
              turnoAbierto
                ? "border-emerald-200 bg-emerald-50"
                : "border-red-200 bg-red-50"
            }`}
            title={turnoAbierto ? "Clic para marcar turno cerrado" : "Clic para marcar turno abierto"}
          >
            {turnoAbierto ? (
              <>
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </span>
                <span className="text-sm font-semibold text-emerald-800">Turno abierto</span>
              </>
            ) : (
              <>
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-red-500 text-white shadow-sm">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </span>
                <span className="text-sm font-semibold text-red-800">Turno cerrado</span>
              </>
            )}
          </button>
          {/* Perfil del cajero */}
          <div className="mb-3 flex flex-col items-center gap-2">
            <input
              ref={inputFotoRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleCambiarFoto}
              aria-label="Cambiar foto de perfil"
            />
            <button
              type="button"
              onClick={abrirModalPerfil}
              className="group relative flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-gray-200 bg-gray-100 ring-2 ring-white shadow-md transition-all hover:border-primary-300 hover:ring-primary-100 focus:outline-none focus:ring-2 focus:ring-primary-400"
              title="Ver mensaje de agradecimiento"
            >
              {fotoPerfil ? (
                <img
                  src={fotoPerfil}
                  alt="Foto del cajero"
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-lg font-bold text-primary-600">
                  {inicialesCajero}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => inputFotoRef.current?.click()}
              className="text-xs font-medium text-primary-600 hover:text-primary-700 hover:underline"
            >
              Cambiar foto
            </button>
            <button
              type="button"
              onClick={abrirModalPerfil}
              className="rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 text-sm font-medium text-primary-700 transition-colors hover:bg-primary-100"
            >
              Perfil del usuario
            </button>
          </div>
          <button
            onClick={handleCerrarSesion}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Modal de agradecimiento */}
      {showModalAgradecimiento && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-agradecimiento-title"
        >
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowModalAgradecimiento(false)}
            aria-hidden="true"
          />
          <div className="relative max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-2xl">
            <div className="mb-6 flex justify-center">
              <span className="flex h-20 w-20 overflow-hidden rounded-full border-2 border-primary-200 bg-primary-50 shadow-inner">
                {fotoPerfil ? (
                  <img
                    src={fotoPerfil}
                    alt="Foto del cajero"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-2xl font-bold text-primary-600">
                    {inicialesCajero}
                  </span>
                )}
              </span>
            </div>
            <h2 id="modal-agradecimiento-title" className="mb-2 text-center text-xl font-bold text-gray-900">
              Gracias por tu labor
            </h2>
            <p className="mb-6 text-center text-gray-600">
              En Maria Chorizos conocemos tu amor por lo que haces.
            </p>
            <button
              type="button"
              onClick={() => setShowModalAgradecimiento(false)}
              className="w-full rounded-xl bg-brand-yellow py-3 font-semibold text-gray-900 transition-all hover:opacity-90"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* Área central: contenido según módulo activo */}
      <main className="flex-1 pl-52 pt-0">
        <div className="p-6">
          {moduloActivo === "ventas" ? (
            <div className="space-y-6">
              {/* Pestaña de pre-cuenta: herramienta encima del catálogo */}
              <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-gray-100 pb-4">
                  <span className="text-sm font-medium text-gray-500">Pre-cuenta activa:</span>
                  {precuentas.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setActivePrecuentaId(p.id)}
                      className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                        activePrecuentaId === p.id
                          ? "border-brand-yellow bg-brand-yellow/20 text-gray-900"
                          : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      {p.nombre}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={agregarPrecuenta}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-dashed border-gray-300 text-gray-500 hover:border-brand-yellow hover:text-gray-700"
                    aria-label="Nueva pre-cuenta"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                </div>
                <h2 className="mb-4 text-lg font-semibold text-gray-800">
                  Valor de venta del día — {precuentas.find((p) => p.id === activePrecuentaId)?.nombre}
                </h2>
                <input
                  id="valorVenta"
                  type="text"
                  inputMode="decimal"
                  value={activeDatos.valorVenta}
                  onChange={(e) =>
                    setPrecuentaDatos((prev) => ({
                      ...prev,
                      [activePrecuentaId]: {
                        ...(prev[activePrecuentaId] ?? { valorVenta: "", estado: "idle" as EnvioEstado, mensaje: "" }),
                        valorVenta: e.target.value,
                      },
                    }))
                  }
                  placeholder="0"
                  className="mb-4 w-full rounded-xl border-2 border-gray-200 px-4 py-4 text-3xl font-bold text-gray-900 placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100 md:text-4xl"
                  disabled={activeDatos.estado === "enviando"}
                />
                <button
                  onClick={handleEnviar}
                  disabled={activeDatos.estado === "enviando"}
                  className="w-full rounded-xl bg-brand-yellow px-6 py-4 text-lg font-semibold text-gray-900 shadow-md transition-all hover:opacity-90 disabled:opacity-50"
                >
                  {activeDatos.estado === "enviando" ? "Enviando..." : "Enviar reporte"}
                </button>
                {activeDatos.estado !== "idle" && (
                  <div
                    className={`mt-4 rounded-lg p-3 text-sm ${
                      activeDatos.estado === "exito"
                        ? "bg-green-50 text-green-800"
                        : activeDatos.estado === "error"
                          ? "bg-red-50 text-red-800"
                          : "bg-gray-50 text-gray-700"
                    }`}
                  >
                    {activeDatos.estado === "exito" && <span className="mr-2">✓</span>}
                    {activeDatos.estado === "error" && <span className="mr-2">✕</span>}
                    {activeDatos.mensaje}
                  </div>
                )}
              </div>

              {/* Catálogo de productos desde WMS (debajo de la pre-cuenta) */}
              <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                <h2 className="mb-3 text-lg font-semibold text-gray-800">Catálogo de productos</h2>
                <p className="mb-4 text-sm text-gray-500">
                  Productos disponibles para venta (origen: WMS — Productos POS)
                </p>
                <input
                  type="text"
                  value={busquedaCatalogo}
                  onChange={(e) => setBusquedaCatalogo(e.target.value)}
                  placeholder="Buscar por código, descripción o categoría..."
                  className="mb-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
                {catalogoLoading && (
                  <div className="flex justify-center py-8">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
                  </div>
                )}
                {catalogoError && (
                  <div className="rounded-lg border border-brand-yellow/40 bg-brand-yellow/10 p-4 text-sm text-gray-700">
                    <p className="font-medium">{catalogoError}</p>
                    <p className="mt-1 text-gray-600">Puedes usar el reporte de venta del día aquí arriba.</p>
                  </div>
                )}
                {!catalogoLoading && !catalogoError && (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {catalogosFiltrados.map((p) => (
                      <div
                        key={p.sku}
                        className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-gray-50/50 transition-shadow hover:shadow-md"
                      >
                        <div className="relative aspect-square w-full bg-gray-200">
                          {p.urlImagen ? (
                            <img
                              src={p.urlImagen}
                              alt={p.descripcion}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-4xl text-gray-400">
                              —
                            </div>
                          )}
                        </div>
                        <div className="flex flex-1 flex-col p-3">
                          <span className="text-xs font-medium text-gray-500">{p.sku}</span>
                          <p className="mt-0.5 line-clamp-2 text-sm font-medium text-gray-900">
                            {p.descripcion}
                          </p>
                          {p.categoria && (
                            <p className="mt-0.5 text-xs text-gray-500">{p.categoria}</p>
                          )}
                          <p className="mt-2 text-base font-semibold text-primary-600">
                            ${Number(p.precioUnitario).toLocaleString("es-CO")}
                            {p.unidad ? ` / ${p.unidad}` : ""}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {!catalogoLoading && !catalogoError && catalogosFiltrados.length === 0 && (
                  <p className="py-6 text-center text-sm text-gray-500">
                    {busquedaCatalogo.trim() ? "No hay productos que coincidan con la búsqueda." : "No hay productos en el catálogo."}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
              <p className="text-center text-gray-500">
                Módulo <strong>{tituloModulo}</strong>. Contenido en desarrollo.
              </p>
            </div>
          )}
        </div>
      </main>

      {/* Sidebar derecho */}
      <aside className="hidden w-72 flex-shrink-0 border-l border-gray-200 bg-white p-4 lg:block">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Punto de venta</label>
            <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm font-medium text-gray-900">{user.puntoVenta}</p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Fecha</label>
            <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm capitalize text-gray-900">{fechaFormateada}</p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Fecha del reporte</label>
            <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-900">{fechaHoy}</p>
          </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 text-center">
            <svg className="mx-auto mb-2 h-10 w-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0119 9.586V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm text-gray-500">El reporte se envía al WMS para registro centralizado.</p>
          </div>
        </div>
      </aside>

      {/* Botón flotante Chat — verde tipo WhatsApp */}
      <Link
        href="/chat"
        className="fixed bottom-6 right-6 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg transition-transform hover:scale-110 hover:shadow-xl"
        aria-label="Abrir chat"
      >
        <svg className="h-7 w-7" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
      </Link>
    </div>
  );
}
