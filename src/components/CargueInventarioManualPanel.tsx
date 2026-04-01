"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchCatalogoInsumosDesdeSheet,
  type CatalogoSheetSetupHint,
} from "@/lib/catalogo-insumos-sheet-client";
import { fechaColombia, fechaHoraColombia, mediodiaColombiaDesdeYmd, ymdColombia } from "@/lib/fecha-colombia";
import {
  CATALOGO_INSUMOS_KIT_COLLECTION,
  corregirMovimientoCargueInventario,
  etiquetaTipoMovimiento,
  listarInsumosKitPorPuntoVenta,
  listarMovimientosInventario,
  registrarMovimientoInventario,
} from "@/lib/inventario-pos-firestore";
import CargueCelebracionExito from "@/components/CargueCelebracionExito";
import CargueInventarioMasivoPanel from "@/components/CargueInventarioMasivoPanel";
import type { InsumoKitItem, InventarioMovimientoDoc } from "@/types/inventario-pos";

export interface CargueInventarioManualPanelProps {
  puntoVenta: string | null;
  uid: string;
  email: string | null;
}

function fechaHoyIsoColombia(): string {
  return ymdColombia();
}

function formatMovFecha(createdAt: unknown): string {
  if (!createdAt || typeof createdAt !== "object") return "—";
  const s = (createdAt as { seconds?: number }).seconds;
  if (typeof s !== "number") return "—";
  return fechaHoraColombia(new Date(s * 1000), {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function formatFechaCargueMostrar(iso: string | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "—";
  const dt = mediodiaColombiaDesdeYmd(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  return fechaColombia(dt, { dateStyle: "medium" });
}

function formatLogEdicionEn(en: unknown): string {
  return formatMovFecha(en);
}

/** Texto comparable en búsqueda (minúsculas, sin tildes). */
function textoBusquedaFold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function tokensDesdeBusqueda(q: string): string[] {
  return q
    .split(/\s+/)
    .map((t) => textoBusquedaFold(t))
    .filter(Boolean);
}

function insumoMatcheaTokens(i: InsumoKitItem, tokens: string[]): boolean {
  if (tokens.length === 0) return true;
  const blob = textoBusquedaFold(`${i.sku} ${i.descripcion} ${i.categoria ?? ""}`);
  return tokens.every((t) => blob.includes(t));
}

/** Mayor = mejor coincidencia (SKU exacto, prefijos, palabras en descripción). */
function puntajeInsumoBusqueda(i: InsumoKitItem, tokens: string[]): number {
  if (tokens.length === 0) return 0;
  const sku = textoBusquedaFold(i.sku);
  const desc = textoBusquedaFold(i.descripcion);
  const cat = textoBusquedaFold(i.categoria ?? "");
  let score = 0;
  for (const t of tokens) {
    if (!t) continue;
    if (sku === t) score += 220;
    else if (sku.startsWith(t)) score += 160;
    else if (sku.includes(t)) score += 90;
    else if (desc.startsWith(t)) score += 120;
    else if (desc.includes(t)) score += 55;
    else if (cat.includes(t)) score += 25;
  }
  return score;
}

const LISTA_SUGERENCIAS_MAX = 80;
const LISTA_SIN_FILTRO_MAX = 100;

function nuevaKeyLineaCargue(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

type LineaCargueBorrador = {
  key: string;
  insumo: InsumoKitItem;
  cantidad: number;
  /** Lote del paquete recibido (también se guarda en las notas del movimiento). */
  lote: string;
  /** Precio de compra unitario en COP (obligatorio al registrar). */
  precioCompraUnitario: number;
};

/** Une anotaciones globales del cargue con el lote por línea (tope Firestore 500). */
function notasMovimientoCargueLinea(anotacionesGlobales: string, lote: string): string {
  const g = anotacionesGlobales.trim();
  const l = lote.trim();
  const parts: string[] = [];
  if (l) parts.push(`Lote: ${l}`);
  if (g) parts.push(g);
  return parts.join(" · ").slice(0, 500);
}

export default function CargueInventarioManualPanel({ puntoVenta, uid, email }: CargueInventarioManualPanelProps) {
  const pv = (puntoVenta ?? "").trim();
  const [insumos, setInsumos] = useState<InsumoKitItem[]>([]);
  const [cargandoCat, setCargandoCat] = useState(true);
  const [errorCat, setErrorCat] = useState<string | null>(null);
  const [sheetSetupAyuda, setSheetSetupAyuda] = useState<CatalogoSheetSetupHint | null>(null);

  const [busqueda, setBusqueda] = useState("");
  const [insumoId, setInsumoId] = useState("");
  const [panelSugerenciasAbierto, setPanelSugerenciasAbierto] = useState(false);
  const comboRef = useRef<HTMLDivElement>(null);
  const [fechaCargue, setFechaCargue] = useState(fechaHoyIsoColombia);
  const [cantidad, setCantidad] = useState("");
  const [loteLinea, setLoteLinea] = useState("");
  const [precioLinea, setPrecioLinea] = useState("");
  const [lineasCargue, setLineasCargue] = useState<LineaCargueBorrador[]>([]);
  const [anotaciones, setAnotaciones] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [mensajeOk, setMensajeOk] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [celebracionCargueN, setCelebracionCargueN] = useState<number | null>(null);
  const [celebracionCargueKey, setCelebracionCargueKey] = useState(0);

  const [historialCargue, setHistorialCargue] = useState<Awaited<ReturnType<typeof listarMovimientosInventario>>>([]);
  const [cargandoHist, setCargandoHist] = useState(false);
  const [fuenteCat, setFuenteCat] = useState<"sheet" | "firestore" | null>(null);

  const [movDetalle, setMovDetalle] = useState<InventarioMovimientoDoc | null>(null);
  const [editCantidad, setEditCantidad] = useState("");
  const [editFechaCargue, setEditFechaCargue] = useState("");
  const [editNotas, setEditNotas] = useState("");
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);
  const [errorEdicion, setErrorEdicion] = useState<string | null>(null);
  const [subVistaCargue, setSubVistaCargue] = useState<"detallado" | "inicial">("detallado");

  const cargarCatalogo = useCallback(async () => {
    if (!pv) {
      setInsumos([]);
      setCargandoCat(false);
      setFuenteCat(null);
      setErrorCat("No hay punto de venta asignado en tu perfil.");
      return;
    }
    setCargandoCat(true);
    setErrorCat(null);
    setFuenteCat(null);
    try {
      const sheet = await fetchCatalogoInsumosDesdeSheet(pv);
      if (sheet.ok && sheet.data.length > 0) {
        setInsumos(sheet.data);
        setFuenteCat("sheet");
        return;
      }
      const listaFs = await listarInsumosKitPorPuntoVenta(pv);
      if (listaFs.length > 0) {
        setInsumos(listaFs);
        setFuenteCat("firestore");
        if (!sheet.ok && sheet.message) {
          setErrorCat(
            `No se leyó la hoja de Google (${sheet.message}). Se muestra el catálogo de Firestore «${CATALOGO_INSUMOS_KIT_COLLECTION}».`
          );
        }
        return;
      }
      setInsumos([]);
      if (!sheet.ok) {
        setErrorCat(
          sheet.message ??
            "No se pudo leer la hoja de productos. Configura cuenta de servicio (GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON o GOOGLE_SHEETS_USE_FIREBASE_SA), CSV publicado o API key según tu caso."
        );
      } else {
        setErrorCat(
          `La hoja no devolvió filas para «${pv}» (si hay columna de punto de venta, debe coincidir). Tampoco hay ítems en «${CATALOGO_INSUMOS_KIT_COLLECTION}».`
        );
      }
    } catch {
      setErrorCat("No se pudo cargar el catálogo de insumos.");
      setInsumos([]);
    } finally {
      setCargandoCat(false);
    }
  }, [pv]);

  const cargarHistorialCargues = useCallback(async () => {
    if (!pv) return;
    setCargandoHist(true);
    try {
      const rows = await listarMovimientosInventario(pv, 80);
      setHistorialCargue(rows.filter((m) => m.tipo === "cargue"));
    } catch {
      setHistorialCargue([]);
    } finally {
      setCargandoHist(false);
    }
  }, [pv]);

  const cerrarDetalleCargue = useCallback(() => {
    setMovDetalle(null);
    setErrorEdicion(null);
  }, []);

  const abrirDetalleCargue = useCallback((m: InventarioMovimientoDoc) => {
    setMovDetalle(m);
    setEditCantidad(String(m.delta));
    setEditFechaCargue(m.fechaCargue ?? "");
    setEditNotas(m.notas);
    setErrorEdicion(null);
  }, []);

  const guardarEdicionCargue = useCallback(async () => {
    if (!movDetalle || !pv) return;
    setGuardandoEdicion(true);
    setErrorEdicion(null);
    try {
      const n = parseFloat(editCantidad.replace(/,/g, "."));
      const r = await corregirMovimientoCargueInventario({
        movimientoId: movDetalle.id,
        puntoVenta: pv,
        nuevaCantidad: n,
        fechaCargue: editFechaCargue,
        notas: editNotas,
        uid,
        email,
      });
      if (!r.ok) {
        setErrorEdicion(r.message ?? "No se pudo guardar.");
        return;
      }
      const rows = await listarMovimientosInventario(pv, 80);
      const filtrados = rows.filter((x) => x.tipo === "cargue");
      setHistorialCargue(filtrados);
      const actualizado = filtrados.find((x) => x.id === movDetalle.id);
      if (actualizado) {
        setMovDetalle(actualizado);
        setEditCantidad(String(actualizado.delta));
        setEditFechaCargue(actualizado.fechaCargue ?? "");
        setEditNotas(actualizado.notas);
      }
      setMensajeOk("Corrección del cargue guardada.");
      window.setTimeout(() => setMensajeOk(null), 4000);
    } finally {
      setGuardandoEdicion(false);
    }
  }, [movDetalle, pv, editCantidad, editFechaCargue, editNotas, uid, email]);

  useEffect(() => {
    void cargarCatalogo();
  }, [cargarCatalogo]);

  useEffect(() => {
    void cargarHistorialCargues();
  }, [cargarHistorialCargues]);

  useEffect(() => {
    if (!movDetalle) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cerrarDetalleCargue();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [movDetalle, cerrarDetalleCargue]);

  useEffect(() => {
    if (!panelSugerenciasAbierto) return;
    const onDoc = (e: MouseEvent) => {
      const el = comboRef.current;
      if (!el || !(e.target instanceof Node) || el.contains(e.target)) return;
      setPanelSugerenciasAbierto(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [panelSugerenciasAbierto]);

  const tokensBusqueda = useMemo(() => tokensDesdeBusqueda(busqueda), [busqueda]);

  const sugerenciasOrdenadas = useMemo(() => {
    if (insumos.length === 0) return [];
    const conFiltro = tokensBusqueda.length > 0;
    let list = conFiltro ? insumos.filter((i) => insumoMatcheaTokens(i, tokensBusqueda)) : [...insumos];
    if (conFiltro) {
      list.sort(
        (a, b) =>
          puntajeInsumoBusqueda(b, tokensBusqueda) - puntajeInsumoBusqueda(a, tokensBusqueda)
      );
      return list.slice(0, LISTA_SUGERENCIAS_MAX);
    }
    list.sort((a, b) => a.descripcion.localeCompare(b.descripcion, "es", { sensitivity: "base" }));
    return list.slice(0, LISTA_SIN_FILTRO_MAX);
  }, [insumos, tokensBusqueda]);

  const hayMasInsumosSinFiltro = tokensBusqueda.length === 0 && insumos.length > LISTA_SIN_FILTRO_MAX;

  const insumoSel = useMemo(() => insumos.find((i) => i.id === insumoId) ?? null, [insumos, insumoId]);

  const agregarLineaALista = () => {
    setMensajeOk(null);
    setError(null);
    if (!insumoSel) {
      setError("Elegí un producto en la lista y una cantidad.");
      return;
    }
    const cant = parseFloat(cantidad.replace(/,/g, "."));
    if (!Number.isFinite(cant) || cant <= 0) {
      setError("Indicá una cantidad mayor que cero.");
      return;
    }
    const loteNorm = loteLinea.trim();
    if (!loteNorm) {
      setError("Indicá el lote del paquete que llegó.");
      return;
    }
    const precio = parseFloat(precioLinea.replace(/,/g, "."));
    if (!Number.isFinite(precio) || precio <= 0) {
      setError("Indicá el precio de compra unitario (COP, mayor que cero).");
      return;
    }
    const ins = insumoSel;
    setLineasCargue((prev) => {
      const idx = prev.findIndex((l) => l.insumo.id === ins.id && l.lote.trim() === loteNorm);
      if (idx >= 0) {
        const next = [...prev];
        const row = next[idx]!;
        const q0 = row.cantidad;
        const p0 = row.precioCompraUnitario;
        const newQ = q0 + cant;
        const prom = newQ > 0 ? (q0 * p0 + cant * precio) / newQ : precio;
        next[idx] = {
          ...row,
          cantidad: newQ,
          precioCompraUnitario: Math.round(prom * 100) / 100,
        };
        return next;
      }
      return [
        ...prev,
        {
          key: nuevaKeyLineaCargue(),
          insumo: ins,
          cantidad: cant,
          lote: loteNorm,
          precioCompraUnitario: Math.round(precio * 100) / 100,
        },
      ];
    });
    setInsumoId("");
    setCantidad("");
    setLoteLinea("");
    setPrecioLinea("");
    setBusqueda("");
    setPanelSugerenciasAbierto(false);
  };

  const quitarLinea = (key: string) => {
    setLineasCargue((prev) => prev.filter((l) => l.key !== key));
  };

  const actualizarCantidadLinea = (key: string, raw: string) => {
    const cant = parseFloat(raw.replace(/,/g, "."));
    if (!Number.isFinite(cant) || cant <= 0) return;
    setLineasCargue((prev) =>
      prev.map((l) => (l.key === key ? { ...l, cantidad: cant } : l))
    );
  };

  const actualizarLoteLinea = (key: string, raw: string) => {
    const lote = raw.trim();
    if (!lote) return;
    setLineasCargue((prev) => prev.map((l) => (l.key === key ? { ...l, lote } : l)));
  };

  const actualizarPrecioCompraLinea = (key: string, raw: string) => {
    const p = parseFloat(raw.replace(/,/g, "."));
    if (!Number.isFinite(p) || p <= 0) return;
    setLineasCargue((prev) =>
      prev.map((l) => (l.key === key ? { ...l, precioCompraUnitario: Math.round(p * 100) / 100 } : l))
    );
  };

  const registrar = async () => {
    setMensajeOk(null);
    setError(null);
    if (!pv) return;
    if (lineasCargue.length === 0) {
      setError("Agregá al menos un producto a la lista con «Agregar a la lista».");
      return;
    }
    if (!fechaCargue.trim()) {
      setError("Indicá la fecha del cargue.");
      return;
    }
    const sinLote = lineasCargue.filter((l) => !l.lote.trim());
    if (sinLote.length > 0) {
      setError("Cada producto debe tener lote. Completá la columna Lote en la tabla.");
      return;
    }
    const sinPrecio = lineasCargue.filter((l) => !Number.isFinite(l.precioCompraUnitario) || l.precioCompraUnitario <= 0);
    if (sinPrecio.length > 0) {
      setError("Cada línea debe tener precio de compra unitario mayor que cero.");
      return;
    }
    setEnviando(true);
    const fecha = fechaCargue.trim();
    const notasBase = anotaciones;
    const keysOk: string[] = [];
    const fallos: string[] = [];
    for (const line of lineasCargue) {
      const r = await registrarMovimientoInventario({
        puntoVenta: pv,
        insumo: line.insumo,
        tipo: "cargue",
        cantidad: line.cantidad,
        notas: notasMovimientoCargueLinea(notasBase, line.lote),
        uid,
        email,
        fechaCargue: fecha,
        precioCompraUnitario: line.precioCompraUnitario,
      });
      if (r.ok) keysOk.push(line.key);
      else fallos.push(`${line.insumo.sku}: ${r.message ?? "error"}`);
    }
    setEnviando(false);
    setLineasCargue((prev) => prev.filter((l) => !keysOk.includes(l.key)));
    void cargarHistorialCargues();
    if (fallos.length > 0 && keysOk.length === 0) {
      setError(fallos.join(" "));
      return;
    }
    if (fallos.length > 0) {
      setError(`Se guardaron ${keysOk.length} ítem(s). Pendientes con error: ${fallos.join(" · ")}`);
      setMensajeOk("Revisá la lista: quitá o corregí lo que falló y volvé a registrar.");
      return;
    }
    setAnotaciones("");
    setCelebracionCargueKey((k) => k + 1);
    setCelebracionCargueN(keysOk.length);
  };

  if (!pv) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-950">
        Asigna un punto de venta en tu perfil para registrar cargues.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-8">
      {celebracionCargueN != null && celebracionCargueN > 0 && (
        <CargueCelebracionExito
          key={celebracionCargueKey}
          cantidadProductos={celebracionCargueN}
          onCerrar={() => setCelebracionCargueN(null)}
        />
      )}
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900">Cargue de inventario</h2>
        <p className="mt-2 text-sm text-gray-600">
          Registro rápido de entradas. Catálogo desde la{" "}
          <span className="font-medium text-gray-800">hoja de Google</span>
          {fuenteCat === "firestore" && (
            <>
              {" "}
              (respaldo:{" "}
              <code className="rounded bg-gray-100 px-1 text-xs">{CATALOGO_INSUMOS_KIT_COLLECTION}</code>
              )
            </>
          )}
          {fuenteCat === "sheet" && " (Google Sheets)"} ·{" "}
          <span className="font-semibold text-primary-700">{pv}</span>
        </p>
        <p className="mt-1 text-xs text-gray-500">
          Lo que guardes aquí también se ve en <strong className="font-medium text-gray-700">Inventarios → Historial</strong>.
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-2" role="tablist" aria-label="Tipo de cargue de inventario">
        <button
          type="button"
          role="tab"
          aria-selected={subVistaCargue === "detallado"}
          onClick={() => setSubVistaCargue("detallado")}
          className={`rounded-lg border px-4 py-2 text-sm font-semibold transition-colors ${
            subVistaCargue === "detallado"
              ? "border-brand-yellow/50 bg-brand-yellow/25 text-gray-900"
              : "border-transparent text-gray-600 hover:bg-gray-50"
          }`}
        >
          Cargue por producto y lote
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={subVistaCargue === "inicial"}
          onClick={() => setSubVistaCargue("inicial")}
          className={`rounded-lg border px-4 py-2 text-sm font-semibold transition-colors ${
            subVistaCargue === "inicial"
              ? "border-brand-yellow/50 bg-brand-yellow/25 text-gray-900"
              : "border-transparent text-gray-600 hover:bg-gray-50"
          }`}
        >
          Cargue inicial del punto de venta
        </button>
      </div>

      {subVistaCargue === "inicial" ? (
        <CargueInventarioMasivoPanel puntoVenta={puntoVenta} uid={uid} email={email} />
      ) : (
        <>
      <div className="rounded-2xl border-2 border-gray-200 bg-white p-6 shadow-sm md:p-8">
        {mensajeOk && (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            {mensajeOk}
          </div>
        )}
        {(error || errorCat) && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            {error ?? errorCat}
          </div>
        )}
        {sheetSetupAyuda && (
          <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50/95 px-4 py-3 text-left text-sm text-blue-950">
            <p className="font-semibold text-blue-900">Configuración única (administrador / TI)</p>
            <p className="mt-2 text-blue-900/95">
              Los cajeros <strong>no</strong> deben hacer esto. Con dos pasos en Google Cloud y en la hoja,{" "}
              <strong>todos</strong> los usuarios POS quedan cubiertos automáticamente.
            </p>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-blue-900/95">
              <li>
                <strong>Habilitar Google Sheets API</strong> en el proyecto{" "}
                <code className="rounded bg-white/80 px-1 text-xs">{sheetSetupAyuda.projectId || "—"}</code>:{" "}
                <a
                  href={sheetSetupAyuda.sheetsApiUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-blue-700 underline hover:text-blue-900"
                >
                  Abrir consola y activar la API
                </a>
                . Espera 1–3 minutos y recarga esta pantalla.
              </li>
              <li>
                <strong>Compartir la hoja de insumos</strong> con este correo (solo una vez, rol{" "}
                <em>Lector</em> o <em>Editor</em>):
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <code className="break-all rounded border border-blue-200 bg-white px-2 py-1 text-xs text-gray-900">
                    {sheetSetupAyuda.clientEmail}
                  </code>
                  <button
                    type="button"
                    onClick={() => void navigator.clipboard.writeText(sheetSetupAyuda.clientEmail)}
                    className="rounded-lg border border-blue-300 bg-white px-2 py-1 text-xs font-medium text-blue-800 hover:bg-blue-100"
                  >
                    Copiar correo
                  </button>
                </div>
              </li>
            </ol>
            <p className="mt-3 text-xs text-blue-900/85">{sheetSetupAyuda.shareOnceHint}</p>
            <p className="mt-2 text-xs text-blue-900/75">
              Guía detallada: <code className="rounded bg-white/70 px-1">docs/GOOGLE_SHEETS_AUTOMATIZAR_POS.md</code> en el
              repositorio del POS.
            </p>
          </div>
        )}

        <label className="mb-1 block text-sm font-semibold text-gray-800">Fecha del cargue</label>
        <input
          type="date"
          value={fechaCargue}
          onChange={(e) => setFechaCargue(e.target.value)}
          className="w-full max-w-xs rounded-xl border-2 border-gray-200 px-4 py-3 text-base focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
        />

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start lg:gap-8">
          {/* Columna izquierda: producto */}
          <section
            className="min-w-0 rounded-xl border border-gray-200 bg-gray-50/60 p-4 shadow-sm sm:p-5"
            aria-labelledby="cargue-col-producto"
          >
            <h3 id="cargue-col-producto" className="text-sm font-bold uppercase tracking-wide text-gray-800">
              Producto
            </h3>
            <p className="mt-1 text-xs text-gray-600">
              Buscá y tocá un ítem del catálogo. A la derecha cargá cantidad, lote y precio de compra por unidad, y pulsá
              «Agregar a la lista».
            </p>
            {insumoSel && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50/90 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <span className="font-mono text-xs text-emerald-900">{insumoSel.sku}</span>
                  <span className="text-emerald-950"> · {insumoSel.descripcion}</span>
                  <span className="text-emerald-800/90"> ({insumoSel.unidad})</span>
                </div>
                <button
                  type="button"
                  className="shrink-0 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
                  onClick={() => {
                    setInsumoId("");
                    setPanelSugerenciasAbierto(true);
                  }}
                >
                  Cambiar
                </button>
              </div>
            )}
            <label className="mt-4 block text-sm font-semibold text-gray-800">Buscar en catálogo</label>
            {/* Lista en flujo normal: evita recorte por overflow del layout de caja. */}
            <div ref={comboRef} className="mt-2">
              <div className="relative">
                <input
                  type="text"
                  value={busqueda}
                  onChange={(e) => {
                    setBusqueda(e.target.value);
                    setPanelSugerenciasAbierto(true);
                  }}
                  onFocus={() => setPanelSugerenciasAbierto(true)}
                  onBlur={() => {
                    window.setTimeout(() => setPanelSugerenciasAbierto(false), 200);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setPanelSugerenciasAbierto(false);
                  }}
                  placeholder="Ej. chorizo, FRAN-KIT o «arepa queso»…"
                  disabled={cargandoCat}
                  autoComplete="off"
                  enterKeyHint="search"
                  className={`w-full rounded-xl border-2 border-gray-200 bg-white py-3 text-base focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200 ${
                    busqueda.trim() ? "pl-4 pr-11" : "px-4"
                  }`}
                />
                {busqueda.trim() !== "" && (
                  <button
                    type="button"
                    aria-label="Limpiar búsqueda"
                    className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-lg leading-none text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setBusqueda("")}
                  >
                    ×
                  </button>
                )}
              </div>
              {panelSugerenciasAbierto && !cargandoCat && insumos.length > 0 && (
                <div
                  className="mt-2 max-h-64 w-full overflow-auto rounded-xl border-2 border-gray-200 bg-white py-1 shadow-md sm:max-h-72"
                  role="listbox"
                  aria-label="Productos del inventario"
                >
                  {sugerenciasOrdenadas.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-gray-500">No hay coincidencias con esa búsqueda.</p>
                  ) : (
                    <>
                      {hayMasInsumosSinFiltro && (
                        <p className="border-b border-gray-100 px-4 py-2 text-xs text-gray-500">
                          Mostrando los primeros {LISTA_SIN_FILTRO_MAX} en orden alfabético. Escribe para acotar.
                        </p>
                      )}
                      {sugerenciasOrdenadas.map((i) => (
                        <button
                          key={i.id}
                          type="button"
                          role="option"
                          aria-selected={insumoId === i.id}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setInsumoId(i.id);
                            setBusqueda("");
                            setPanelSugerenciasAbierto(false);
                          }}
                          className={`flex w-full flex-col items-start gap-0.5 border-b border-gray-50 px-4 py-2.5 text-left text-sm last:border-b-0 hover:bg-slate-100 ${
                            insumoId === i.id ? "bg-slate-100" : ""
                          }`}
                        >
                          <span className="font-mono text-xs text-gray-600">{i.sku}</span>
                          <span className="text-gray-900">{i.descripcion}</span>
                          <span className="text-xs text-gray-500">
                            {i.unidad}
                            {i.categoria ? ` · ${i.categoria}` : ""}
                          </span>
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* Columna derecha: cantidad y agregar */}
          <section
            className="min-w-0 rounded-xl border border-gray-200 bg-gray-50/60 p-4 shadow-sm sm:p-5"
            aria-labelledby="cargue-col-cantidad"
          >
            <h3 id="cargue-col-cantidad" className="text-sm font-bold uppercase tracking-wide text-gray-800">
              Cantidad y lote
            </h3>
            <p className="mt-1 text-xs text-gray-600">
              Misma fecha para todo el cargue. El lote es el del paquete que llegó. El precio de compra es por unidad
              (COP) y es obligatorio para valorizar el inventario. Podés sumar varios productos y al final registrás de
              una vez.
            </p>
            {/* Siempre 2 columnas: en móvil el lote quedaba abajo y parecía “faltar”. */}
            <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4">
              <div className="min-w-0">
                <label className="block text-sm font-semibold text-gray-800">Cantidad</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={cantidad}
                  onChange={(e) => setCantidad(e.target.value)}
                  placeholder={insumoSel ? "Ej. 10" : "—"}
                  disabled={!insumoSel}
                  className="mt-2 w-full min-w-0 rounded-xl border-2 border-gray-200 bg-white px-3 py-3 text-base tabular-nums focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:bg-gray-100 disabled:text-gray-400 sm:px-4"
                />
              </div>
              <div className="min-w-0">
                <label className="block text-sm font-semibold text-gray-800">Lote</label>
                <input
                  type="text"
                  value={loteLinea}
                  onChange={(e) => setLoteLinea(e.target.value)}
                  placeholder={insumoSel ? "Ej. L240315" : "—"}
                  disabled={!insumoSel}
                  autoComplete="off"
                  className="mt-2 w-full min-w-0 rounded-xl border-2 border-gray-200 bg-white px-3 py-3 text-base focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:bg-gray-100 disabled:text-gray-400 sm:px-4"
                />
              </div>
            </div>
            <div className="mt-3">
              <label className="block text-sm font-semibold text-gray-800">
                Precio de compra (COP / unidad) <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={precioLinea}
                onChange={(e) => setPrecioLinea(e.target.value)}
                placeholder={insumoSel ? "Ej. 8500" : "—"}
                disabled={!insumoSel}
                autoComplete="off"
                className="mt-2 w-full rounded-xl border-2 border-gray-200 bg-white px-3 py-3 text-base tabular-nums focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:bg-gray-100 disabled:text-gray-400 sm:px-4"
              />
            </div>
            {insumoSel ? (
              <p className="mt-3 text-sm text-gray-700">
                Unidad: <span className="font-semibold text-gray-900">{insumoSel.unidad}</span>
              </p>
            ) : (
              <p className="mt-3 text-xs text-gray-500">
                Seleccioná un producto en la columna «Producto» para cargar cantidad, lote y precio de compra.
              </p>
            )}
            <button
              type="button"
              onClick={agregarLineaALista}
              disabled={cargandoCat || !insumoSel}
              className="mt-5 w-full rounded-xl border-2 border-primary-600 bg-primary-600 py-3.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-primary-700 disabled:border-gray-300 disabled:bg-gray-200 disabled:text-gray-500 disabled:opacity-90"
            >
              Agregar a la lista
            </button>
          </section>
        </div>

        {lineasCargue.length > 0 && (
          <div className="mt-6">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <label className="text-sm font-semibold text-gray-800">Productos en este cargue ({lineasCargue.length})</label>
              <button
                type="button"
                onClick={() => setLineasCargue([])}
                className="text-xs font-semibold text-red-700 hover:underline"
              >
                Vaciar lista
              </button>
            </div>
            <div className="overflow-x-auto rounded-xl border-2 border-gray-200">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase text-gray-600">
                  <tr>
                    <th className="px-3 py-2">Código</th>
                    <th className="px-3 py-2">Descripción</th>
                    <th className="min-w-[6rem] px-3 py-2 text-right">Cantidad</th>
                    <th className="min-w-[7rem] px-3 py-2">Lote</th>
                    <th className="min-w-[7rem] px-3 py-2 text-right">Precio compra COP/u.</th>
                    <th className="w-20 px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {lineasCargue.map((line) => (
                    <tr key={line.key} className="bg-white">
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-gray-700">{line.insumo.sku}</td>
                      <td className="px-3 py-2 text-gray-900">
                        {line.insumo.descripcion}
                        <span className="block text-xs text-gray-500">({line.insumo.unidad})</span>
                      </td>
                      <td className="px-3 py-2 text-right align-middle">
                        <input
                          type="text"
                          inputMode="decimal"
                          defaultValue={String(line.cantidad)}
                          key={`${line.key}-c-${line.cantidad}`}
                          onBlur={(e) => {
                            const n = parseFloat(e.target.value.replace(/,/g, "."));
                            if (Number.isFinite(n) && n > 0) {
                              actualizarCantidadLinea(line.key, e.target.value);
                            } else {
                              e.currentTarget.value = String(line.cantidad);
                            }
                          }}
                          className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-right text-sm tabular-nums focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-200"
                          aria-label={`Cantidad ${line.insumo.sku}`}
                        />
                      </td>
                      <td className="px-3 py-2 align-middle">
                        <input
                          type="text"
                          defaultValue={line.lote}
                          key={`${line.key}-l-${line.lote}`}
                          onBlur={(e) => {
                            const t = e.target.value.trim();
                            if (t) {
                              actualizarLoteLinea(line.key, e.target.value);
                            } else {
                              e.currentTarget.value = line.lote;
                            }
                          }}
                          className="w-full min-w-[5rem] rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-200"
                          aria-label={`Lote ${line.insumo.sku}`}
                        />
                      </td>
                      <td className="px-3 py-2 text-right align-middle">
                        <input
                          type="text"
                          inputMode="decimal"
                          defaultValue={String(line.precioCompraUnitario)}
                          key={`${line.key}-p-${line.precioCompraUnitario}`}
                          onBlur={(e) => {
                            const n = parseFloat(e.target.value.replace(/,/g, "."));
                            if (Number.isFinite(n) && n > 0) {
                              actualizarPrecioCompraLinea(line.key, e.target.value);
                            } else {
                              e.currentTarget.value = String(line.precioCompraUnitario);
                            }
                          }}
                          className="w-full min-w-[5rem] rounded-lg border border-gray-300 px-2 py-1.5 text-right text-sm tabular-nums focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-200"
                          aria-label={`Precio compra ${line.insumo.sku}`}
                        />
                      </td>
                      <td className="px-3 py-2 align-middle">
                        <button
                          type="button"
                          onClick={() => quitarLinea(line.key)}
                          className="text-xs font-semibold text-red-700 hover:underline"
                        >
                          Quitar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <label className="mt-6 block text-sm font-semibold text-gray-800">Anotaciones (opcional)</label>
        <textarea
          value={anotaciones}
          onChange={(e) => setAnotaciones(e.target.value)}
          rows={3}
          placeholder="Remisión, proveedor, observaciones del cargue… (el lote va por producto arriba)"
          className="mt-2 w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-base focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
        />

        <button
          type="button"
          onClick={() => void registrar()}
          disabled={enviando || cargandoCat || insumos.length === 0 || lineasCargue.length === 0}
          className="mt-8 w-full rounded-xl bg-brand-yellow py-4 text-lg font-bold text-gray-900 shadow-md transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {enviando
            ? "Guardando…"
            : lineasCargue.length > 0
              ? `Registrar cargue (${lineasCargue.length} producto${lineasCargue.length === 1 ? "" : "s"})`
              : "Registrar cargue"}
        </button>

        <button
          type="button"
          onClick={() => void cargarCatalogo()}
          disabled={cargandoCat}
          className="mt-3 w-full rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {cargandoCat ? "Cargando catálogo…" : "Actualizar lista de productos"}
        </button>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm md:p-6">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-base font-bold text-gray-900">Historial de cargues</h3>
          <button
            type="button"
            onClick={() => void cargarHistorialCargues()}
            disabled={cargandoHist}
            className="text-sm font-semibold text-primary-600 hover:underline disabled:opacity-50"
          >
            {cargandoHist ? "…" : "Actualizar"}
          </button>
        </div>
        <p className="mb-3 text-xs text-gray-500">Solo movimientos tipo «{etiquetaTipoMovimiento("cargue")}» en este punto de venta.</p>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase text-gray-600">
              <tr>
                <th className="px-3 py-2">Registro</th>
                <th className="px-3 py-2">Fecha cargue</th>
                <th className="px-3 py-2">Producto</th>
                <th className="px-3 py-2 text-right">Cant.</th>
                <th className="px-3 py-2 text-right">P. compra COP/u.</th>
                <th className="px-3 py-2">Anotaciones</th>
                <th className="w-14 px-2 py-2 text-center">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {cargandoHist ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-gray-500">
                    Cargando…
                  </td>
                </tr>
              ) : historialCargue.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-gray-500">
                    Aún no hay cargues registrados.
                  </td>
                </tr>
              ) : (
                historialCargue.map((m) => (
                  <tr key={m.id} className="hover:bg-gray-50/80">
                    <td className="whitespace-nowrap px-3 py-2 text-gray-600">{formatMovFecha(m.createdAt)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-gray-800">{formatFechaCargueMostrar(m.fechaCargue)}</td>
                    <td className="px-3 py-2">
                      <span className="font-mono text-xs text-gray-600">{m.insumoSku}</span>
                      <br />
                      <span className="text-gray-900">{m.insumoDescripcion}</span>
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-emerald-700">
                      +{m.delta.toLocaleString("es-CO", { maximumFractionDigits: 3 })}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-800">
                      {m.precioCompraUnitario != null && Number.isFinite(m.precioCompraUnitario)
                        ? m.precioCompraUnitario.toLocaleString("es-CO", {
                            style: "currency",
                            currency: "COP",
                            maximumFractionDigits: 0,
                          })
                        : "—"}
                    </td>
                    <td className="max-w-[180px] truncate px-3 py-2 text-xs text-gray-600" title={m.notas}>
                      {m.notas || "—"}
                    </td>
                    <td className="px-2 py-2 text-center align-middle">
                      <button
                        type="button"
                        onClick={() => abrirDetalleCargue(m)}
                        className="inline-flex rounded-lg p-2 text-primary-600 hover:bg-primary-50 focus:outline-none focus:ring-2 focus:ring-primary-300"
                        aria-label={`Ver detalle y corregir cargue ${m.insumoSku}`}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          className="h-5 w-5"
                          aria-hidden
                        >
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
        </>
      )}

      {movDetalle && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="detalle-cargue-titulo"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/45"
            onClick={cerrarDetalleCargue}
            aria-label="Cerrar detalle"
          />
          <div
            className="relative z-10 flex max-h-[min(90vh,720px)] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-2xl sm:max-h-[85vh] sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
              <div className="min-w-0">
                <h2 id="detalle-cargue-titulo" className="text-lg font-bold text-gray-900">
                  Detalle del cargue
                </h2>
                <p className="mt-1 text-xs text-gray-500">
                  Corregí cantidad, fecha o notas; el inventario se ajusta y queda registro de cada cambio.
                </p>
              </div>
              <button
                type="button"
                onClick={cerrarDetalleCargue}
                className="shrink-0 rounded-lg px-2 py-1 text-sm font-semibold text-gray-600 hover:bg-gray-100"
              >
                Cerrar
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <dl className="grid gap-2 text-sm">
                <div>
                  <dt className="text-xs font-semibold uppercase text-gray-500">Producto</dt>
                  <dd className="mt-0.5 font-mono text-xs text-gray-600">{movDetalle.insumoSku}</dd>
                  <dd className="text-gray-900">{movDetalle.insumoDescripcion}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase text-gray-500">Registrado en sistema</dt>
                  <dd className="text-gray-700">{formatMovFecha(movDetalle.createdAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase text-gray-500">Precio de compra unitario</dt>
                  <dd className="tabular-nums text-gray-800">
                    {movDetalle.precioCompraUnitario != null && Number.isFinite(movDetalle.precioCompraUnitario)
                      ? movDetalle.precioCompraUnitario.toLocaleString("es-CO", {
                          style: "currency",
                          currency: "COP",
                          maximumFractionDigits: 0,
                        })
                      : "— (cargues antiguos pueden no tenerlo)"}
                  </dd>
                </div>
              </dl>

              <div className="mt-5 space-y-4 border-t border-gray-100 pt-5">
                <div>
                  <label htmlFor="edit-cargue-cantidad" className="block text-sm font-semibold text-gray-800">
                    Cantidad cargada
                  </label>
                  <input
                    id="edit-cargue-cantidad"
                    type="text"
                    inputMode="decimal"
                    value={editCantidad}
                    onChange={(e) => setEditCantidad(e.target.value)}
                    className="mt-2 w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 text-base tabular-nums focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  />
                </div>
                <div>
                  <label htmlFor="edit-cargue-fecha" className="block text-sm font-semibold text-gray-800">
                    Fecha del cargue
                  </label>
                  <input
                    id="edit-cargue-fecha"
                    type="date"
                    value={editFechaCargue}
                    onChange={(e) => setEditFechaCargue(e.target.value)}
                    className="mt-2 w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 text-base focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  />
                  <p className="mt-1 text-xs text-gray-500">Dejá el campo vacío para quitar la fecha en este movimiento.</p>
                </div>
                <div>
                  <label htmlFor="edit-cargue-notas" className="block text-sm font-semibold text-gray-800">
                    Anotaciones
                  </label>
                  <textarea
                    id="edit-cargue-notas"
                    value={editNotas}
                    onChange={(e) => setEditNotas(e.target.value)}
                    rows={3}
                    maxLength={500}
                    className="mt-2 w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 text-base focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  />
                </div>
              </div>

              {(() => {
                const log = [...(movDetalle.edicionesLog ?? [])].sort((a, b) => {
                  const sa =
                    a.en && typeof (a.en as { seconds?: number }).seconds === "number"
                      ? (a.en as { seconds: number }).seconds
                      : 0;
                  const sb =
                    b.en && typeof (b.en as { seconds?: number }).seconds === "number"
                      ? (b.en as { seconds: number }).seconds
                      : 0;
                  return sa - sb;
                });
                if (log.length === 0) return null;
                return (
                  <div className="mt-6 border-t border-gray-100 pt-5">
                    <h3 className="text-sm font-bold text-gray-900">Historial de correcciones</h3>
                    <ul className="mt-3 space-y-3 text-sm">
                      {log.map((entry, idx) => (
                        <li key={`${idx}-${entry.texto}`} className="rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2">
                          <p className="text-xs text-gray-500">
                            {formatLogEdicionEn(entry.en)}
                            {entry.email ? ` · ${entry.email}` : entry.uid ? ` · ${entry.uid}` : ""}
                          </p>
                          <p className="mt-1 text-gray-800">{entry.texto}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })()}

              {errorEdicion && (
                <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  {errorEdicion}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2 border-t border-gray-100 px-5 py-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={cerrarDetalleCargue}
                disabled={guardandoEdicion}
                className="rounded-xl border-2 border-gray-200 py-3 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50 sm:px-6"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void guardarEdicionCargue()}
                disabled={guardandoEdicion}
                className="rounded-xl bg-primary-600 py-3 text-sm font-bold text-white shadow-sm hover:bg-primary-700 disabled:opacity-50 sm:px-6"
              >
                {guardandoEdicion ? "Guardando…" : "Guardar cambios"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
