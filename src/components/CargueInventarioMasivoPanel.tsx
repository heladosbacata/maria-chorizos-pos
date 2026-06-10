"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchCatalogoInsumosDesdeSheet,
  type CatalogoSheetSetupHint,
} from "@/lib/catalogo-insumos-sheet-client";
import { ymdColombia } from "@/lib/fecha-colombia";
import {
  CATALOGO_INSUMOS_KIT_COLLECTION,
  cantidadSaldoParaInsumoKit,
  listarInsumosKitPorPuntoVenta,
  listarSaldosInventarioPorPuntoVenta,
  registrarMovimientoInventario,
} from "@/lib/inventario-pos-firestore";
import ModalReiniciarInventarioConfirmacion from "@/components/ModalReiniciarInventarioConfirmacion";
import ModalInformeInventarioActual from "@/components/ModalInformeInventarioActual";
import { catalogoInsumosParaCargue } from "@/lib/inventario-pos-catalogo";
import {
  contarInsumosConPrecioCompra,
  contarInsumosConPrecioHoja,
  formatPrecioCompraCop,
  mapaPreciosCarritoVacio,
  precioCompraParaInsumo,
  type MapaPreciosCarrito,
} from "@/lib/precios-compra-carrito";
import { reiniciarInventarioPuntoVenta } from "@/lib/reiniciar-inventario-client";
import { fetchMapaPreciosCarritoCompras } from "@/lib/wms-carrito-precios-client";
import type { InsumoKitItem } from "@/types/inventario-pos";

export interface CargueInventarioMasivoPanelProps {
  puntoVenta: string | null;
  uid: string;
  email: string | null;
}

