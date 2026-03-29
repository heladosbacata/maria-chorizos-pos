"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchCatalogoInsumosDesdeSheet } from "@/lib/catalogo-insumos-sheet-client";
import {
  escribirMinimoInventarioLocal,
  leerMinimosInventarioLocal,
} from "@/lib/inventario-minimos-local-storage";
import type { InsumoKitItem, TipoMovimientoInventario } from "@/types/inventario-pos";
import { fechaColombia, fechaHoraColombia, mediodiaColombiaDesdeYmd } from "@/lib/fecha-colombia";
import {
  CATALOGO_INSUMOS_KIT_COLLECTION,
  cantidadSaldoParaInsumoKit,
  etiquetaTipoMovimiento,
  listarInsumosKitPorPuntoVenta,
  listarMovimientosInventario,
  listarSaldosInventarioPorPuntoVenta,
  normSkuInventario,
  registrarMovimientoInventario,
  type InventarioSaldoRow,
} from "@/lib/inventario-pos-firestore";

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

export interface InventarioPosModuleProps {
  puntoVenta: string | null;
  uid: string;
  email: string | null;
}

export default function InventarioPosModule({ puntoVenta, uid, email }: InventarioPosModuleProps) {
  const [pestaña, setPestaña] = useState<Pestaña>("stock");
  const [insumos, setInsumos] = useState<InsumoKitItem[]>([]);
  const [saldoRows, setSaldoRows] = useState<InventarioSaldoRow[]>([]);
  const [minimosUsuario, setMinimosUsuario] = useState<Map<string, number>>(new Map());
  const [fuenteCatalogo, setFuenteCatalogo] = useState<"sheet" | "firestore" | null>(null);
  const [avisoCatalogo, setAvisoCatalogo] = useState<string | null>(null);
  const [avisoPvHoja, setAvisoPvHoja] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mensajeOk, setMensajeOk] = useState<string | null>(null);
  const [guardandoMinimoSku, setGuardandoMinimoSku] = useState<string | null>(null);
  /** Remonta inputs de mínimo cuando el usuario vacía el campo y solo aplica la hoja. */
  const [minInputTick, setMinInputTick] = useState(0);

  const [busqueda, setBusqueda] = useState("");
  const [movInsumoId, setMovInsumoId] = useState("");
  const [movTipo, setMovTipo] = useState<TipoMovimientoInventario>("salida_danio");
  const [movCantidad, setMovCantidad] = useState("");
  const [movNotas, setMovNotas] = useState("");
  const [enviandoMov, setEnviandoMov] = useState(false);

  const [historial, setHistorial] = useState<Awaited<ReturnType<typeof listarMovimientosInventario>>>([]);
  const [cargandoHist, setCargandoHist] = useState(false);

  const pv = (puntoVenta ?? "").trim();

  const cargarTodo = useCallback(async () => {
    if (!pv) {
      setInsumos([]);
      setSaldoRows([]);
      setMinimosUsuario(new Map());
      setFuenteCatalogo(null);
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
      const [sheetRes, saldosR] = await Promise.all([
        fetchCatalogoInsumosDesdeSheet(pv),
        listarSaldosInventarioPorPuntoVenta(pv),
      ]);
      setSaldoRows(saldosR);
      setMinimosUsuario(leerMinimosInventarioLocal(uid, pv));

      if (sheetRes.ok && sheetRes.data.length > 0) {
        setInsumos(sheetRes.data);
        setFuenteCatalogo("sheet");
        setError(null);
        if (sheetRes.pvFiltroSinCoincidencias) {
          setAvisoPvHoja(
            `Ninguna fila de la hoja tenía el punto de venta «${pv}» en la columna PV (o el texto no coincidía). Se muestran todos los productos de la hoja; revisá la columna PV o el código en tu perfil.`
          );
        }
      } else {
        const lista = await listarInsumosKitPorPuntoVenta(pv);
        setInsumos(lista);
        setFuenteCatalogo("firestore");
        if (lista.length === 0) {
          setError(
            `No hay ítems en la hoja ni en «${CATALOGO_INSUMOS_KIT_COLLECTION}» para «${pv}». Revisá la hoja DB_Franquicia_Insumos_Kit (columna PV si aplica) o documentos en Firestore.`
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
    } finally {
      setCargando(false);
    }
  }, [pv, uid]);

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

  const cargarHistorial = useCallback(async () => {
    if (!pv) return;
    setCargandoHist(true);
    try {
      const rows = await listarMovimientosInventario(pv, 100);
      setHistorial(rows);
    } catch {
      setHistorial([]);
    } finally {
      setCargandoHist(false);
    }
  }, [pv]);

  useEffect(() => {
    if (pestaña === "historial" && pv) void cargarHistorial();
  }, [pestaña, pv, cargarHistorial]);

  const filasStock = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const base = insumos.map((i) => {
      const saldo = cantidadSaldoParaInsumoKit(i, saldoRows);
      const skuK = normSkuInventario(i.sku);
      const minUsuario = minimosUsuario.get(skuK);
      const minSheet = i.minimoSugeridoSheet;
      const minimoEfectivo = minUsuario ?? minSheet ?? null;
      const bajoMinimo = minimoEfectivo != null && saldo < minimoEfectivo;
      return {
        ...i,
        saldo,
        minimoEfectivo,
        minimoUsuario: minUsuario,
        minimoSheet: minSheet,
        bajoMinimo,
      };
    });
    if (!q) return base;
    return base.filter(
      (r) =>
        r.sku.toLowerCase().includes(q) ||
        r.descripcion.toLowerCase().includes(q) ||
        (r.categoria && r.categoria.toLowerCase().includes(q))
    );
  }, [insumos, saldoRows, minimosUsuario, busqueda]);

  const cantidadBajoMinimo = useMemo(() => filasStock.filter((r) => r.bajoMinimo).length, [filasStock]);

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
          <p className="mt-1 max-w-2xl text-sm text-gray-600">
            Control de stock por punto de venta. La lista de productos se obtiene de la hoja{" "}
            <strong className="font-medium text-gray-800">DB_Franquicia_Insumos_Kit</strong> (Google Sheets); si la hoja no
            está disponible, se usa el catálogo Firestore{" "}
            <code className="rounded bg-gray-100 px-1 text-xs">{CATALOGO_INSUMOS_KIT_COLLECTION}</code>. El{" "}
            <span className="font-medium">mínimo sugerido</span> puede venir de la hoja y cada franquicia lo puede cambiar
            aquí: el ajuste se guarda solo en <span className="font-medium">la memoria de este equipo</span> (navegador,
            usuario de sesión y punto de venta), no en la nube. Saldos y movimientos:{" "}
            <span className="font-medium text-gray-800">{pv}</span>.
          </p>
          {fuenteCatalogo && (
            <p className="mt-2 text-xs font-medium text-primary-700">
              Catálogo activo:{" "}
              {fuenteCatalogo === "sheet" ? "hoja Google (DB_Franquicia_Insumos_Kit)" : `Firestore «${CATALOGO_INSUMOS_KIT_COLLECTION}»`}
            </p>
          )}
          <p className="mt-2 text-xs font-medium text-primary-700">Punto de venta: {pv}</p>
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
            <input
              type="search"
              placeholder="Buscar por código, nombre o categoría…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full max-w-md rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
            />
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
                  <th className="px-4 py-3">Unidad</th>
                  <th className="px-4 py-3 text-right">Saldo actual</th>
                  <th className="min-w-[9rem] px-4 py-3 text-right">Mín. sugerido</th>
                  <th className="w-px whitespace-nowrap px-3 py-3 text-center" title="Icono si conviene pedir">
                    Alerta
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {cargando ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
                      Cargando catálogo…
                    </td>
                  </tr>
                ) : filasStock.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
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
                        <td className="px-4 py-2.5 text-gray-600">{row.unidad}</td>
                        <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-gray-900">
                          {row.saldo.toLocaleString("es-CO", { maximumFractionDigits: 3 })}
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
    </div>
  );
}
