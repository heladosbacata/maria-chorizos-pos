"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import EnviosCasaMatrizPanel from "@/components/EnviosCasaMatrizPanel";
import { auth } from "@/lib/firebase";
import { contarEnviosPendientesPos } from "@/lib/envios-matriz-api";
import type { InsumoKitItem, TipoMovimientoInventario } from "@/types/inventario-pos";
import {
  CATALOGO_INSUMOS_KIT_COLLECTION,
  etiquetaTipoMovimiento,
  listarInsumosKitPorPuntoVenta,
  listarMovimientosInventario,
  obtenerSaldosPorPuntoVenta,
  registrarMovimientoInventario,
} from "@/lib/inventario-pos-firestore";

type Pestaña = "stock" | "movimiento" | "historial" | "casaMatriz";

const TIPOS_MOVIMIENTO: { value: TipoMovimientoInventario; label: string; ayuda: string }[] = [
  { value: "cargue", label: "Cargue / recepción", ayuda: "Entrada de mercancía o traslado recibido." },
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
  return new Date(s * 1000).toLocaleString("es-CO", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function formatFechaCargueHistorial(iso: string | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "—";
  const [y, mo, d] = iso.split("-").map(Number);
  const dt = new Date(y, mo - 1, d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("es-CO", { dateStyle: "medium" });
}

export interface InventarioPosModuleProps {
  puntoVenta: string | null;
  uid: string;
  email: string | null;
}

export default function InventarioPosModule({ puntoVenta, uid, email }: InventarioPosModuleProps) {
  const [pestaña, setPestaña] = useState<Pestaña>("stock");
  const [insumos, setInsumos] = useState<InsumoKitItem[]>([]);
  const [saldos, setSaldos] = useState<Map<string, number>>(new Map());
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mensajeOk, setMensajeOk] = useState<string | null>(null);

  const [busqueda, setBusqueda] = useState("");
  const [movInsumoId, setMovInsumoId] = useState("");
  const [movTipo, setMovTipo] = useState<TipoMovimientoInventario>("cargue");
  const [movCantidad, setMovCantidad] = useState("");
  const [movNotas, setMovNotas] = useState("");
  const [enviandoMov, setEnviandoMov] = useState(false);

  const [historial, setHistorial] = useState<Awaited<ReturnType<typeof listarMovimientosInventario>>>([]);
  const [cargandoHist, setCargandoHist] = useState(false);

  const [enviosMatrizPendientes, setEnviosMatrizPendientes] = useState(0);

  const pv = (puntoVenta ?? "").trim();

  useEffect(() => {
    if (!pv) {
      setEnviosMatrizPendientes(0);
      return;
    }
    let cancel = false;
    (async () => {
      const token = auth?.currentUser ? await auth.currentUser.getIdToken() : null;
      const n = await contarEnviosPendientesPos(pv, token);
      if (!cancel) setEnviosMatrizPendientes(n);
    })();
    return () => {
      cancel = true;
    };
  }, [pv]);

  const cargarTodo = useCallback(async () => {
    if (!pv) {
      setInsumos([]);
      setSaldos(new Map());
      setCargando(false);
      setError("No hay punto de venta asignado. Completa tu perfil o elige punto de venta al iniciar sesión.");
      return;
    }
    setCargando(true);
    setError(null);
    try {
      const [lista, saldosMap] = await Promise.all([
        listarInsumosKitPorPuntoVenta(pv),
        obtenerSaldosPorPuntoVenta(pv),
      ]);
      setInsumos(lista);
      setSaldos(saldosMap);
      if (lista.length === 0) {
        setError(
          `No hay ítems en «${CATALOGO_INSUMOS_KIT_COLLECTION}» para «${pv}». Agrega documentos globales (sin campos PV) o con puntoVenta/PV igual a tu perfil.`
        );
      }
    } catch {
      setError("No se pudo cargar el catálogo de insumos.");
      setInsumos([]);
    } finally {
      setCargando(false);
    }
  }, [pv]);

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
    const base = insumos.map((i) => ({
      ...i,
      saldo: saldos.get(i.id) ?? 0,
    }));
    if (!q) return base;
    return base.filter(
      (r) =>
        r.sku.toLowerCase().includes(q) ||
        r.descripcion.toLowerCase().includes(q) ||
        (r.categoria && r.categoria.toLowerCase().includes(q))
    );
  }, [insumos, saldos, busqueda]);

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
            Control de stock por punto de venta. El catálogo usa{" "}
            <code className="rounded bg-gray-100 px-1 text-xs">{CATALOGO_INSUMOS_KIT_COLLECTION}</code>: carga indexada por
            PV, <span className="font-medium">posCatalogoGlobal</span> y{" "}
            <span className="font-medium">posCatalogoPvCodes</span>, más compat. con documentos antiguos. Los saldos y
            movimientos son solo de <span className="font-medium text-gray-800">{pv}</span>.
          </p>
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

      <div className="flex flex-wrap gap-2 border-b border-gray-100 pb-2">
        {(
          [
            ["stock", "Stock actual"],
            ["movimiento", "Registrar movimiento"],
            ["historial", "Historial"],
            ["casaMatriz", "Cargar inventario desde casa matriz"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setPestaña(id);
              setMensajeOk(null);
            }}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              pestaña === id ? "bg-primary-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            <span>{label}</span>
            {id === "casaMatriz" && enviosMatrizPendientes > 0 && (
              <span
                className={`min-w-[1.25rem] rounded-full px-1.5 py-0.5 text-center text-xs font-bold ${
                  pestaña === id ? "bg-white/25 text-white" : "bg-amber-500 text-white"
                }`}
              >
                {enviosMatrizPendientes > 99 ? "99+" : enviosMatrizPendientes}
              </span>
            )}
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
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase text-gray-600">
                <tr>
                  <th className="px-4 py-3">Código</th>
                  <th className="px-4 py-3">Descripción</th>
                  <th className="px-4 py-3">Unidad</th>
                  <th className="px-4 py-3 text-right">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {cargando ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-12 text-center text-gray-500">
                      Cargando catálogo…
                    </td>
                  </tr>
                ) : filasStock.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-12 text-center text-gray-500">
                      Sin ítems para mostrar.
                    </td>
                  </tr>
                ) : (
                  filasStock.map((row) => (
                    <tr key={row.id} className="hover:bg-gray-50/80">
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-800">{row.sku}</td>
                      <td className="px-4 py-2.5 text-gray-900">{row.descripcion}</td>
                      <td className="px-4 py-2.5 text-gray-600">{row.unidad}</td>
                      <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-gray-900">
                        {row.saldo.toLocaleString("es-CO", { maximumFractionDigits: 3 })}
                      </td>
                    </tr>
                  ))
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

      {pestaña === "casaMatriz" && (
        <EnviosCasaMatrizPanel puntoVenta={pv} onPendientesChange={setEnviosMatrizPendientes} />
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