function textoBusquedaFold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export default function CargueInventarioMasivoPanel({ puntoVenta, uid, email }: CargueInventarioMasivoPanelProps) {
  const pv = (puntoVenta ?? "").replace(/\u00a0/g, " ").trim();

  const [insumos, setInsumos] = useState<InsumoKitItem[]>([]);
  const [saldoRows, setSaldoRows] = useState<Awaited<ReturnType<typeof listarSaldosInventarioPorPuntoVenta>>>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCat, setErrorCat] = useState<string | null>(null);
  const [sheetSetupAyuda, setSheetSetupAyuda] = useState<CatalogoSheetSetupHint | null>(null);
  const [fuenteCat, setFuenteCat] = useState<"sheet" | "firestore" | null>(null);

  const [busqueda, setBusqueda] = useState("");
  const [fechaCargue, setFechaCargue] = useState(() => ymdColombia());
  const [notasGlobales, setNotasGlobales] = useState("");
  /** cantidades a ingresar por id de ítem del catálogo */
  const [cantidades, setCantidades] = useState<Record<string, string>>({});
  /** Precios respaldo desde DB_Carrito (solo si falta PRECIO_COMPRA_UNITARIO en hoja insumos). */
  const [mapaPreciosCarritoRespaldo, setMapaPreciosCarritoRespaldo] = useState<MapaPreciosCarrito>(() =>
    mapaPreciosCarritoVacio()
  );

  const [enviando, setEnviando] = useState(false);
  const [progreso, setProgreso] = useState<{ hecho: number; total: number } | null>(null);
  const [mensajeOk, setMensajeOk] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resumenErrores, setResumenErrores] = useState<string[]>([]);
  const [modalReinicioAbierto, setModalReinicioAbierto] = useState(false);
  const [modalInformeInventarioAbierto, setModalInformeInventarioAbierto] = useState(false);
  const [reiniciandoInventario, setReiniciandoInventario] = useState(false);
  const [avisoPreciosCarrito, setAvisoPreciosCarrito] = useState<string | null>(null);

  const cargarTodo = useCallback(async () => {
    if (!pv) {
      setInsumos([]);
      setSaldoRows([]);
      setCargando(false);
      setFuenteCat(null);
      setErrorCat("No hay punto de venta asignado en tu perfil.");
      return;
    }
    setCargando(true);
    setErrorCat(null);
    setFuenteCat(null);
    setSheetSetupAyuda(null);
    try {
      const [sheet, saldosR, listaFs, carritoPrecios] = await Promise.all([
        fetchCatalogoInsumosDesdeSheet(pv),
        listarSaldosInventarioPorPuntoVenta(pv),
        listarInsumosKitPorPuntoVenta(pv),
        fetchMapaPreciosCarritoCompras(),
      ]);
      setSaldoRows(saldosR);
      const sheetItems = sheet.ok ? sheet.data : [];
      const items = catalogoInsumosParaCargue(sheetItems, listaFs);
      if (items.length > 0) {
        setInsumos(items);
        setFuenteCat(sheetItems.length > 0 ? "sheet" : "firestore");
        if (sheet.sheetSetup) setSheetSetupAyuda(sheet.sheetSetup);
        setMapaPreciosCarritoRespaldo(carritoPrecios.ok ? carritoPrecios.mapa : mapaPreciosCarritoVacio());
        const desdeHoja = contarInsumosConPrecioHoja(items);
        const totalPrecio = contarInsumosConPrecioCompra(items, carritoPrecios.mapa);
        if (desdeHoja > 0) {
          setAvisoPreciosCarrito(
            `${desdeHoja} producto(s) con precio en DB_Franquicia_Insumos_Kit (columna PRECIO_COMPRA_UNITARIO). Solo lectura en POS.`
          );
        } else if (totalPrecio > 0) {
          setAvisoPreciosCarrito(
            `${totalPrecio} producto(s) usan precio de respaldo desde DB_Carrito. Completá PRECIO_COMPRA_UNITARIO en la hoja de insumos para precios por unidad/paquete correctos.`
          );
        } else {
          setAvisoPreciosCarrito(
            "Sin precios de compra. Agregá la columna PRECIO_COMPRA_UNITARIO en DB_Franquicia_Insumos_Kit (Google Sheet del catálogo POS)."
          );
        }
        if (!sheet.ok && sheet.message) {
          setErrorCat(
            `No se leyó la hoja (${sheet.message}). Catálogo Firestore «${CATALOGO_INSUMOS_KIT_COLLECTION}».`
          );
        }
        return;
      }
      setMapaPreciosCarritoRespaldo(mapaPreciosCarritoVacio());
      setAvisoPreciosCarrito(null);
      setErrorCat(
        sheet.message ??
          `Sin ítems en hoja ni en «${CATALOGO_INSUMOS_KIT_COLLECTION}» para «${pv}».`
      );
    } catch {
      setErrorCat("No se pudo cargar el catálogo.");
      setInsumos([]);
    } finally {
      setCargando(false);
    }
  }, [pv]);

  useEffect(() => {
    void cargarTodo();
  }, [cargarTodo]);

  const insumosFiltrados = useMemo(() => {
    const q = textoBusquedaFold(busqueda);
    if (!q) return insumos;
    return insumos.filter((i) => {
      const blob = textoBusquedaFold(`${i.sku} ${i.descripcion} ${i.categoria ?? ""}`);
      return q.split(/\s+/).every((t) => t && blob.includes(t));
    });
  }, [insumos, busqueda]);

  const totalSaldoActualPv = useMemo(() => {
    let total = 0;
    for (const it of insumos) {
      total += cantidadSaldoParaInsumoKit(it, saldoRows);
    }
    return Math.round(total * 1000) / 1000;
  }, [insumos, saldoRows]);

  const totalInventarioValorizadoPv = useMemo(() => {
    let total = 0;
    for (const it of insumos) {
      const saldo = cantidadSaldoParaInsumoKit(it, saldoRows);
      const precio = precioCompraParaInsumo(it, mapaPreciosCarritoRespaldo);
      if (precio != null && Number.isFinite(saldo) && saldo > 0) total += saldo * precio;
    }
    return Math.round(total);
  }, [insumos, saldoRows, mapaPreciosCarritoRespaldo]);

  function valorStockProducto(it: InsumoKitItem): number | null {
    const saldo = cantidadSaldoParaInsumoKit(it, saldoRows);
    const precio = precioCompraParaInsumo(it, mapaPreciosCarritoRespaldo);
    if (precio == null || precio <= 0 || !Number.isFinite(saldo) || saldo <= 0) return null;
    return Math.round(saldo * precio);
  }

  function formatValorStockCop(n: number | null): string {
    if (n == null || !Number.isFinite(n) || n <= 0) return "—";
    return n.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
  }

  const setCantidad = useCallback((id: string, raw: string) => {
    setCantidades((prev) => ({ ...prev, [id]: raw }));
  }, []);

  const limpiarCantidades = useCallback(() => {
    setCantidades({});
    setMensajeOk(null);
    setResumenErrores([]);
  }, []);

  const confirmarReinicioInventario = useCallback(async () => {
    if (!pv) return;
    setReiniciandoInventario(true);
    setError(null);
    setMensajeOk(null);
    setResumenErrores([]);
    try {
      const r = await reiniciarInventarioPuntoVenta(pv);
      if (!r.ok) {
        setError(r.message);
        return;
      }
      const saldosR = await listarSaldosInventarioPorPuntoVenta(pv);
      setSaldoRows(saldosR);
      setModalReinicioAbierto(false);
      const mailTxt = r.correoEnviado
        ? ` Se notificó a ${r.correoDestino ?? "el franquiciado"}.`
        : r.avisoCorreo
          ? ` ${r.avisoCorreo}`
          : "";
      setMensajeOk(
        `Inventario reiniciado: ${r.resumen.legacyAjustados} ajuste(s) legacy, ${r.resumen.ensambleEnCero} saldo(s) ensamble en cero.${mailTxt}`
      );
    } catch {
      setError("No se pudo reiniciar el inventario. Revisá la conexión e intentá de nuevo.");
    } finally {
      setReiniciandoInventario(false);
    }
  }, [pv]);

  const aplicarCargue = useCallback(async () => {
    if (!pv || !uid.trim()) return;
    setMensajeOk(null);
    setError(null);
    setResumenErrores([]);

    const lineas: { insumo: InsumoKitItem; cantidad: number; precioCompraUnitario: number }[] = [];
    const faltanPrecio: string[] = [];
    for (const it of insumos) {
      const raw = (cantidades[it.id] ?? "").trim().replace(/,/g, ".");
      if (raw === "") continue;
      const n = parseFloat(raw);
      if (!Number.isFinite(n) || n <= 0) continue;
      const p = precioCompraParaInsumo(it, mapaPreciosCarritoRespaldo);
      if (p == null || p <= 0) {
        faltanPrecio.push(it.sku);
        continue;
      }
      lineas.push({
        insumo: it,
        cantidad: Math.round(n * 1000) / 1000,
        precioCompraUnitario: p,
      });
    }

    if (faltanPrecio.length > 0) {
      setError(
        `Estos productos tienen cantidad pero no tienen precio (columna PRECIO_COMPRA_UNITARIO en DB_Franquicia_Insumos_Kit): ${faltanPrecio.slice(0, 8).join(", ")}${faltanPrecio.length > 8 ? "…" : ""}.`
      );
      return;
    }

    if (lineas.length === 0) {
      setError("Indicá al menos una cantidad mayor que cero.");
      return;
    }

    const notasBase = notasGlobales.trim().slice(0, 400);
    const sufijoFecha = fechaCargue.trim();
    const notasComunes =
      `Cargue inicial POS${notasBase ? ` · ${notasBase}` : ""}`.slice(0, 500);

    setEnviando(true);
    setProgreso({ hecho: 0, total: lineas.length });
    const fallos: string[] = [];

    for (let i = 0; i < lineas.length; i++) {
      const { insumo, cantidad, precioCompraUnitario } = lineas[i]!;
      setProgreso({ hecho: i, total: lineas.length });
      const r = await registrarMovimientoInventario({
        puntoVenta: pv,
        insumo,
        tipo: "cargue",
        cantidad,
        notas: notasComunes,
        uid,
        email,
        fechaCargue: sufijoFecha || undefined,
        precioCompraUnitario,
      });
      if (!r.ok) {
        fallos.push(`${insumo.sku}: ${r.message ?? "Error"}`);
      }
    }

    setProgreso({ hecho: lineas.length, total: lineas.length });
    setEnviando(false);

    if (fallos.length > 0) {
      setResumenErrores(fallos);
      setError(`Se registraron ${lineas.length - fallos.length} de ${lineas.length} líneas. Revisá la lista abajo.`);
    } else {
      setMensajeOk(`Cargue inicial del punto de venta: ${lineas.length} producto(s) registrado(s).`);
      for (const { insumo } of lineas) {
        setCantidades((prev) => {
          const n = { ...prev };
          delete n[insumo.id];
          return n;
        });
      }
    }

    const saldosR = await listarSaldosInventarioPorPuntoVenta(pv);
    setSaldoRows(saldosR);
  }, [pv, uid, email, insumos, cantidades, mapaPreciosCarritoRespaldo, notasGlobales, fechaCargue]);

  if (!pv) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
        No hay punto de venta en tu perfil. No se puede usar el cargue inicial del punto de venta.
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="shrink-0 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Cargue inicial del punto de venta</h2>
        <p className="mt-1 text-sm text-gray-600">
          Una sola tabla con <strong className="font-medium text-gray-800">todos</strong> los insumos del catálogo: completá
          cantidad en cada fila que entra. El <strong className="font-medium">precio de compra</strong> viene fijo de la hoja{" "}
          <strong className="font-medium">DB_Carrito</strong> (WMS) y no se puede editar en el POS. Las filas vacías o en
          cero se omiten. Para cargue con <strong className="font-medium">lote</strong> por producto, usá la pestaña{" "}
          <strong className="font-medium">Cargue por producto y lote</strong>.
        </p>
      </div>

      {sheetSetupAyuda && (
        <div className="shrink-0 rounded-lg border border-blue-200 bg-blue-50/90 px-4 py-3 text-sm text-blue-950">
          <p className="font-medium">Configuración hoja Google (admin)</p>
          <p className="mt-1 text-xs opacity-90">{sheetSetupAyuda.shareOnceHint}</p>
        </div>
      )}

      {errorCat && (
        <div className="shrink-0 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">{errorCat}</div>
      )}

      {avisoPreciosCarrito && (
        <div className="shrink-0 rounded-lg border border-blue-200 bg-blue-50/90 px-4 py-3 text-sm text-blue-950">
          {avisoPreciosCarrito}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex shrink-0 flex-wrap items-end gap-3 border-b border-gray-100 bg-gray-50/80 px-4 py-3">
          <div className="min-w-[140px]">
            <label className="mb-1 block text-xs font-medium text-gray-700">Fecha cargue</label>
            <input
              type="date"
              value={fechaCargue}
              onChange={(e) => setFechaCargue(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="min-w-[200px] flex-1">
            <label className="mb-1 block text-xs font-medium text-gray-700">Notas (todas las líneas)</label>
            <input
              type="text"
              value={notasGlobales}
              onChange={(e) => setNotasGlobales(e.target.value)}
              placeholder="Ej. Proveedor X, remisión 123…"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              maxLength={400}
            />
          </div>
          <div className="min-w-[180px] flex-1">
            <label className="mb-1 block text-xs font-medium text-gray-700">Buscar en tabla</label>
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="SKU o descripción…"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={() => void cargarTodo()}
            disabled={cargando || enviando}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 shadow-sm hover:bg-gray-50 disabled:opacity-50"
          >
            {cargando ? "Cargando…" : "Actualizar catálogo"}
          </button>
          <button
            type="button"
            onClick={limpiarCantidades}
            disabled={enviando}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Limpiar cantidades
          </button>
          <button
            type="button"
            onClick={() => void aplicarCargue()}
            disabled={enviando || cargando || reiniciandoInventario || insumos.length === 0}
            className="rounded-lg bg-primary-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 disabled:opacity-50"
          >
            {enviando ? "Registrando…" : "Registrar cargue"}
          </button>
          <button
            type="button"
            onClick={() => setModalReinicioAbierto(true)}
            disabled={enviando || cargando || reiniciandoInventario}
            className="rounded-lg border border-red-300 bg-red-50 px-5 py-2 text-sm font-semibold text-red-800 shadow-sm hover:bg-red-100 disabled:opacity-50"
          >
            Reiniciar inventario
          </button>
          <button
            type="button"
            onClick={() => setModalInformeInventarioAbierto(true)}
            disabled={cargando || enviando || insumos.length === 0}
            className="rounded-lg border border-emerald-600 bg-emerald-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
          >
            Informe PDF / correo
          </button>
        </div>

        <ModalReiniciarInventarioConfirmacion
          open={modalReinicioAbierto}
          puntoVenta={pv}
          procesando={reiniciandoInventario}
          onCancelar={() => {
            if (!reiniciandoInventario) setModalReinicioAbierto(false);
          }}
          onConfirmar={() => void confirmarReinicioInventario()}
        />

        <ModalInformeInventarioActual
          open={modalInformeInventarioAbierto}
          onClose={() => setModalInformeInventarioAbierto(false)}
          puntoVenta={pv}
          insumos={insumos}
          saldoRows={saldoRows}
          mapaPreciosCarrito={mapaPreciosCarritoRespaldo}
          fuenteCatalogo={fuenteCat}
          emailSesion={email}
        />

        {progreso && enviando && (
          <div className="shrink-0 border-b border-gray-100 bg-brand-yellow/15 px-4 py-2 text-sm text-gray-800">
            Progreso: {progreso.hecho} / {progreso.total}…
          </div>
        )}

        {mensajeOk && (
          <div className="shrink-0 border-b border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-900">{mensajeOk}</div>
        )}
        {error && (
          <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-950">{error}</div>
        )}
        {resumenErrores.length > 0 && (
          <div className="max-h-32 shrink-0 overflow-y-auto border-b border-red-100 bg-red-50/80 px-4 py-2 text-xs text-red-900">
            <ul className="list-inside list-disc">
              {resumenErrores.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-auto">
          {cargando ? (
            <p className="p-8 text-center text-gray-500">Cargando catálogo…</p>
          ) : insumos.length === 0 ? (
            <p className="p-8 text-center text-gray-500">No hay ítems para mostrar.</p>
          ) : (
            <table className="w-full min-w-[980px] border-collapse text-left text-sm">
              <thead className="sticky top-0 z-[1] bg-gray-100 shadow-sm">
                <tr>
                  <th className="border-b border-gray-200 px-3 py-2 font-semibold text-gray-800">Código</th>
                  <th className="border-b border-gray-200 px-3 py-2 font-semibold text-gray-800">Descripción</th>
                  <th className="border-b border-gray-200 px-3 py-2 font-semibold text-gray-800">Unidad</th>
                  <th className="w-28 border-b border-gray-200 px-3 py-2 text-right font-semibold text-gray-800">Saldo actual</th>
                  <th className="w-36 border-b border-gray-200 px-3 py-2 font-semibold text-gray-800">Cantidad a cargar</th>
                  <th className="w-40 border-b border-gray-200 px-3 py-2 text-right font-semibold text-gray-800">
                    Precio compra COP/u.
                  </th>
                  <th className="w-40 border-b border-gray-200 px-3 py-2 text-right font-semibold text-gray-800">
                    Valor en stock
                  </th>
                </tr>
              </thead>
              <tbody>
                {insumosFiltrados.map((it) => (
                  <tr key={it.id} className="border-b border-gray-100 hover:bg-gray-50/80">
                    <td className="px-3 py-2 font-mono text-xs text-gray-900">{it.sku}</td>
                    <td className="max-w-md px-3 py-2 text-gray-800">{it.descripcion}</td>
                    <td className="px-3 py-2 text-gray-600">{it.unidad}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                      {cantidadSaldoParaInsumoKit(it, saldoRows)}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={cantidades[it.id] ?? ""}
                        onChange={(e) => setCantidad(it.id, e.target.value)}
                        disabled={enviando}
                        placeholder="0"
                        className="w-full rounded border border-gray-300 px-2 py-1.5 text-right font-mono text-sm tabular-nums focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:bg-gray-100"
                        aria-label={`Cantidad cargue ${it.sku}`}
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span
                        className="inline-block min-w-[4.5rem] rounded border border-gray-200 bg-gray-50 px-2 py-1.5 font-mono text-sm tabular-nums text-gray-800"
                        aria-label={`Precio compra ${it.sku}`}
                      >
                        {formatPrecioCompraCop(precioCompraParaInsumo(it, mapaPreciosCarritoRespaldo))}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span
                        className="inline-block min-w-[5rem] font-mono text-sm tabular-nums text-gray-800"
                        aria-label={`Valor en stock ${it.sku}`}
                      >
                        {formatValorStockCop(valorStockProducto(it))}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {fuenteCat && insumos.length > 0 && (
          <div className="shrink-0 border-t border-gray-100 bg-gray-50 px-4 py-2">
            <p className="text-xs text-gray-500">
              Catálogo: {fuenteCat === "sheet" ? "hoja Google" : "Firestore"} (solo insumos, sin ensambles POS)
              {" · "}
              {insumosFiltrados.length} de {insumos.length} filas mostradas
              {busqueda.trim() ? " (filtro activo)" : ""}.
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-2 text-sm font-medium text-gray-800">
              <span>
                Total inventario actual (punto de venta):{" "}
                <span className="tabular-nums">{totalSaldoActualPv.toLocaleString("es-CO", { maximumFractionDigits: 3 })}</span>
                {" · "}
                Valor en stock (precio compra × saldo):{" "}
                <span className="tabular-nums">
                  {totalInventarioValorizadoPv.toLocaleString("es-CO", {
                    style: "currency",
                    currency: "COP",
                    maximumFractionDigits: 0,
                  })}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setModalInformeInventarioAbierto(true)}
                disabled={cargando || insumos.length === 0}
                className="rounded-lg border border-primary-300 bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-900 shadow-sm hover:bg-primary-100 disabled:opacity-50"
              >
                Informe PDF / correo
              </button>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
