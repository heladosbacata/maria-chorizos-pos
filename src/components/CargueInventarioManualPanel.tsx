"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchCatalogoInsumosDesdeSheet,
  type CatalogoSheetSetupHint,
} from "@/lib/catalogo-insumos-sheet-client";
import { fechaColombia, fechaHoraColombia, mediodiaColombiaDesdeYmd, ymdColombia } from "@/lib/fecha-colombia";
import {
  CATALOGO_INSUMOS_KIT_COLLECTION,
  etiquetaTipoMovimiento,
  listarInsumosKitPorPuntoVenta,
  listarMovimientosInventario,
  registrarMovimientoInventario,
} from "@/lib/inventario-pos-firestore";
import type { InsumoKitItem } from "@/types/inventario-pos";

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

export default function CargueInventarioManualPanel({ puntoVenta, uid, email }: CargueInventarioManualPanelProps) {
  const pv = (puntoVenta ?? "").trim();
  const [insumos, setInsumos] = useState<InsumoKitItem[]>([]);
  const [cargandoCat, setCargandoCat] = useState(true);
  const [errorCat, setErrorCat] = useState<string | null>(null);
  const [sheetSetupAyuda, setSheetSetupAyuda] = useState<CatalogoSheetSetupHint | null>(null);

  const [busqueda, setBusqueda] = useState("");
  const [insumoId, setInsumoId] = useState("");
  const [fechaCargue, setFechaCargue] = useState(fechaHoyIsoColombia);
  const [cantidad, setCantidad] = useState("");
  const [anotaciones, setAnotaciones] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [mensajeOk, setMensajeOk] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [historialCargue, setHistorialCargue] = useState<Awaited<ReturnType<typeof listarMovimientosInventario>>>([]);
  const [cargandoHist, setCargandoHist] = useState(false);
  const [fuenteCat, setFuenteCat] = useState<"sheet" | "firestore" | null>(null);

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

  useEffect(() => {
    void cargarCatalogo();
  }, [cargarCatalogo]);

  useEffect(() => {
    void cargarHistorialCargues();
  }, [cargarHistorialCargues]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return insumos;
    return insumos.filter(
      (i) =>
        i.sku.toLowerCase().includes(q) ||
        i.descripcion.toLowerCase().includes(q) ||
        (i.categoria && i.categoria.toLowerCase().includes(q))
    );
  }, [insumos, busqueda]);

  const insumoSel = useMemo(() => insumos.find((i) => i.id === insumoId) ?? null, [insumos, insumoId]);

  const registrar = async () => {
    setMensajeOk(null);
    setError(null);
    if (!pv) return;
    if (!insumoSel) {
      setError("Elige un producto de la lista.");
      return;
    }
    const cant = parseFloat(cantidad.replace(/,/g, "."));
    if (!Number.isFinite(cant) || cant <= 0) {
      setError("Indica una cantidad mayor que cero.");
      return;
    }
    if (!fechaCargue.trim()) {
      setError("Indica la fecha del cargue.");
      return;
    }
    setEnviando(true);
    const r = await registrarMovimientoInventario({
      puntoVenta: pv,
      insumo: insumoSel,
      tipo: "cargue",
      cantidad: cant,
      notas: anotaciones,
      uid,
      email,
      fechaCargue: fechaCargue.trim(),
    });
    setEnviando(false);
    if (!r.ok) {
      setError(r.message ?? "No se pudo registrar.");
      return;
    }
    setMensajeOk("Cargue registrado. Aparece en el historial de inventario.");
    setCantidad("");
    setAnotaciones("");
    void cargarHistorialCargues();
  };

  if (!pv) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-950">
        Asigna un punto de venta en tu perfil para registrar cargues.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-8">
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
        <div className="mx-auto mt-4 max-w-xl rounded-xl border border-sky-200 bg-sky-50/90 px-4 py-3 text-left text-xs leading-relaxed text-sky-950">
          <p className="font-semibold text-sky-900">Tu punto de venta y el catálogo</p>
          <ul className="mt-2 list-disc space-y-1.5 pl-4 text-sky-900/95">
            <li>
              Solo aparecen insumos <strong className="font-medium">asignados a «{pv}»</strong> o marcados como{" "}
              <strong className="font-medium">globales</strong> (sin punto de venta en la hoja/Firestore).
            </li>
            <li>
              En la hoja de Google: columna tipo PV/sucursal <strong className="font-medium">vacía</strong> = todos los
              locales; con texto = solo ese código (debe coincidir con tu perfil).
            </li>
            <li>
              En Firestore <code className="rounded bg-white/80 px-1">{CATALOGO_INSUMOS_KIT_COLLECTION}</code>: consultas
              indexadas por PV + <code className="rounded bg-white/80 px-1">posCatalogoGlobal</code> /{" "}
              <code className="rounded bg-white/80 px-1">posCatalogoPvCodes</code>. Sin esos campos, sigue valiendo “sin
              PV en el doc” = global (modo compat. con escaneo acotado).
            </li>
            <li>
              Los <strong className="font-medium">saldos y cargues</strong> son solo de este punto de venta; otro local no
              ve tus cantidades.
            </li>
          </ul>
        </div>
      </div>

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

        <label className="block text-sm font-semibold text-gray-800">Buscar producto</label>
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Código, nombre o categoría…"
          disabled={cargandoCat}
          className="mt-2 w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-base focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
        />

        <label className="mt-6 block text-sm font-semibold text-gray-800">Producto</label>
        <select
          value={insumoId}
          onChange={(e) => setInsumoId(e.target.value)}
          disabled={cargandoCat || insumos.length === 0}
          className="mt-2 w-full rounded-xl border-2 border-gray-200 px-4 py-4 text-base focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
        >
          <option value="">— Elegir producto —</option>
          {filtrados.map((i) => (
            <option key={i.id} value={i.id}>
              {i.sku} · {i.descripcion} ({i.unidad})
            </option>
          ))}
        </select>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-semibold text-gray-800">Fecha del cargue</label>
            <input
              type="date"
              value={fechaCargue}
              onChange={(e) => setFechaCargue(e.target.value)}
              className="mt-2 w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-base focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-800">Cantidad recibida</label>
            <input
              type="text"
              inputMode="decimal"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              placeholder="Ej. 10"
              className="mt-2 w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-base focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
            />
            {insumoSel && <p className="mt-1 text-xs text-gray-500">Unidad: {insumoSel.unidad}</p>}
          </div>
        </div>

        <label className="mt-6 block text-sm font-semibold text-gray-800">Anotaciones (opcional)</label>
        <textarea
          value={anotaciones}
          onChange={(e) => setAnotaciones(e.target.value)}
          rows={3}
          placeholder="Remisión, lote, proveedor, autorización…"
          className="mt-2 w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-base focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
        />

        <button
          type="button"
          onClick={() => void registrar()}
          disabled={enviando || cargandoCat || insumos.length === 0}
          className="mt-8 w-full rounded-xl bg-brand-yellow py-4 text-lg font-bold text-gray-900 shadow-md transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {enviando ? "Guardando…" : "Registrar cargue"}
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
                <th className="px-3 py-2">Anotaciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {cargandoHist ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-gray-500">
                    Cargando…
                  </td>
                </tr>
              ) : historialCargue.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-gray-500">
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
                    <td className="max-w-[180px] truncate px-3 py-2 text-xs text-gray-600" title={m.notas}>
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
  );
}
