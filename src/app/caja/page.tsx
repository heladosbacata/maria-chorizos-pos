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

/** Ítem en la cuenta a cobrar (panel derecho) */
export interface ItemCuenta {
  producto: ProductoPOS;
  cantidad: number;
}

type ModuloActivo = "ventas" | "turnos" | "reportes" | "mas";

/** Tipo de comprobante para la cuenta a cobrar */
type TipoComprobante = "documento_interno" | "factura_electronica";

export default function CajaPage() {
  const { user, signOut, loading } = useAuth();
  const router = useRouter();
  const [moduloActivo, setModuloActivo] = useState<ModuloActivo>("ventas");
  const [precuentas, setPrecuentas] = useState<PrecuentaTab[]>([
    { id: "1", nombre: "Nueva pre-cuenta" },
  ]);
  const [activePrecuentaId, setActivePrecuentaId] = useState("1");
  const [precuentaDatos, setPrecuentaDatos] = useState(initialPrecuentaDatos);
  /** Ítems de la cuenta a cobrar por pre-cuenta (panel derecho) */
  const [itemsPorPrecuenta, setItemsPorPrecuenta] = useState<Record<string, ItemCuenta[]>>({ "1": [] });
  const [turnoAbierto, setTurnoAbierto] = useState(true);
  const [turnoInicio, setTurnoInicio] = useState<Date>(() => new Date());
  const [showModalCierreTurno, setShowModalCierreTurno] = useState(false);
  const [detalleVentasExpandido, setDetalleVentasExpandido] = useState(true);
  /** Valores ingresados en el cierre de turno */
  const [cierreEfectivoReal, setCierreEfectivoReal] = useState("");
  const [cierreTarjeta, setCierreTarjeta] = useState("");
  const [cierrePagosLinea, setCierrePagosLinea] = useState("");
  const [cierreOtrosMedios, setCierreOtrosMedios] = useState("");
  const [baseInicialCaja, setBaseInicialCaja] = useState(0);
  const [showModalAbrirTurno, setShowModalAbrirTurno] = useState(false);
  const [baseInicialCajaInput, setBaseInicialCajaInput] = useState("");
  const [totalVentasEnTurno, setTotalVentasEnTurno] = useState(0);
  const [totalIngresoEfectivo, setTotalIngresoEfectivo] = useState(0);
  const [totalRetiroEfectivo, setTotalRetiroEfectivo] = useState(0);
  const [ventasCredito, setVentasCredito] = useState(0);
  /** Historial de precuentas anuladas en este turno */
  const [precuentasEliminadasCount, setPrecuentasEliminadasCount] = useState(0);
  const [productosEliminadosCount, setProductosEliminadosCount] = useState(0);
  const [valorProductosEliminados, setValorProductosEliminados] = useState(0);
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
  /** Tipo de comprobante: Documento interno (predeterminado) o Factura electrónica */
  const [tipoComprobante, setTipoComprobante] = useState<TipoComprobante>("documento_interno");
  /** Id de la pre-cuenta cuyo nombre se está editando; null si no hay edición */
  const [editingPrecuentaId, setEditingPrecuentaId] = useState<string | null>(null);
  const [editingNombre, setEditingNombre] = useState("");

  const cargarCatalogo = () => {
    if (moduloActivo !== "ventas") return;
    setCatalogoLoading(true);
    setCatalogoError(null);
    const tokenPromise = auth?.currentUser ? auth.currentUser.getIdToken() : Promise.resolve(null);
    tokenPromise
      .then((token) => getCatalogoPOS(token))
      .then((res) => {
        if (res.ok && res.productos) setCatalogoProductos(res.productos ?? []);
        else setCatalogoError(res.message ?? "No se pudo cargar el catálogo");
      })
      .catch(() => setCatalogoError("Error al cargar el catálogo"))
      .finally(() => setCatalogoLoading(false));
  };

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
        if (res.ok && res.productos) setCatalogoProductos(res.productos ?? []);
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
    if (resultado.estado === "exito") {
      setTotalVentasEnTurno((prev) => prev + valor);
    }
  };

  const agregarPrecuenta = () => {
    const nextNum = precuentas.length + 1;
    const id = String(Date.now());
    setPrecuentas((prev) => [...prev, { id, nombre: `Pre-cuenta ${nextNum}` }]);
    setPrecuentaDatos((prev) => ({
      ...prev,
      [id]: { valorVenta: "", estado: "idle", mensaje: "" },
    }));
    setItemsPorPrecuenta((prev) => ({ ...prev, [id]: [] }));
    setActivePrecuentaId(id);
  };

  const cerrarPrecuenta = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (precuentas.length <= 1) return;
    const items = itemsPorPrecuenta[id] ?? [];
    const numProductos = items.reduce((s, i) => s + i.cantidad, 0);
    const valor = items.reduce((s, i) => s + i.producto.precioUnitario * i.cantidad, 0);
    setPrecuentasEliminadasCount((prev) => prev + 1);
    setProductosEliminadosCount((prev) => prev + numProductos);
    setValorProductosEliminados((prev) => prev + valor);
    const idx = precuentas.findIndex((p) => p.id === id);
    if (idx < 0) return;
    const next = precuentas.filter((p) => p.id !== id);
    setPrecuentas(next);
    setPrecuentaDatos((prev) => {
      const nextData = { ...prev };
      delete nextData[id];
      return nextData;
    });
    setItemsPorPrecuenta((prev) => {
      const nextData = { ...prev };
      delete nextData[id];
      return nextData;
    });
    if (activePrecuentaId === id) {
      setActivePrecuentaId(next[idx === 0 ? 1 : idx - 1]!.id);
    }
    setEditingPrecuentaId((prev) => (prev === id ? null : prev));
  };

  const iniciarEdicionNombre = (id: string) => {
    const p = precuentas.find((x) => x.id === id);
    if (p) {
      setEditingPrecuentaId(id);
      setEditingNombre(p.nombre);
    }
  };

  const guardarNombrePrecuenta = (id: string) => {
    const nombre = editingNombre.trim() || "Pre-cuenta";
    setPrecuentas((prev) =>
      prev.map((p) => (p.id === id ? { ...p, nombre } : p))
    );
    setEditingPrecuentaId(null);
    setEditingNombre("");
  };

  /** Agregar producto a la cuenta activa (clic en producto → panel derecho) */
  const agregarProductoACuenta = (producto: ProductoPOS) => {
    setItemsPorPrecuenta((prev) => {
      const items = prev[activePrecuentaId] ?? [];
      const idx = items.findIndex((i) => i.producto.sku === producto.sku);
      const next = [...items];
      if (idx >= 0) {
        next[idx] = { ...next[idx]!, cantidad: next[idx]!.cantidad + 1 };
      } else {
        next.push({ producto, cantidad: 1 });
      }
      return { ...prev, [activePrecuentaId]: next };
    });
  };

  const itemsCuentaActiva = itemsPorPrecuenta[activePrecuentaId] ?? [];
  const totalCuentaActiva = itemsCuentaActiva.reduce(
    (sum, i) => sum + i.producto.precioUnitario * i.cantidad,
    0
  );

  const cambiarCantidad = (sku: string, delta: number) => {
    setItemsPorPrecuenta((prev) => {
      const items = prev[activePrecuentaId] ?? [];
      const next = items
        .map((it) =>
          it.producto.sku === sku
            ? { ...it, cantidad: Math.max(0, it.cantidad + delta) }
            : it
        )
        .filter((it) => it.cantidad > 0);
      return { ...prev, [activePrecuentaId]: next };
    });
  };

  const quitarItem = (sku: string) => {
    setItemsPorPrecuenta((prev) => {
      const items = (prev[activePrecuentaId] ?? []).filter((i) => i.producto.sku !== sku);
      return { ...prev, [activePrecuentaId]: items };
    });
  };

  const vaciarCuenta = () => {
    setItemsPorPrecuenta((prev) => ({ ...prev, [activePrecuentaId]: [] }));
  };

  const confirmarAbrirTurno = () => {
    const valor = parseFloat(String(baseInicialCajaInput).replace(/,/g, "."));
    const base = Number.isFinite(valor) && valor >= 0 ? valor : 0;
    setBaseInicialCaja(base);
    setTurnoAbierto(true);
    setTurnoInicio(new Date());
    setTotalVentasEnTurno(0);
    setPrecuentasEliminadasCount(0);
    setProductosEliminadosCount(0);
    setValorProductosEliminados(0);
    setCierreEfectivoReal("");
    setCierreTarjeta("");
    setCierrePagosLinea("");
    setCierreOtrosMedios("");
    setShowModalAbrirTurno(false);
    setBaseInicialCajaInput("");
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
              moduloActivo === "ventas" ? "bg-brand-yellow/25 text-gray-900 border border-brand-yellow/50" : "text-gray-600 hover:bg-gray-50"
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
              moduloActivo === "turnos" ? "bg-brand-yellow/25 text-gray-900 border border-brand-yellow/50" : "text-gray-600 hover:bg-gray-50"
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
              moduloActivo === "reportes" ? "bg-brand-yellow/25 text-gray-900 border border-brand-yellow/50" : "text-gray-600 hover:bg-gray-50"
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
              moduloActivo === "mas" ? "bg-brand-yellow/25 text-gray-900 border border-brand-yellow/50" : "text-gray-600 hover:bg-gray-50"
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
            onClick={() => {
              if (turnoAbierto) setShowModalCierreTurno(true);
              else {
                setBaseInicialCajaInput("");
                setShowModalAbrirTurno(true);
              }
            }}
            className={`mb-3 flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors hover:opacity-90 ${
              turnoAbierto
                ? "border-emerald-200 bg-emerald-50"
                : "border-red-200 bg-red-50"
            }`}
            title={turnoAbierto ? "Clic para cerrar turno" : "Clic para abrir turno"}
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
              className="group relative flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-gray-200 bg-gray-100 ring-2 ring-white shadow-md transition-all hover:border-brand-yellow hover:ring-brand-yellow/30 focus:outline-none focus:ring-2 focus:ring-brand-yellow"
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
              className="text-xs font-medium text-gray-700 hover:text-gray-900 hover:underline"
            >
              Cambiar foto
            </button>
            <button
              type="button"
              onClick={abrirModalPerfil}
              className="rounded-lg bg-brand-yellow px-3 py-2 text-sm font-medium text-gray-900 transition-colors hover:opacity-90"
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

      {/* Modal Abrir turno */}
      {showModalAbrirTurno && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-abrir-turno-title"
        >
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowModalAbrirTurno(false)}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <h2 id="modal-abrir-turno-title" className="text-lg font-semibold text-gray-900">
                Abrir turno
              </h2>
              <button
                type="button"
                onClick={() => setShowModalAbrirTurno(false)}
                className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                aria-label="Cerrar"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-6 py-5">
              {/* Datos del usuario */}
              <div className="mb-5 flex items-center gap-3">
                <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-lg font-semibold text-blue-700">
                  {inicialesCajero}
                </span>
                <div>
                  <p className="font-medium text-gray-900">
                    {user?.puntoVenta ?? "Maria Chorizos"}
                  </p>
                  <p className="text-sm text-gray-500">Cajero</p>
                </div>
              </div>
              <div className="space-y-3 text-sm">
                <div>
                  <label className="text-gray-500">Email:</label>
                  <p className="font-medium text-gray-900">{user?.email ?? "—"}</p>
                </div>
                <div>
                  <label className="text-gray-500">Nombre:</label>
                  <p className="font-medium text-gray-900">{user?.puntoVenta ?? "Maria Chorizos"}</p>
                </div>
                <div>
                  <label className="text-gray-500">Fecha y hora de apertura:</label>
                  <p className="font-medium text-gray-900">
                    {new Date().toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <div>
                  <label htmlFor="base-inicial" className="mb-1 flex items-center gap-1 text-gray-700">
                    Base Inicial en caja <span className="text-red-500" aria-hidden>*</span>
                  </label>
                  <div className="flex rounded-lg border border-gray-300 bg-white">
                    <span className="flex items-center px-3 text-gray-500">$</span>
                    <input
                      id="base-inicial"
                      type="text"
                      inputMode="decimal"
                      value={baseInicialCajaInput}
                      onChange={(e) => setBaseInicialCajaInput(e.target.value)}
                      placeholder="0,00"
                      className="w-full py-2.5 pr-3 focus:outline-none focus:ring-0"
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex gap-3 border-t border-gray-200 bg-gray-50 px-6 py-4">
              <button
                type="button"
                onClick={() => setShowModalAbrirTurno(false)}
                className="flex-1 rounded-lg border border-gray-300 bg-white py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarAbrirTurno}
                className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Abrir turno
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Detalle del turno (cierre de caja) */}
      {showModalCierreTurno && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-turno-title"
        >
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowModalCierreTurno(false)}
            aria-hidden="true"
          />
          <div className="relative max-h-[90vh] w-full max-w-lg overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <h2 id="modal-turno-title" className="text-lg font-semibold text-gray-900">
                Detalle del turno
              </h2>
              <button
                type="button"
                onClick={() => setShowModalCierreTurno(false)}
                className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                aria-label="Cerrar"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="max-h-[calc(90vh-8rem)] overflow-y-auto px-6 py-4">
              {/* Info del turno */}
              <div className="mb-4 rounded-lg bg-gray-50 p-4 text-sm">
                <p className="font-medium text-gray-900">Maria Chorizos</p>
                <p className="mt-1 text-gray-600">
                  Inicio: {turnoInicio.toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                </p>
                <p className="text-gray-600">Fin: —</p>
                <p className="text-gray-600">Cierre realizado por: —</p>
              </div>

              {/* Ventas (expandible) */}
              <div className="mb-4 rounded-lg border border-gray-200">
                <button
                  type="button"
                  onClick={() => setDetalleVentasExpandido((v) => !v)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left font-medium text-gray-900"
                >
                  Ventas
                  <span className="text-gray-500">
                    {detalleVentasExpandido ? "Ocultar detalle" : "Ver detalle"}
                  </span>
                </button>
                {detalleVentasExpandido && (
                  <div className="border-t border-gray-100 px-4 py-3 text-sm text-gray-600">
                    <p>Total base inicial de caja: {baseInicialCaja.toLocaleString("es-CO", { minimumFractionDigits: 2 })}</p>
                    <p className="mt-1">Total efectivo: {totalVentasEnTurno.toLocaleString("es-CO", { minimumFractionDigits: 2 })}</p>
                    <p className="mt-1">Total tarjetas: 0,00</p>
                    <p className="mt-1">Total pagos en línea: 0,00</p>
                    <p className="mt-1">Total otros: 0,00</p>
                  </div>
                )}
              </div>

              {/* Ingresos y retiros */}
              <div className="mb-4 rounded-lg border border-gray-200 p-4 text-sm">
                <p className="font-medium text-gray-900">Ingresos y retiros</p>
                <p className="mt-1 text-gray-600">Total ingreso de efectivo: $ {totalIngresoEfectivo.toLocaleString("es-CO", { minimumFractionDigits: 2 })}</p>
                <p className="mt-1 text-gray-600">Total retiro de efectivo: $ {totalRetiroEfectivo.toLocaleString("es-CO", { minimumFractionDigits: 2 })}</p>
              </div>

              {/* Ingrese el valor de las ventas registradas */}
              <p className="mb-2 text-sm font-medium text-gray-900">
                Ingrese el valor de las ventas registradas en el turno
              </p>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs text-gray-600">Total real de efectivo en caja</label>
                  <div className="flex rounded-lg border border-gray-300 bg-white">
                    <span className="flex items-center px-3 text-gray-500">$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={cierreEfectivoReal}
                      onChange={(e) => setCierreEfectivoReal(e.target.value)}
                      placeholder="0,00"
                      className="w-full py-2 pr-3 focus:outline-none focus:ring-0"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-600">Total ventas con tarjeta</label>
                  <div className="flex rounded-lg border border-gray-300 bg-white">
                    <span className="flex items-center px-3 text-gray-500">$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={cierreTarjeta}
                      onChange={(e) => setCierreTarjeta(e.target.value)}
                      placeholder="0,00"
                      className="w-full py-2 pr-3 focus:outline-none focus:ring-0"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-600">Total ventas con pagos en línea</label>
                  <div className="flex rounded-lg border border-gray-300 bg-white">
                    <span className="flex items-center px-3 text-gray-500">$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={cierrePagosLinea}
                      onChange={(e) => setCierrePagosLinea(e.target.value)}
                      placeholder="0,00"
                      className="w-full py-2 pr-3 focus:outline-none focus:ring-0"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-600">Total ventas otros medios de pago</label>
                  <div className="flex rounded-lg border border-gray-300 bg-white">
                    <span className="flex items-center px-3 text-gray-500">$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={cierreOtrosMedios}
                      onChange={(e) => setCierreOtrosMedios(e.target.value)}
                      placeholder="0,00"
                      className="w-full py-2 pr-3 focus:outline-none focus:ring-0"
                    />
                  </div>
                </div>
              </div>

              {/* Resumen cierre */}
              {(() => {
                const parseVal = (s: string) => parseFloat(String(s).replace(/,/g, ".")) || 0;
                const totalIngresado = parseVal(cierreEfectivoReal) + parseVal(cierreTarjeta) + parseVal(cierrePagosLinea) + parseVal(cierreOtrosMedios);
                const totalEsperado = baseInicialCaja + totalVentasEnTurno;
                const diferencia = totalIngresado - totalEsperado;
                return (
                  <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm">
                    <p className="flex justify-between">
                      <span className="text-gray-600">Total ingresado en cierre de caja</span>
                      <span className="font-medium">$ {totalIngresado.toLocaleString("es-CO", { minimumFractionDigits: 2 })}</span>
                    </p>
                    <p className="mt-2 flex justify-between">
                      <span className="text-gray-600">Total esperado en cierre de caja</span>
                      <span className="font-medium">$ {totalEsperado.toLocaleString("es-CO", { minimumFractionDigits: 2 })}</span>
                    </p>
                    <p className={`mt-2 flex justify-between ${diferencia !== 0 ? "text-red-600 font-medium" : "text-gray-600"}`}>
                      <span>Diferencia</span>
                      <span>$ {diferencia.toLocaleString("es-CO", { minimumFractionDigits: 2 })}</span>
                    </p>
                    <p className="mt-2 flex justify-between text-gray-600">
                      <span>Total ventas a crédito</span>
                      <span>$ {ventasCredito.toLocaleString("es-CO", { minimumFractionDigits: 2 })}</span>
                    </p>
                    <p className="mt-1 text-xs text-gray-500">Valor no incluido en el total de las ventas</p>
                  </div>
                );
              })()}

              {/* Historial precuentas eliminadas */}
              <div className="mt-4 rounded-lg border border-gray-200 p-4 text-sm">
                <p className="font-medium text-gray-900">Historial de Precuentas eliminadas</p>
                <p className="mt-2 text-gray-600">Total Precuentas eliminadas: {precuentasEliminadasCount}</p>
                <p className="mt-1 text-gray-600">Núm. de productos eliminados: {productosEliminadosCount}</p>
                <p className="mt-1 text-gray-600">Valor de productos eliminados: $ {valorProductosEliminados.toLocaleString("es-CO", { minimumFractionDigits: 2 })}</p>
                <p className="mt-2 text-xs text-gray-500">Este valor no afectará el total del cierre de turno</p>
              </div>
            </div>
            <div className="flex gap-3 border-t border-gray-200 bg-gray-50 px-6 py-4">
              <button
                type="button"
                onClick={() => setShowModalCierreTurno(false)}
                className="flex-1 rounded-lg border border-blue-300 bg-white py-2.5 text-sm font-medium text-blue-700 hover:bg-blue-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  setTurnoAbierto(false);
                  setShowModalCierreTurno(false);
                }}
                className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Cerrar turno
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Área central: contenido según módulo activo */}
      <main className="min-w-0 flex-1 pl-52 pt-0">
        <div className="p-6">
          {moduloActivo === "ventas" ? (
            <div className="space-y-6">
              {!turnoAbierto && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center">
                  <p className="text-sm font-medium text-amber-800">
                    El turno está cerrado. Debe abrir un turno para poder vender.
                  </p>
                  <p className="mt-1 text-xs text-amber-700">
                    Use el botón «Turno cerrado» en el menú izquierdo para abrir un nuevo turno.
                  </p>
                </div>
              )}
              {/* Pestañas de pre-cuenta */}
              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <span className="mr-2 text-sm font-medium text-gray-500">Pre-cuenta activa:</span>
                {precuentas.map((p) => (
                  <span
                    key={p.id}
                    className={`mr-2 inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 ${
                      activePrecuentaId === p.id
                        ? "border-brand-yellow bg-brand-yellow/20"
                        : "border-gray-200 bg-white"
                    }`}
                  >
                    {editingPrecuentaId === p.id ? (
                      <>
                        <input
                          type="text"
                          value={editingNombre}
                          onChange={(e) => setEditingNombre(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") guardarNombrePrecuenta(p.id);
                            if (e.key === "Escape") {
                              setEditingPrecuentaId(null);
                              setEditingNombre("");
                            }
                          }}
                          onBlur={() => guardarNombrePrecuenta(p.id)}
                          className="w-36 rounded border border-gray-300 px-2 py-0.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-200"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => guardarNombrePrecuenta(p.id)}
                          className="rounded p-0.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                          aria-label="Guardar nombre"
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => setActivePrecuentaId(p.id)}
                          className="text-left text-sm font-medium text-gray-900"
                        >
                          {p.nombre}
                        </button>
                        <button
                          type="button"
                          onClick={() => iniciarEdicionNombre(p.id)}
                          className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                          aria-label="Editar nombre"
                          title="Editar nombre"
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                        {precuentas.length > 1 && (
                          <button
                            type="button"
                            onClick={(e) => cerrarPrecuenta(p.id, e)}
                            className="rounded p-0.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                            aria-label="Anular pre-cuenta"
                            title="Anular pre-cuenta"
                          >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </>
                    )}
                  </span>
                ))}
                <button
                  type="button"
                  onClick={agregarPrecuenta}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-dashed border-gray-300 text-gray-500 hover:border-brand-yellow hover:text-gray-700"
                  aria-label="Nueva pre-cuenta"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              </div>

              {/* Catálogo de productos */}
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
                    <p className="mt-1 text-gray-600">Puedes usar el reporte de venta del día más abajo.</p>
                    <button
                      type="button"
                      onClick={cargarCatalogo}
                      className="mt-3 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Reintentar carga del catálogo
                    </button>
                  </div>
                )}
                {!catalogoLoading && !catalogoError && (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {catalogosFiltrados.map((p) => {
                      const enCuenta = itemsCuentaActiva.find((i) => i.producto.sku === p.sku);
                      const qty = enCuenta?.cantidad ?? 0;
                      return (
                        <button
                          key={p.sku}
                          type="button"
                          onClick={() => turnoAbierto && agregarProductoACuenta(p)}
                          disabled={!turnoAbierto}
                          className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-gray-50/50 text-left transition-shadow hover:border-primary-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary-400 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:shadow-none"
                        >
                          <div className="relative aspect-square w-full bg-gray-200">
                            {qty > 0 && (
                              <span className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-sm font-bold text-white shadow">
                                {qty}
                              </span>
                            )}
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
                        </button>
                      );
                    })}
                  </div>
                )}
                {!catalogoLoading && !catalogoError && catalogosFiltrados.length === 0 && (
                  <p className="py-6 text-center text-sm text-gray-500">
                    {busquedaCatalogo.trim() ? "No hay productos que coincidan con la búsqueda." : "No hay productos en el catálogo."}
                  </p>
                )}
              </div>

              {/* Valor de venta del día — debajo del catálogo */}
              <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
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

      {/* Sidebar derecho — Cuenta a cobrar (estilo Siigo POS) */}
      <aside className="hidden w-80 flex-shrink-0 flex-col border-l border-gray-200 bg-white lg:flex">
        <div className="border-b border-gray-100 px-4 py-3">
          <h2 className="text-base font-semibold text-gray-900">Cuenta a cobrar</h2>
          <p className="mt-0.5 text-xs text-gray-500">
            {precuentas.find((p) => p.id === activePrecuentaId)?.nombre} · {user.puntoVenta}
          </p>
          <div className="mt-3">
            <label htmlFor="tipo-comprobante-sidebar" className="mb-1 flex items-center gap-1 text-xs font-medium text-gray-700">
              Tipo de comprobante <span className="text-red-500" aria-hidden>*</span>
            </label>
            <select
              id="tipo-comprobante-sidebar"
              value={tipoComprobante}
              onChange={(e) => setTipoComprobante(e.target.value as TipoComprobante)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
            >
              <option value="documento_interno">Documento interno</option>
              <option value="factura_electronica">Factura electrónica de venta</option>
            </select>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {itemsCuentaActiva.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <svg className="mb-3 h-12 w-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <p className="text-sm text-gray-500">Sin ítems</p>
              <p className="mt-1 text-xs text-gray-400">Haz clic en un producto para agregarlo</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {itemsCuentaActiva.map((it) => {
                const subtotal = it.producto.precioUnitario * it.cantidad;
                return (
                  <li
                    key={it.producto.sku}
                    className="rounded-lg border border-gray-100 bg-gray-50/80 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900">{it.producto.descripcion}</p>
                        <p className="mt-0.5 text-xs text-gray-500">
                          Cod. {it.producto.sku} · Precio: $ {Number(it.producto.precioUnitario).toLocaleString("es-CO")}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => quitarItem(it.producto.sku)}
                        className="flex-shrink-0 rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                        aria-label="Quitar ítem"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center gap-1 rounded border border-gray-200 bg-white">
                        <button
                          type="button"
                          onClick={() => cambiarCantidad(it.producto.sku, -1)}
                          className="flex h-8 w-8 items-center justify-center text-gray-600 hover:bg-gray-100"
                          aria-label="Menos"
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                          </svg>
                        </button>
                        <span className="min-w-[2rem] text-center text-sm font-medium tabular-nums">
                          {it.cantidad}
                        </span>
                        <button
                          type="button"
                          onClick={() => cambiarCantidad(it.producto.sku, 1)}
                          className="flex h-8 w-8 items-center justify-center text-gray-600 hover:bg-gray-100"
                          aria-label="Más"
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                        </button>
                      </div>
                      <span className="text-sm font-semibold text-gray-900">
                        $ {subtotal.toLocaleString("es-CO")}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="border-t border-gray-200 bg-gray-50 px-4 py-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-600">Total</span>
            <span className="text-lg font-bold text-gray-900">
              $ {totalCuentaActiva.toLocaleString("es-CO")}
            </span>
          </div>
          <div className="flex gap-2">
            {itemsCuentaActiva.length > 0 && (
              <button
                type="button"
                onClick={vaciarCuenta}
                className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-gray-300 bg-white py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                title="Vaciar cuenta"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Vaciar
              </button>
            )}
            <button
              type="button"
              disabled={itemsCuentaActiva.length === 0 || !turnoAbierto}
              className="flex flex-1 items-center justify-center rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white shadow transition-colors hover:bg-emerald-700 disabled:opacity-50 disabled:pointer-events-none"
            >
              Cobrar $ {totalCuentaActiva.toLocaleString("es-CO")}
            </button>
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
