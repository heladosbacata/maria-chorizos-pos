"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { fetchCatalogoInsumosDesdeSheet } from "@/lib/catalogo-insumos-sheet-client";
import { getCatalogoPOS } from "@/lib/catalogo-pos";
import { db } from "@/lib/firebase";
import {
  escribirMinimoInventarioLocal,
  leerMinimosInventarioLocal,
} from "@/lib/inventario-minimos-local-storage";
import { mergeCatalogoInventarioConProductosPos } from "@/lib/inventario-pos-catalogo";
import type { InsumoKitItem, InventarioMovimientoDoc, TipoMovimientoInventario } from "@/types/inventario-pos";
import { fechaColombia, fechaHoraColombia, mediodiaColombiaDesdeYmd } from "@/lib/fecha-colombia";
import { normPuntoVentaCatalogo } from "@/lib/punto-venta-catalogo-norm";
import {
  CATALOGO_INSUMOS_KIT_COLLECTION,
  etiquetaTipoMovimiento,
  listarInsumosKitPorPuntoVenta,
  listarMovimientosInventario,
  listarMovimientosRecientesPorInsumoKit,
  listarSaldosInventarioConFuentePorPuntoVenta,
  mapSaldosLegacyYEnsambleConFuente,
  mergeSaldosInventarioLegacyYEnsamble,
  NOTAS_PREFIJO_AJUSTE_SALDO_STOCK,
  normSkuInventario,
  POS_INVENTARIO_ENSAMBLE_SALDOS_COLLECTION,
  POS_INVENTARIO_SALDOS_COLLECTION,
  querySnapshotToSaldoRows,
  registrarMovimientoInventario,
  saldoMostradoYFuenteParaInsumoKit,
  type InventarioSaldoConFuente,
  type InventarioSaldoRow,
} from "@/lib/inventario-pos-firestore";
import {
  leerUltimoEnsambleSesion,
  skuBaseDesdeSkuProductoEnsamble,
  type UltimoEnsambleSesionDiag,
} from "@/lib/wms-aplicar-venta-ensamble";

type Pestaña = "stock" | "movimiento" | "historial";

/** Tipos disponibles en «Registrar movimiento». El cargue va en el módulo «Cargue inventario». */
const TIPOS_MOVIMIENTO: { value: TipoMovimientoInventario; label: string; ayuda: string }[] = [
  { value: "salida_danio", label: "Salida por daño", ayuda: "Baja autorizada por producto dañado." },
  { value: "ajuste_positivo", label: "Ajuste a más", ayuda: "Corrección tras conteo físico (sobra)." },
  { value: "ajuste_negativo", label: "Ajuste a menos", ayuda: "Corrección tras conteo físico (falta)." },
  { value: "merma", label: "Merma / vencimiento", ayuda: "Pérdida por vencimiento u obsolescencia." },
  { value: "consumo_interno", label: "Consumo interno", ayuda: "Uso en tienda (degustación, preparación, etc.)." },
];

function formatMovFecha(createdAt: unknown): string {
  if (!createdAt || typeof createdAt !== "object") return "—";
  const s = (createdAt as { seconds?: number }).seconds;
  if (typeof s !== "number") return "—";
  return fechaHoraColombia(new Date(s * 1000), {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function formatFechaCargueHistorial(iso: string | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "—";
  const dt = mediodiaColombiaDesdeYmd(iso);
  if (Number.isNaN(dt.getTime())) return "—";
  return fechaColombia(dt, { dateStyle: "medium" });
}

/** Clave para desbloquear el ajuste de saldo al hacer clic en «Saldo actual» (pantalla Inventarios). */
const CLAVE_AJUSTE_SALDO_INVENTARIO = "MC2026";

export interface InventarioPosModuleProps {
  puntoVenta: string | null;
  uid: string;
  email: string | null;
}

export default function InventarioPosModule({ puntoVenta, uid, email }: InventarioPosModuleProps) {
  const [pestaña, setPestaña] = useState<Pestaña>("stock");
  const [insumos, setInsumos] = useState<InsumoKitItem[]>([]);
  const [saldoRows, setSaldoRows] = useState<InventarioSaldoRow[]>([]);
  const [saldosPorClaveMap, setSaldosPorClaveMap] = useState<Map<string, InventarioSaldoConFuente>>(
    () => new Map()
  );
  const [minimosUsuario, setMinimosUsuario] = useState<Map<string, number>>(new Map());
  const [fuenteCatalogo, setFuenteCatalogo] = useState<"sheet" | "firestore" | "wms" | null>(null);
  const [incluyeCatalogoPos, setIncluyeCatalogoPos] = useState(false);
  const [productosPosAgregados, setProductosPosAgregados] = useState(0);
  const [avisoCatalogo, setAvisoCatalogo] = useState<string | null>(null);
  const [avisoPvHoja, setAvisoPvHoja] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mensajeOk, setMensajeOk] = useState<string | null>(null);
  const [guardandoMinimoSku, setGuardandoMinimoSku] = useState<string | null>(null);
  /** Remonta inputs de mínimo cuando el usuario vacía el campo y solo aplica la hoja. */
  const [minInputTick, setMinInputTick] = useState(0);

  const [busqueda, setBusqueda] = useState("");
  const [categoriaFiltro, setCategoriaFiltro] = useState("");
  const [movInsumoId, setMovInsumoId] = useState("");
  const [movTipo, setMovTipo] = useState<TipoMovimientoInventario>("salida_danio");
  const [movCantidad, setMovCantidad] = useState("");
  const [movNotas, setMovNotas] = useState("");
  const [enviandoMov, setEnviandoMov] = useState(false);

  const [historial, setHistorial] = useState<Awaited<ReturnType<typeof listarMovimientosInventario>>>([]);
  const [cargandoHist, setCargandoHist] = useState(false);
  const [diagEnsamble, setDiagEnsamble] = useState<UltimoEnsambleSesionDiag | null>(null);

  type AjusteSaldoModalState = { fase: "clave" | "formulario"; insumo: InsumoKitItem; saldoAlAbrir: number };
  const [ajusteSaldoModal, setAjusteSaldoModal] = useState<AjusteSaldoModalState | null>(null);
  const [claveAjusteSaldoInput, setClaveAjusteSaldoInput] = useState("");
  const [claveAjusteSaldoVisible, setClaveAjusteSaldoVisible] = useState(false);
  const [errorClaveAjuste, setErrorClaveAjuste] = useState<string | null>(null);
  const [nuevoSaldoAjusteInput, setNuevoSaldoAjusteInput] = useState("");
  const [notasAjusteSaldo, setNotasAjusteSaldo] = useState("");
  const [guardandoAjusteSaldo, setGuardandoAjusteSaldo] = useState(false);

  const [detalleMovsModalItem, setDetalleMovsModalItem] = useState<InsumoKitItem | null>(null);
  const [detalleMovsRows, setDetalleMovsRows] = useState<InventarioMovimientoDoc[]>([]);
  const [detalleMovsCargando, setDetalleMovsCargando] = useState(false);
  const [detalleMovsError, setDetalleMovsError] = useState<string | null>(null);

  const pv = (puntoVenta ?? "").replace(/\u00a0/g, " ").trim();

  const refrescarDiagEnsamble = useCallback(() => {
    setDiagEnsamble(leerUltimoEnsambleSesion());
  }, []);

  useEffect(() => {
    refrescarDiagEnsamble();
    const onEvt = () => refrescarDiagEnsamble();
    window.addEventListener("pos-ultimo-ensamble-actualizado", onEvt);
    return () => window.removeEventListener("pos-ultimo-ensamble-actualizado", onEvt);
  }, [refrescarDiagEnsamble]);

  const cargarTodo = useCallback(async () => {
    if (!pv) {
      setInsumos([]);
      setSaldoRows([]);
      setSaldosPorClaveMap(new Map());
      setMinimosUsuario(new Map());
      setFuenteCatalogo(null);
      setIncluyeCatalogoPos(false);
      setProductosPosAgregados(0);
      setAvisoCatalogo(null);
      setAvisoPvHoja(null);
      setCargando(false);
      setError("No hay punto de venta asignado. Completa tu perfil o elige punto de venta al iniciar sesión.");
      return;
    }
    setCargando(true);
    setError(null);
    setAvisoCatalogo(null);
    setAvisoPvHoja(null);
    try {
      const [sheetRes, saldosPack, posRes] = await Promise.all([
        fetchCatalogoInsumosDesdeSheet(pv),
        listarSaldosInventarioConFuentePorPuntoVenta(pv),
        getCatalogoPOS(),
      ]);
      const productosPos = posRes.ok ? posRes.productos ?? [] : [];
      setSaldoRows(saldosPack.saldoRows);
      setSaldosPorClaveMap(saldosPack.porClave);
      setMinimosUsuario(leerMinimosInventarioLocal(uid, pv));
      setIncluyeCatalogoPos(productosPos.length > 0);

      if (sheetRes.ok && sheetRes.data.length > 0) {
        const merged = mergeCatalogoInventarioConProductosPos(sheetRes.data, productosPos);
        setInsumos(merged.items);
        setFuenteCatalogo("sheet");
        setProductosPosAgregados(merged.agregados);
        setError(null);
        if (sheetRes.pvFiltroSinCoincidencias) {
          setAvisoPvHoja(
            `Ninguna fila de la hoja tenía el punto de venta «${pv}» en la columna PV (o el texto no coincidía). Se muestran todos los productos de la hoja; revisá la columna PV o el código en tu perfil.`
          );
        }
      } else {
        const lista = await listarInsumosKitPorPuntoVenta(pv);
        const merged = mergeCatalogoInventarioConProductosPos(lista, productosPos);
        setInsumos(merged.items);
        setProductosPosAgregados(merged.agregados);
        setFuenteCatalogo(lista.length > 0 ? "firestore" : productosPos.length > 0 ? "wms" : "firestore");
        if (merged.items.length === 0) {
          setError(
            `No hay ítems en la hoja ni en «${CATALOGO_INSUMOS_KIT_COLLECTION}» para «${pv}». Revisá la hoja DB_Franquicia_Insumos_Kit (columna PV si aplica) o documentos en Firestore.`
          );
        } else if (lista.length === 0 && productosPos.length > 0) {
          setAvisoCatalogo(
            "No se encontró catálogo base de insumos para este punto. Se muestran también los productos del catálogo POS (DB_POS_Productos / WMS) para que queden reflejados en Inventarios."
          );
        } else if (sheetRes.message) {
          setAvisoCatalogo(
            `No se pudo leer la hoja de insumos (${sheetRes.message}). Se muestra el catálogo de Firestore «${CATALOGO_INSUMOS_KIT_COLLECTION}».`
          );
        }
      }
    } catch {
      setError("No se pudo cargar el catálogo de insumos.");
      setInsumos([]);
      setFuenteCatalogo(null);
      setIncluyeCatalogoPos(false);
      setProductosPosAgregados(0);
    } finally {
      setCargando(false);
      refrescarDiagEnsamble();
    }
  }, [pv, uid, refrescarDiagEnsamble]);

  const commitMinimoSugerido = useCallback(
    (item: InsumoKitItem, raw: string, teniaMinimoUsuario: boolean, minimoEfectivoEnFila: number | null) => {
      if (!pv || !uid.trim()) return;
      const t = raw.trim();
      const k = normSkuInventario(item.sku);
      setGuardandoMinimoSku(k);
      setMensajeOk(null);
      setError(null);
      try {
        if (t === "") {
          if (!teniaMinimoUsuario) {
            setMinInputTick((x) => x + 1);
            return;
          }
          const ok = escribirMinimoInventarioLocal(uid, pv, item.sku, null);
          if (!ok) {
            setError("No se pudo guardar en este equipo (memoria local bloqueada o llena).");
            return;
          }
          setMinimosUsuario((prev) => {
            const n = new Map(prev);
            n.delete(k);
            return n;
          });
          setMensajeOk("Se quitó tu ajuste en este equipo; vuelve a aplicarse el mínimo de la hoja si existe.");
          return;
        }
        const num = parseFloat(t.replace(/,/g, "."));
        if (!Number.isFinite(num) || num < 0) {
          setError("El mínimo debe ser un número mayor o igual a cero.");
          setMinInputTick((x) => x + 1);
          return;
        }
        const redondeado = Math.round(num * 1000) / 1000;
        if (minimoEfectivoEnFila != null && Math.abs(redondeado - minimoEfectivoEnFila) < 1e-9) {
          return;
        }
        const ok = escribirMinimoInventarioLocal(uid, pv, item.sku, redondeado);
        if (!ok) {
          setError("No se pudo guardar en este equipo (memoria local bloqueada o llena).");
          setMinInputTick((x) => x + 1);
          return;
        }
        setMinimosUsuario((prev) => new Map(prev).set(k, redondeado));
        setMensajeOk("Mínimo guardado en este equipo (solo este navegador / usuario).");
      } finally {
        setGuardandoMinimoSku(null);
      }
    },
    [pv, uid]
  );

  useEffect(() => {
    void cargarTodo();
  }, [cargarTodo]);

  /** Sincroniza saldos en tiempo real: tras cobrar, el WMS escribe en `pos_inventario_ensamble_saldo` y la grilla se actualiza sin pulsar «Actualizar stock». */
  useEffect(() => {
    if (!pv || !db) return;
    let legacy: InventarioSaldoRow[] = [];
    let ensPorPv: InventarioSaldoRow[] = [];
    let ensPorClave: InventarioSaldoRow[] = [];
    const pushMerged = () => {
      const ens = mergeSaldosInventarioLegacyYEnsamble(ensPorPv, ensPorClave);
      const mapFuente = mapSaldosLegacyYEnsambleConFuente(legacy, ens);
      setSaldosPorClaveMap(mapFuente);
      setSaldoRows(Array.from(mapFuente.values()).map((v) => v.row));
    };
    const qLeg = query(collection(db, POS_INVENTARIO_SALDOS_COLLECTION), where("puntoVenta", "==", pv));
    const unsubLeg = onSnapshot(
      qLeg,
      (snap) => {
        legacy = querySnapshotToSaldoRows(snap);
        pushMerged();
      },
      () => {
        legacy = [];
        pushMerged();
      }
    );
    const qEns = query(collection(db, POS_INVENTARIO_ENSAMBLE_SALDOS_COLLECTION), where("puntoVenta", "==", pv));
    const unsubEns = onSnapshot(
      qEns,
      (snap) => {
        ensPorPv = querySnapshotToSaldoRows(snap);
        pushMerged();
      },
      () => {
        ensPorPv = [];
        pushMerged();
      }
    );
    const pvClave = normPuntoVentaCatalogo(pv);
    const qEnsClave =
      pvClave.length > 0
        ? query(collection(db, POS_INVENTARIO_ENSAMBLE_SALDOS_COLLECTION), where("puntoVentaClave", "==", pvClave))
        : null;
    const unsubEnsClave =
      qEnsClave != null
        ? onSnapshot(
            qEnsClave,
            (snap) => {
              ensPorClave = querySnapshotToSaldoRows(snap);
              pushMerged();
            },
            () => {
              ensPorClave = [];
              pushMerged();
            }
          )
        : null;
    return () => {
      unsubLeg();
      unsubEns();
      unsubEnsClave?.();
    };
  }, [pv]);

  const cargarHistorial = useCallback(async () => {
    if (!pv) return;
    setCargandoHist(true);
    try {
      const rows = await listarMovimientosInventario(pv, 150);
      setHistorial(rows);
    } catch {
      setHistorial([]);
    } finally {
      setCargandoHist(false);
    }
  }, [pv]);

  useEffect(() => {
    if ((pestaña === "stock" || pestaña === "historial") && pv) void cargarHistorial();
  }, [pestaña, pv, cargarHistorial]);

  const historialAjustesSaldoDesdeStock = useMemo(() => {
    return historial.filter(
      (m) =>
        (m.tipo === "ajuste_positivo" || m.tipo === "ajuste_negativo") &&
        m.notas.trimStart().startsWith(NOTAS_PREFIJO_AJUSTE_SALDO_STOCK)
    );
  }, [historial]);

  const abrirDetalleMovimientosProducto = useCallback(
    (item: InsumoKitItem) => {
      if (!pv) return;
      setDetalleMovsModalItem(item);
      setDetalleMovsRows([]);
      setDetalleMovsError(null);
      setDetalleMovsCargando(true);
      void listarMovimientosRecientesPorInsumoKit(pv, item, { maxScan: 500, maxResultados: 60 })
        .then((rows) => setDetalleMovsRows(rows))
        .catch(() => setDetalleMovsError("No se pudo cargar el historial de movimientos."))
        .finally(() => setDetalleMovsCargando(false));
    },
    [pv]
  );

  const cerrarDetalleMovimientosProducto = useCallback(() => {
    setDetalleMovsModalItem(null);
    setDetalleMovsRows([]);
    setDetalleMovsError(null);
  }, []);

  const cerrarModalAjusteSaldo = useCallback(() => {
    setAjusteSaldoModal(null);
    setClaveAjusteSaldoInput("");
    setClaveAjusteSaldoVisible(false);
    setErrorClaveAjuste(null);
    setNuevoSaldoAjusteInput("");
    setNotasAjusteSaldo("");
  }, []);

  const abrirModalAjusteSaldo = useCallback((insumo: InsumoKitItem, saldoAlAbrir: number) => {
    setMensajeOk(null);
    setError(null);
    setClaveAjusteSaldoInput("");
    setClaveAjusteSaldoVisible(false);
    setErrorClaveAjuste(null);
    setNuevoSaldoAjusteInput(String(saldoAlAbrir));
    setNotasAjusteSaldo("");
    setAjusteSaldoModal({ fase: "clave", insumo, saldoAlAbrir });
  }, []);

  const validarClaveYMostrarFormularioAjuste = useCallback(() => {
    if (!ajusteSaldoModal) return;
    if (claveAjusteSaldoInput.trim() !== CLAVE_AJUSTE_SALDO_INVENTARIO) {
      setErrorClaveAjuste("Clave incorrecta.");
      return;
    }
    setErrorClaveAjuste(null);
    setNuevoSaldoAjusteInput(String(ajusteSaldoModal.saldoAlAbrir));
    setAjusteSaldoModal({ ...ajusteSaldoModal, fase: "formulario" });
  }, [ajusteSaldoModal, claveAjusteSaldoInput]);

  const confirmarAjusteSaldoDesdeModal = useCallback(async () => {
    const m = ajusteSaldoModal;
    if (!m || m.fase !== "formulario" || !pv) return;
    const n = parseFloat(nuevoSaldoAjusteInput.replace(/,/g, "."));
    if (!Number.isFinite(n)) {
      setError("Indicá un saldo numérico válido.");
      return;
    }
    const redondeado = Math.round(n * 1000) / 1000;
    const diff = redondeado - m.saldoAlAbrir;
    if (Math.abs(diff) < 1e-9) {
      cerrarModalAjusteSaldo();
      setMensajeOk("Sin cambios respecto al saldo actual.");
      return;
    }
    setGuardandoAjusteSaldo(true);
    setError(null);
    const sufijo = notasAjusteSaldo.trim();
    const notasMov = `${NOTAS_PREFIJO_AJUSTE_SALDO_STOCK}${sufijo ? ` ${sufijo}` : ""}`.slice(0, 500);
    const r =
      diff > 0
        ? await registrarMovimientoInventario({
            puntoVenta: pv,
            insumo: m.insumo,
            tipo: "ajuste_positivo",
            cantidad: diff,
            notas: notasMov,
            uid,
            email,
            permitirNegativo: true,
          })
        : await registrarMovimientoInventario({
            puntoVenta: pv,
            insumo: m.insumo,
            tipo: "ajuste_negativo",
            cantidad: Math.abs(diff),
            notas: notasMov,
            uid,
            email,
            permitirNegativo: true,
          });
    setGuardandoAjusteSaldo(false);
    if (!r.ok) {
      setError(r.message ?? "No se pudo registrar el ajuste.");
      return;
    }
    cerrarModalAjusteSaldo();
    setMensajeOk("Ajuste de saldo registrado.");
    void cargarHistorial();
  }, [
    ajusteSaldoModal,
    pv,
    nuevoSaldoAjusteInput,
    notasAjusteSaldo,
    uid,
    email,
    cerrarModalAjusteSaldo,
    cargarHistorial,
  ]);

  const filasStock = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const categoriaActiva = categoriaFiltro.trim().toLowerCase();
    const base = insumos.map((i) => {
      const { saldo, editable: saldoEditableClic, costoUnitarioReferencia } = saldoMostradoYFuenteParaInsumoKit(
        i,
        saldosPorClaveMap,
        saldoRows
      );
      const skuK = normSkuInventario(i.sku);
      const minUsuario = minimosUsuario.get(skuK);
      const minSheet = i.minimoSugeridoSheet;
      const minimoEfectivo = minUsuario ?? minSheet ?? null;
      const bajoMinimo = minimoEfectivo != null && saldo < minimoEfectivo;
      const valorStockAprox =
        costoUnitarioReferencia != null && Number.isFinite(saldo)
          ? Math.round(saldo * costoUnitarioReferencia * 100) / 100
          : null;
      return {
        ...i,
        saldo,
        saldoEditableClic,
        costoUnitarioReferencia,
        valorStockAprox,
        minimoEfectivo,
        minimoUsuario: minUsuario,
        minimoSheet: minSheet,
        bajoMinimo,
      };
    });
    return base.filter((r) => {
      const coincideCategoria =
        !categoriaActiva || (r.categoria?.trim().toLowerCase() ?? "") === categoriaActiva;
      if (!coincideCategoria) return false;
      if (!q) return true;
      return (
        r.sku.toLowerCase().includes(q) ||
        r.descripcion.toLowerCase().includes(q) ||
        (r.categoria && r.categoria.toLowerCase().includes(q))
      );
    });
  }, [insumos, saldoRows, saldosPorClaveMap, minimosUsuario, busqueda, categoriaFiltro]);

  const categoriasDisponibles = useMemo(() => {
    return Array.from(
      new Set(insumos.map((i) => i.categoria?.trim()).filter((categoria): categoria is string => Boolean(categoria)))
    ).sort((a, b) => a.localeCompare(b, "es"));
  }, [insumos]);

  const cantidadBajoMinimo = useMemo(() => filasStock.filter((r) => r.bajoMinimo).length, [filasStock]);

  const totalInventarioValorizado = useMemo(() => {
    let t = 0;
    for (const r of filasStock) {
      if (r.costoUnitarioReferencia != null && Number.isFinite(r.saldo)) {
        t += r.saldo * r.costoUnitarioReferencia;
      }
    }
    return Math.round(t);
  }, [filasStock]);

  const insumoSeleccionable = useMemo(() => {
    return insumos.find((i) => i.id === movInsumoId) ?? null;
  }, [insumos, movInsumoId]);

  const enviarMovimiento = async () => {
    setMensajeOk(null);
    if (!pv) return;
    const ins = insumoSeleccionable;
    if (!ins) {
      setMensajeOk(null);
      setError("Selecciona un producto del catálogo.");
      return;
    }
    const cant = parseFloat(movCantidad.replace(/,/g, "."));
    if (!Number.isFinite(cant) || cant <= 0) {
      setError("Indica una cantidad numérica mayor que cero.");
      return;
    }
    setEnviandoMov(true);
    setError(null);
    const r = await registrarMovimientoInventario({
      puntoVenta: pv,
      insumo: ins,
      tipo: movTipo,
      cantidad: cant,
      notas: movNotas,
      uid,
      email,
      permitirNegativo: false,
    });
    setEnviandoMov(false);
    if (!r.ok) {
      setError(r.message ?? "Error al registrar.");
      return;
    }
    setMensajeOk("Movimiento registrado correctamente.");
    setMovCantidad("");
    setMovNotas("");
    await cargarTodo();
    void cargarHistorial();
  };

  if (!pv) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-950">
        Asigna un punto de venta para usar inventarios.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-200 pb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 md:text-2xl">Inventarios</h2>
          {fuenteCatalogo && (
            <p className="mt-2 text-xs font-medium text-primary-700">
              Catálogo activo:{" "}
              {fuenteCatalogo === "sheet"
                ? "hoja Google (DB_Franquicia_Insumos_Kit)"
                : fuenteCatalogo === "firestore"
                  ? `Firestore «${CATALOGO_INSUMOS_KIT_COLLECTION}»`
                  : "catálogo POS (DB_POS_Productos / WMS)"}
              {incluyeCatalogoPos && fuenteCatalogo !== "wms" ? " + catálogo POS (WMS)" : ""}
              {productosPosAgregados > 0 ? ` · ${productosPosAgregados} producto(s) POS agregados` : ""}
            </p>
          )}
          <p className="mt-2 text-xs font-medium text-primary-700">Punto de venta: {pv}</p>
          {diagEnsamble && (
            <details className="mt-3 max-w-2xl rounded-lg border border-slate-200 bg-slate-50/90 px-3 py-2 text-xs text-slate-800">
              <summary className="cursor-pointer select-none font-semibold text-slate-900">
                Diagnóstico último cobro (WMS ensamble)
              </summary>
              <dl className="mt-2 space-y-1.5 border-t border-slate-200/80 pt-2 font-mono text-[11px] leading-relaxed">
                <div>
                  <dt className="inline text-slate-500">Hora: </dt>
                  <dd className="inline">
                    {fechaHoraColombia(new Date(diagEnsamble.atIso), { dateStyle: "short", timeStyle: "medium" })}{" "}
                    <span className="text-slate-500">({diagEnsamble.atIso})</span>
                  </dd>
                </div>
                {diagEnsamble.idVenta && (
                  <div>
                    <dt className="inline text-slate-500">idVenta POS: </dt>
                    <dd className="inline break-all">{diagEnsamble.idVenta}</dd>
                  </div>
                )}
                <div>
                  <dt className="inline text-slate-500">Respuesta: </dt>
                  <dd className="inline">
                    {diagEnsamble.ok ? "ok" : "error"} · HTTP {diagEnsamble.status}
                    {diagEnsamble.aplicadosCount != null ? ` · aplicados: ${diagEnsamble.aplicadosCount}` : ""}
                  </dd>
                </div>
                {diagEnsamble.ok && diagEnsamble.aplicadosCount == null && (
                  <div className="rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-amber-950">
                    El WMS respondió bien pero <strong className="font-semibold">no envió el campo «aplicados»</strong>. No
                    podemos confirmar desde el POS si hubo descuento; revisá saldos,{" "}
                    <code className="rounded bg-white px-0.5">message</code> /{" "}
                    <code className="rounded bg-white px-0.5">detalle</code> y los logs del WMS.
                  </div>
                )}
                {diagEnsamble.ok && diagEnsamble.aplicadosCount === 0 && (
                  <div className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-red-950">
                    <strong className="font-semibold">aplicados: 0</strong> — no hubo líneas de composición aplicadas. Lo
                    habitual es que en <strong className="font-medium">DB_POS_Composición</strong> no exista fila para el
                    mismo SKU/variante que envió el POS (ver abajo).
                  </div>
                )}
                {diagEnsamble.puntoVentaEnviado && (
                  <div>
                    <dt className="inline text-slate-500">puntoVenta (enviado al WMS): </dt>
                    <dd className="inline break-all font-semibold">{diagEnsamble.puntoVentaEnviado}</dd>
                  </div>
                )}
                {diagEnsamble.firebaseProjectId && (
                  <div>
                    <dt className="inline text-slate-500">Firebase projectId (POS): </dt>
                    <dd className="inline break-all">{diagEnsamble.firebaseProjectId}</dd>
                  </div>
                )}
                {diagEnsamble.nextPublicWmsUrl && (
                  <div>
                    <dt className="inline text-slate-500">NEXT_PUBLIC_WMS_URL (cliente): </dt>
                    <dd className="inline break-all">{diagEnsamble.nextPublicWmsUrl}</dd>
                  </div>
                )}
                {diagEnsamble.wmsUpstreamUrl && (
                  <div>
                    <dt className="inline text-slate-500">URL usada por el proxy (servidor POS): </dt>
                    <dd className="inline break-all text-primary-800">{diagEnsamble.wmsUpstreamUrl}</dd>
                  </div>
                )}
                {diagEnsamble.movimientoId && (
                  <div>
                    <dt className="inline text-slate-500">movimientoId: </dt>
                    <dd className="inline break-all">{diagEnsamble.movimientoId}</dd>
                  </div>
                )}
                {diagEnsamble.message && (
                  <div>
                    <dt className="text-slate-500">message (WMS):</dt>
                    <dd className="mt-0.5 whitespace-pre-wrap break-words">{diagEnsamble.message}</dd>
                  </div>
                )}
                {diagEnsamble.error && (
                  <div>
                    <dt className="text-slate-500">error:</dt>
                    <dd className="mt-0.5 whitespace-pre-wrap break-words text-amber-900">{diagEnsamble.error}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-slate-500">SKUs enviados (producto × cantidad):</dt>
                  <dd className="mt-1 space-y-0.5">
                    {diagEnsamble.lineasEnviadas.map((l, i) => {
                      const base = skuBaseDesdeSkuProductoEnsamble(l.skuProducto);
                      return (
                        <div key={i} className="break-all">
                          ×{l.cantidad} <span className="font-semibold">{l.skuProducto}</span>
                          {l.sku ? (
                            <span className="block pl-2 text-slate-600">
                              → <code className="rounded bg-white px-0.5">sku</code> catálogo: {l.sku}
                            </span>
                          ) : null}
                          {"varianteChorizo" in l && l.varianteChorizo ? (
                            <span className="block pl-2 text-slate-600">
                              → <code className="rounded bg-white px-0.5">varianteChorizo</code>: {l.varianteChorizo}
                            </span>
                          ) : null}
                          {"varianteArepaCombo" in l && l.varianteArepaCombo ? (
                            <span className="block pl-2 text-slate-600">
                              → <code className="rounded bg-white px-0.5">varianteArepaCombo</code>:{" "}
                              {l.varianteArepaCombo}
                            </span>
                          ) : null}
                          {"variantes" in l && Array.isArray(l.variantes) && l.variantes.length > 0 ? (
                            <span className="block pl-2 text-slate-600">
                              → <code className="rounded bg-white px-0.5">variantes</code>: {l.variantes.join(", ")}
                            </span>
                          ) : null}
                          {base !== l.skuProducto ? (
                            <span className="block pl-2 text-slate-600">→ SKU base (antes de |): {base}</span>
                          ) : null}
                        </div>
                      );
                    })}
                  </dd>
                </div>
                {diagEnsamble.detalleResumen && (
                  <div>
                    <dt className="text-slate-500">detalle (recorte):</dt>
                    <dd className="mt-0.5 max-h-32 overflow-y-auto whitespace-pre-wrap break-words text-slate-700">
                      {diagEnsamble.detalleResumen}
                    </dd>
                  </div>
                )}
              </dl>
              <p className="mt-2 border-t border-slate-200/80 pt-2 text-[11px] text-slate-600">
                Cruzá estos <code className="rounded bg-white px-0.5">skuProducto</code> con la hoja{" "}
                <strong className="font-medium">DB_POS_Composición</strong> en el WMS (misma variante / id compuesto).
              </p>
              <ul className="mt-2 list-inside list-disc text-[11px] text-slate-600">
                <li>
                  La tabla de stock lista códigos tipo <strong className="font-medium">FRAN-KIT-*</strong> (insumos). Lo que
                  vendés en caja es el <strong className="font-medium">SKU del catálogo POS</strong> (WMS); la composición
                  debe decir qué FRAN-KIT bajar por cada venta.
                </li>
                <li>
                  Si en <code className="rounded bg-white px-0.5">.env.local</code> tenés{" "}
                  <code className="rounded bg-white px-0.5">NEXT_PUBLIC_WMS_URL=http://localhost:…</code> sin{" "}
                  <code className="rounded bg-white px-0.5">NEXT_PUBLIC_WMS_USE_LOCAL=1</code>, el servidor del POS puede estar
                  llamando al <strong className="font-medium">WMS de Vercel</strong>, no al de tu PC.
                </li>
                <li>
                  El <code className="rounded bg-white px-0.5">projectId</code> de Firebase del POS debe ser el mismo que usa
                  el WMS al escribir{" "}
                  <code className="rounded bg-white px-0.5">pos_inventario_ensamble_saldo</code> /{" "}
                  <code className="rounded bg-white px-0.5">pos_inventario_ensamble_movimientos</code> (y, si aplica,{" "}
                  <code className="rounded bg-white px-0.5">posInventarioSaldos</code> para cargue manual).
                </li>
                <li>
                  Catálogo desde <strong className="font-medium">hoja Google</strong>: cada fila tiene <code className="rounded bg-white px-0.5">id</code> tipo{" "}
                  <code className="rounded bg-white px-0.5">sheet-fran-kit-6</code> y <code className="rounded bg-white px-0.5">sku</code>{" "}
                  <code className="rounded bg-white px-0.5">FRAN-KIT-6</code>. El WMS escribe saldo con <code className="rounded bg-white px-0.5">insumoId</code> o{" "}
                  <code className="rounded bg-white px-0.5">skuComponente</code> = código kit; el POS fusiona por SKU. También consulta{" "}
                  <code className="rounded bg-white px-0.5">puntoVentaClave</code> (normalizado) si el doc no trae el mismo texto de <code className="rounded bg-white px-0.5">puntoVenta</code> que tu perfil.
                </li>
              </ul>
            </details>
          )}
        </div>
        <button
          type="button"
          onClick={() => void cargarTodo()}
          disabled={cargando}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 shadow-sm hover:bg-gray-50 disabled:opacity-50"
        >
          {cargando ? "Actualizando…" : "Actualizar stock"}
        </button>
      </div>

      {mensajeOk && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{mensajeOk}</div>
      )}
      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">{error}</div>
      )}
      {avisoCatalogo && !error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">{avisoCatalogo}</div>
      )}
      {avisoPvHoja && !error && (
        <div className="rounded-lg border border-blue-200 bg-blue-50/90 px-4 py-3 text-sm text-blue-950">{avisoPvHoja}</div>
      )}

      <div className="flex flex-wrap gap-2 border-b border-gray-100 pb-2">
        {(
          [
            ["stock", "Stock actual"],
            ["movimiento", "Registrar movimiento"],
            ["historial", "Historial"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setPestaña(id);
              setMensajeOk(null);
            }}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              pestaña === id ? "bg-primary-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {pestaña === "stock" && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <input
                type="search"
                placeholder="Buscar por código, nombre o categoría…"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="w-full max-w-md rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
              />
              <select
                value={categoriaFiltro}
                onChange={(e) => setCategoriaFiltro(e.target.value)}
                className="w-full max-w-xs rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                aria-label="Filtrar por categoría"
              >
                <option value="">Todas las categorías</option>
                {categoriasDisponibles.map((categoria) => (
                  <option key={categoria} value={categoria}>
                    {categoria}
                  </option>
                ))}
              </select>
            </div>
            <p className="mt-2 max-w-2xl text-xs text-gray-600">
              <span className="font-medium text-gray-800">Saldo actual:</span> si el valor viene del inventario POS (cargue),
              podés hacer clic para ajustarlo tras ingresar la clave. Si el saldo lo marca solo el{" "}
              <span className="font-medium">WMS</span> (ventas con ensamble), el número no es clicable: usá{" "}
              <span className="font-medium">Registrar movimiento</span> o el backoffice del WMS. El ícono de{" "}
              <span className="font-medium">ojo</span> al lado muestra los últimos movimientos de ese producto (POS + WMS).
            </p>
            {!cargando && filasStock.length > 0 && (
              <p className="mt-3 text-sm text-gray-800">
                <span className="font-semibold text-gray-900">Inventario valorizado (costo aprox.):</span>{" "}
                <span className="tabular-nums font-medium text-primary-800">
                  {totalInventarioValorizado.toLocaleString("es-CO", {
                    style: "currency",
                    currency: "COP",
                    maximumFractionDigits: 0,
                  })}
                </span>
                <span className="mt-1 block text-xs font-normal text-gray-500">
                  Suma saldo × costo medio por ítem (desde cargues con precio). Si un producto muestra «—» en costo, no
                  entra en el total hasta que registres un cargue con precio.
                </span>
              </p>
            )}
            {!cargando && cantidadBajoMinimo > 0 && (
              <div
                className="mt-4 flex items-start gap-3 rounded-xl border border-amber-400/70 bg-gradient-to-r from-amber-50 to-orange-50/90 px-4 py-3 text-sm text-amber-950 shadow-sm"
                role="status"
              >
                <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-800 ring-2 ring-amber-400/40">
                  <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
                  </svg>
                </span>
                <div>
                  <p className="font-semibold text-amber-950">
                    {cantidadBajoMinimo === 1
                      ? "1 producto está bajo el mínimo sugerido"
                      : `${cantidadBajoMinimo} productos están bajo el mínimo sugerido`}
                  </p>
                  <p className="mt-0.5 text-amber-900/90">
                    Conviene planificar el <strong className="font-semibold">próximo pedido</strong> a proveedor o matriz para
                    no quedarte sin stock.
                  </p>
                </div>
              </div>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase text-gray-600">
                <tr>
                  <th className="px-4 py-3">Código</th>
                  <th className="px-4 py-3">Descripción</th>
                  <th className="px-4 py-3">Categoría</th>
                  <th className="px-4 py-3">Unidad</th>
                  <th className="px-4 py-3 text-right">Saldo actual</th>
                  <th
                    className="min-w-[7rem] px-4 py-3 text-right"
                    title="Costo medio ponderado (COP/unidad) según cargues POS."
                  >
                    Costo unit. (COP)
                  </th>
                  <th className="min-w-[7rem] px-4 py-3 text-right" title="Saldo actual × costo unitario aproximado.">
                    Valor stock
                  </th>
                  <th className="min-w-[9rem] px-4 py-3 text-right">Mín. sugerido</th>
                  <th className="w-px whitespace-nowrap px-3 py-3 text-center" title="Icono si conviene pedir">
                    Alerta
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {cargando ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-gray-500">
                      Cargando catálogo…
                    </td>
                  </tr>
                ) : filasStock.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-gray-500">
                      Sin ítems para mostrar.
                    </td>
                  </tr>
                ) : (
                  filasStock.map((row) => {
                    const skuK = normSkuInventario(row.sku);
                    const eff = row.minimoEfectivo;
                    const defaultInput =
                      eff != null && Number.isFinite(eff)
                        ? eff.toLocaleString("es-CO", { maximumFractionDigits: 3 })
                        : "";
                    return (
                      <tr
                        key={row.id}
                        className={`hover:bg-gray-50/80 ${row.bajoMinimo ? "bg-red-50/50" : ""}`}
                      >
                        <td className="px-4 py-2.5 font-mono text-xs text-gray-800">{row.sku}</td>
                        <td className="px-4 py-2.5 text-gray-900">{row.descripcion}</td>
                        <td className="px-4 py-2.5 text-gray-600">{row.categoria?.trim() || "—"}</td>
                        <td className="px-4 py-2.5 text-gray-600">{row.unidad}</td>
                        <td className="px-4 py-2.5 text-right align-middle">
                          <div className="inline-flex max-w-full items-center justify-end gap-1.5">
                            {row.saldoEditableClic ? (
                              <button
                                type="button"
                                onClick={() =>
                                  abrirModalAjusteSaldo(
                                    {
                                      id: row.id,
                                      sku: row.sku,
                                      descripcion: row.descripcion,
                                      unidad: row.unidad,
                                      ...(row.categoria != null ? { categoria: row.categoria } : {}),
                                    },
                                    row.saldo
                                  )
                                }
                                className="rounded px-1 py-0.5 text-right font-semibold tabular-nums text-primary-700 underline decoration-primary-300 underline-offset-2 hover:bg-primary-50 hover:text-primary-800"
                              >
                                {row.saldo.toLocaleString("es-CO", { maximumFractionDigits: 3 })}
                              </button>
                            ) : (
                              <span
                                className="font-semibold tabular-nums text-gray-800"
                                title="Saldo del WMS (ensamble). No se puede ajustar desde aquí con clic; usá Registrar movimiento o el WMS."
                              >
                                {row.saldo.toLocaleString("es-CO", { maximumFractionDigits: 3 })}
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                abrirDetalleMovimientosProducto({
                                  id: row.id,
                                  sku: row.sku,
                                  descripcion: row.descripcion,
                                  unidad: row.unidad,
                                  ...(row.categoria != null ? { categoria: row.categoria } : {}),
                                })
                              }
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 shadow-sm hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700"
                              title="Últimos movimientos de este producto"
                              aria-label={`Ver movimientos de ${row.sku}`}
                            >
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                />
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                                />
                              </svg>
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right align-middle tabular-nums text-gray-700">
                          {row.costoUnitarioReferencia != null
                            ? row.costoUnitarioReferencia.toLocaleString("es-CO", {
                                style: "currency",
                                currency: "COP",
                                maximumFractionDigits: 0,
                              })
                            : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-right align-middle tabular-nums text-gray-800">
                          {row.valorStockAprox != null
                            ? row.valorStockAprox.toLocaleString("es-CO", {
                                style: "currency",
                                currency: "COP",
                                maximumFractionDigits: 0,
                              })
                            : "—"}
                        </td>
                        <td className="px-4 py-2 text-right align-middle">
                          <div className="flex flex-col items-end gap-0.5">
                            <input
                              type="text"
                              inputMode="decimal"
                              title="Se guarda solo en este navegador al salir del campo. Vacío: quita tu ajuste y aplica el mínimo de la hoja."
                              defaultValue={defaultInput}
                              key={`${row.id}-${minInputTick}-${minimosUsuario.has(skuK) ? "u" : "s"}-${row.minimoSheet ?? ""}`}
                              disabled={guardandoMinimoSku === skuK}
                              onBlur={(e) => {
                                commitMinimoSugerido(
                                  row,
                                  e.target.value,
                                  row.minimoUsuario != null,
                                  row.minimoEfectivo
                                );
                              }}
                              className="w-full max-w-[7rem] rounded-md border border-gray-300 px-2 py-1.5 text-right text-sm tabular-nums focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-200 disabled:opacity-50"
                            />
                            {row.minimoSheet != null && row.minimoUsuario != null && (
                              <span className="text-[10px] text-gray-500">
                                Hoja sugería: {row.minimoSheet.toLocaleString("es-CO", { maximumFractionDigits: 3 })}
                              </span>
                            )}
                            {row.minimoSheet != null && row.minimoUsuario == null && (
                              <span className="text-[10px] text-gray-500">Desde hoja</span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-center align-middle">
                          {row.bajoMinimo ? (
                            <span
                              className="inline-flex items-center justify-center"
                              title={`Stock (${row.saldo}) por debajo del mínimo (${row.minimoEfectivo != null ? row.minimoEfectivo.toLocaleString("es-CO", { maximumFractionDigits: 3 }) : "—"}). Sugerencia: incluir en el próximo pedido.`}
                            >
                              <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-amber-500/15 text-amber-700 ring-2 ring-amber-400/40 shadow-sm">
                                <svg
                                  className="h-5 w-5"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth={2}
                                  viewBox="0 0 24 24"
                                  aria-hidden
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
                                  />
                                </svg>
                                <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-brand-red text-[9px] font-bold text-white ring-2 ring-white">
                                  !
                                </span>
                              </span>
                              <span className="sr-only">
                                Alerta: conviene incluir este producto en el próximo pedido
                              </span>
                            </span>
                          ) : (
                            <span className="text-gray-300" aria-hidden>
                              —
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="border-t border-gray-200 bg-gray-50/80 px-4 py-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-gray-900">Historial de ajustes por saldo (clave)</h3>
              <button
                type="button"
                onClick={() => void cargarHistorial()}
                disabled={cargandoHist}
                className="text-xs font-medium text-primary-600 hover:underline disabled:opacity-50"
              >
                {cargandoHist ? "Actualizando…" : "Refrescar"}
              </button>
            </div>
            <p className="mb-3 text-xs text-gray-600">
              Solo se listan los ajustes hechos desde esta pantalla (clic en saldo). El historial completo está en la pestaña{" "}
              <span className="font-medium">Historial</span>.
            </p>
            <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-gray-200 bg-gray-100 text-xs font-semibold uppercase text-gray-600">
                  <tr>
                    <th className="px-3 py-2">Fecha</th>
                    <th className="px-3 py-2">Producto</th>
                    <th className="px-3 py-2 text-right">Δ</th>
                    <th className="px-3 py-2 text-right">Saldo después</th>
                    <th className="px-3 py-2">Notas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {cargandoHist && historialAjustesSaldoDesdeStock.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-gray-500">
                        Cargando…
                      </td>
                    </tr>
                  ) : historialAjustesSaldoDesdeStock.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-gray-500">
                        Todavía no hay ajustes desde el clic en saldo en este punto de venta.
                      </td>
                    </tr>
                  ) : (
                    historialAjustesSaldoDesdeStock.slice(0, 40).map((m) => (
                      <tr key={m.id} className="hover:bg-gray-50/80">
                        <td className="whitespace-nowrap px-3 py-2 text-gray-600">{formatMovFecha(m.createdAt)}</td>
                        <td className="px-3 py-2">
                          <span className="font-mono text-xs text-gray-600">{m.insumoSku}</span>
                          <br />
                          <span className="text-gray-900">{m.insumoDescripcion}</span>
                        </td>
                        <td
                          className={`px-3 py-2 text-right font-semibold tabular-nums ${
                            m.delta >= 0 ? "text-emerald-700" : "text-red-700"
                          }`}
                        >
                          {m.delta >= 0 ? "+" : ""}
                          {m.delta.toLocaleString("es-CO", { maximumFractionDigits: 3 })}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-800">
                          {m.cantidadNueva.toLocaleString("es-CO", { maximumFractionDigits: 3 })}
                        </td>
                        <td className="max-w-[220px] truncate px-3 py-2 text-xs text-gray-600" title={m.notas}>
                          {m.notas || "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {pestaña === "movimiento" && (
        <div className="max-w-xl space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div>
            <label className="block text-sm font-medium text-gray-700">Producto (catálogo)</label>
            <select
              value={movInsumoId}
              onChange={(e) => setMovInsumoId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
            >
              <option value="">— Seleccionar —</option>
              {insumos.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.sku} — {i.descripcion}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Tipo de movimiento</label>
            <select
              value={movTipo}
              onChange={(e) => setMovTipo(e.target.value as TipoMovimientoInventario)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
            >
              {TIPOS_MOVIMIENTO.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">{TIPOS_MOVIMIENTO.find((t) => t.value === movTipo)?.ayuda}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Cantidad</label>
            <input
              type="text"
              inputMode="decimal"
              value={movCantidad}
              onChange={(e) => setMovCantidad(e.target.value)}
              placeholder="0"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
            />
            <p className="mt-1 text-xs text-gray-500">
              Para entradas y salidas siempre ingresa un valor positivo; el sistema aplica el signo según el tipo.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Notas / referencia (opcional)</label>
            <textarea
              value={movNotas}
              onChange={(e) => setMovNotas(e.target.value)}
              rows={3}
              placeholder="Ej. Remisión 123, autorización de gerente, lote…"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
            />
          </div>
          <button
            type="button"
            disabled={enviandoMov || cargando || insumos.length === 0}
            onClick={() => void enviarMovimiento()}
            className="w-full rounded-lg bg-primary-600 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {enviandoMov ? "Guardando…" : "Registrar movimiento"}
          </button>
        </div>
      )}

      {pestaña === "historial" && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <h3 className="text-sm font-semibold text-gray-900">Últimos movimientos</h3>
            <button
              type="button"
              onClick={() => void cargarHistorial()}
              disabled={cargandoHist}
              className="text-xs font-medium text-primary-600 hover:underline disabled:opacity-50"
            >
              {cargandoHist ? "…" : "Refrescar"}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase text-gray-600">
                <tr>
                  <th className="px-4 py-3">Fecha registro</th>
                  <th className="px-4 py-3">Fecha cargue</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Producto</th>
                  <th className="px-4 py-3 text-right">Δ</th>
                  <th className="px-4 py-3 text-right">Saldo</th>
                  <th className="px-4 py-3">Notas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {cargandoHist ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-gray-500">
                      Cargando…
                    </td>
                  </tr>
                ) : historial.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-gray-500">
                      Aún no hay movimientos registrados en este punto de venta.
                    </td>
                  </tr>
                ) : (
                  historial.map((m) => (
                    <tr key={m.id} className="hover:bg-gray-50/80">
                      <td className="whitespace-nowrap px-4 py-2 text-gray-600">{formatMovFecha(m.createdAt)}</td>
                      <td className="whitespace-nowrap px-4 py-2 text-gray-700">{formatFechaCargueHistorial(m.fechaCargue)}</td>
                      <td className="px-4 py-2 text-gray-800">{etiquetaTipoMovimiento(m.tipo)}</td>
                      <td className="px-4 py-2">
                        <span className="font-mono text-xs text-gray-600">{m.insumoSku}</span>
                        <br />
                        <span className="text-gray-900">{m.insumoDescripcion}</span>
                      </td>
                      <td
                        className={`px-4 py-2 text-right font-semibold tabular-nums ${
                          m.delta >= 0 ? "text-emerald-700" : "text-red-700"
                        }`}
                      >
                        {m.delta >= 0 ? "+" : ""}
                        {m.delta.toLocaleString("es-CO", { maximumFractionDigits: 3 })}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-gray-800">
                        {m.cantidadNueva.toLocaleString("es-CO", { maximumFractionDigits: 3 })}
                      </td>
                      <td className="max-w-[200px] truncate px-4 py-2 text-xs text-gray-600" title={m.notas}>
                        {m.notas || "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {ajusteSaldoModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ajuste-saldo-titulo"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/45"
            aria-label="Cerrar"
            disabled={guardandoAjusteSaldo}
            onClick={() => !guardandoAjusteSaldo && cerrarModalAjusteSaldo()}
          />
          <div className="relative z-[1] w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-xl">
            <h3 id="ajuste-saldo-titulo" className="text-lg font-semibold text-gray-900">
              {ajusteSaldoModal.fase === "clave" ? "Clave de ajuste" : "Ajustar saldo"}
            </h3>
            {ajusteSaldoModal.fase === "clave" ? (
              <div className="mt-4 space-y-4">
                <p className="text-sm text-gray-600">
                  Ingresá la clave para modificar el saldo de{" "}
                  <span className="font-mono font-medium text-gray-900">{ajusteSaldoModal.insumo.sku}</span> —{" "}
                  {ajusteSaldoModal.insumo.descripcion}
                </p>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Clave</label>
                  <div className="relative">
                    <input
                      type={claveAjusteSaldoVisible ? "text" : "password"}
                      autoComplete="off"
                      value={claveAjusteSaldoInput}
                      onChange={(e) => {
                        setClaveAjusteSaldoInput(e.target.value);
                        setErrorClaveAjuste(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") validarClaveYMostrarFormularioAjuste();
                      }}
                      className="w-full rounded-lg border border-gray-300 py-2 pl-3 pr-11 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                    />
                    <button
                      type="button"
                      onClick={() => setClaveAjusteSaldoVisible((v) => !v)}
                      className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                      aria-label={claveAjusteSaldoVisible ? "Ocultar clave" : "Mostrar clave"}
                      title={claveAjusteSaldoVisible ? "Ocultar clave" : "Mostrar clave"}
                    >
                      {claveAjusteSaldoVisible ? (
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                          />
                        </svg>
                      ) : (
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                          />
                        </svg>
                      )}
                    </button>
                  </div>
                  {errorClaveAjuste && (
                    <p className="mt-1 text-xs text-red-600">{errorClaveAjuste}</p>
                  )}
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={cerrarModalAjusteSaldo}
                    className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={validarClaveYMostrarFormularioAjuste}
                    className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700"
                  >
                    Continuar
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <p className="text-sm text-gray-600">
                  <span className="font-mono font-medium text-gray-900">{ajusteSaldoModal.insumo.sku}</span> —{" "}
                  {ajusteSaldoModal.insumo.descripcion}
                </p>
                <p className="text-sm text-gray-700">
                  Saldo al abrir:{" "}
                  <span className="font-semibold tabular-nums">
                    {ajusteSaldoModal.saldoAlAbrir.toLocaleString("es-CO", { maximumFractionDigits: 3 })}
                  </span>
                </p>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Nuevo saldo</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={nuevoSaldoAjusteInput}
                    onChange={(e) => setNuevoSaldoAjusteInput(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm tabular-nums focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Motivo / notas (opcional)</label>
                  <textarea
                    value={notasAjusteSaldo}
                    onChange={(e) => setNotasAjusteSaldo(e.target.value)}
                    rows={2}
                    placeholder="Ej. Conteo físico 28/03…"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    disabled={guardandoAjusteSaldo}
                    onClick={cerrarModalAjusteSaldo}
                    className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={guardandoAjusteSaldo}
                    onClick={() => void confirmarAjusteSaldoDesdeModal()}
                    className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
                  >
                    {guardandoAjusteSaldo ? "Guardando…" : "Guardar ajuste"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {detalleMovsModalItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="detalle-movs-titulo"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/45"
            aria-label="Cerrar"
            onClick={cerrarDetalleMovimientosProducto}
          />
          <div className="relative z-[1] flex max-h-[min(90vh,680px)] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
            <div className="shrink-0 border-b border-gray-100 px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 id="detalle-movs-titulo" className="text-lg font-semibold text-gray-900">
                    Movimientos del producto
                  </h3>
                  <p className="mt-1 text-sm text-gray-600">
                    <span className="font-mono font-medium text-gray-800">{detalleMovsModalItem.sku}</span>
                    {" — "}
                    {detalleMovsModalItem.descripcion}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={detalleMovsCargando}
                  onClick={() => abrirDetalleMovimientosProducto(detalleMovsModalItem)}
                  className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {detalleMovsCargando ? "Actualizando…" : "Refrescar"}
                </button>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                Incluye movimientos registrados en el POS y descuentos por venta (WMS). Se muestran hasta 60 entradas
                recientes que coinciden con este código; si el producto tuvo poca actividad, puede haber menos filas.
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-auto px-4 py-3 sm:px-5">
              {detalleMovsError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
                  {detalleMovsError}
                </div>
              )}
              {detalleMovsCargando && detalleMovsRows.length === 0 && !detalleMovsError ? (
                <p className="py-10 text-center text-sm text-gray-500">Cargando movimientos…</p>
              ) : !detalleMovsCargando && !detalleMovsError && detalleMovsRows.length === 0 ? (
                <p className="py-10 text-center text-sm text-gray-500">
                  No hay movimientos recientes para este producto en este punto de venta.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="min-w-[720px] w-full text-left text-xs sm:text-sm">
                    <thead className="sticky top-0 z-[1] border-b border-gray-200 bg-gray-100 text-[10px] font-semibold uppercase text-gray-600 sm:text-xs">
                      <tr>
                        <th className="whitespace-nowrap px-2 py-2 sm:px-3">Origen</th>
                        <th className="whitespace-nowrap px-2 py-2 sm:px-3">Fecha registro</th>
                        <th className="px-2 py-2 sm:px-3">Tipo</th>
                        <th className="whitespace-nowrap px-2 py-2 text-right sm:px-3">Δ</th>
                        <th className="whitespace-nowrap px-2 py-2 text-right sm:px-3">Antes</th>
                        <th className="whitespace-nowrap px-2 py-2 text-right sm:px-3">Después</th>
                        <th className="whitespace-nowrap px-2 py-2 sm:px-3">F. cargue</th>
                        <th className="min-w-[8rem] px-2 py-2 sm:px-3">Notas</th>
                        <th className="min-w-[6rem] px-2 py-2 sm:px-3">Usuario</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {detalleMovsRows.map((m) => {
                        const origen = m.id.startsWith("wmsEns:") ? "WMS" : "POS";
                        return (
                          <tr key={m.id} className="align-top hover:bg-gray-50/90">
                            <td className="whitespace-nowrap px-2 py-2 font-medium text-gray-800 sm:px-3">{origen}</td>
                            <td className="whitespace-nowrap px-2 py-2 text-gray-600 sm:px-3">{formatMovFecha(m.createdAt)}</td>
                            <td className="px-2 py-2 text-gray-800 sm:px-3">{etiquetaTipoMovimiento(m.tipo)}</td>
                            <td
                              className={`whitespace-nowrap px-2 py-2 text-right font-semibold tabular-nums sm:px-3 ${
                                m.delta >= 0 ? "text-emerald-700" : "text-red-700"
                              }`}
                            >
                              {m.delta >= 0 ? "+" : ""}
                              {m.delta.toLocaleString("es-CO", { maximumFractionDigits: 3 })}
                            </td>
                            <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums text-gray-700 sm:px-3">
                              {m.cantidadAnterior.toLocaleString("es-CO", { maximumFractionDigits: 3 })}
                            </td>
                            <td className="whitespace-nowrap px-2 py-2 text-right font-medium tabular-nums text-gray-900 sm:px-3">
                              {m.cantidadNueva.toLocaleString("es-CO", { maximumFractionDigits: 3 })}
                            </td>
                            <td className="whitespace-nowrap px-2 py-2 text-gray-600 sm:px-3">
                              {formatFechaCargueHistorial(m.fechaCargue)}
                            </td>
                            <td className="max-w-[14rem] px-2 py-2 break-words text-gray-700 sm:max-w-xs sm:px-3">
                              {m.notas || "—"}
                            </td>
                            <td className="px-2 py-2 text-[11px] text-gray-600 sm:px-3">
                              {m.email ||
                                (m.uid
                                  ? `${m.uid.slice(0, 8)}${m.uid.length > 8 ? "…" : ""}`
                                  : "—")}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="shrink-0 border-t border-gray-100 px-5 py-3 text-right">
              <button
                type="button"
                onClick={cerrarDetalleMovimientosProducto}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
