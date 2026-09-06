"use client";

import { useCallback, useMemo, useState } from "react";
import { auth } from "@/lib/firebase";
import { ymdColombia } from "@/lib/fecha-colombia";
import {
  enviarResumenAjusteInventarioPorCorreo,
  type LineaAjusteInventarioCorreo,
} from "@/lib/inventario-ajuste-correo";
import { filtrarCatalogoSoloInsumos } from "@/lib/inventario-pos-catalogo";
import {
  NOTAS_PREFIJO_AJUSTE_SALDO_STOCK,
  registrarMovimientoInventario,
  saldoMostradoYFuenteParaInsumoKit,
  type InventarioSaldoConFuente,
  type InventarioSaldoRow,
} from "@/lib/inventario-pos-firestore";
import {
  metaCostoInventarioItem,
  valorStockValorizado,
} from "@/lib/inventario-valorizacion-unidades";
import { vistaSaldoConEmpaque, type VistaSaldoEmpaque } from "@/lib/inventario-cargue-presentacion";
import type { InsumoKitItem } from "@/types/inventario-pos";

/** Prefijo en notas para trazabilidad del módulo «Ajuste de inventario». */
export const NOTAS_PREFIJO_AJUSTE_INVENTARIO_HERRAMIENTA = "[Ajuste inventario]";

export interface AjusteInventarioPanelProps {
  puntoVenta: string;
  uid: string;
  email: string | null;
  insumos: InsumoKitItem[];
  saldoRows: InventarioSaldoRow[];
  saldosPorClaveMap: Map<string, InventarioSaldoConFuente>;
  onCompletado: () => void;
}

type BorradorSaldo = Record<string, string>;
/** Cómo interpreta el cajero el número del «nuevo saldo» en productos con empaque. */
type ModoEntradaAjuste = "paquetes" | "unidades";
type ModosEntrada = Record<string, ModoEntradaAjuste>;

function parseSaldo(raw: string): number | null {
  const n = parseFloat(raw.replace(/,/g, ".").trim());
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 1000) / 1000;
}

function formatCop(n: number): string {
  return n.toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  });
}

function formatNum(n: number): string {
  return n.toLocaleString("es-CO", { maximumFractionDigits: 3 });
}

/**
 * Convierte lo escrito en el input al saldo del sistema (paquetes si el ítem es de empaque).
 * Unidades permiten fracciones de paquete (ej. 9 und de x6 → 1,5 paq. destapado).
 */
function saldoSistemaDesdeEntrada(
  valorEntrada: number,
  modo: ModoEntradaAjuste,
  vista: VistaSaldoEmpaque
): number {
  if (!vista.saldoEnPaquetes || vista.unidadesPorPaquete == null || vista.unidadesPorPaquete < 2) {
    return valorEntrada;
  }
  if (modo === "paquetes") return valorEntrada;
  return Math.round((valorEntrada / vista.unidadesPorPaquete) * 1000) / 1000;
}

function valorEntradaDesdeSaldoSistema(
  saldoSistema: number,
  modo: ModoEntradaAjuste,
  vista: VistaSaldoEmpaque
): number {
  if (!vista.saldoEnPaquetes || vista.unidadesPorPaquete == null || vista.unidadesPorPaquete < 2) {
    return saldoSistema;
  }
  if (modo === "paquetes") return saldoSistema;
  return Math.round(saldoSistema * vista.unidadesPorPaquete * 1000) / 1000;
}

export default function AjusteInventarioPanel({
  puntoVenta,
  uid,
  email,
  insumos,
  saldoRows,
  saldosPorClaveMap,
  onCompletado,
}: AjusteInventarioPanelProps) {
  const pv = puntoVenta.trim();
  const [fechaAjuste, setFechaAjuste] = useState(ymdColombia);
  const [nombrePersona, setNombrePersona] = useState("");
  const [motivo, setMotivo] = useState("");
  const [correoDestino, setCorreoDestino] = useState(() => (email ?? "").trim());
  const [busqueda, setBusqueda] = useState("");
  const [borrador, setBorrador] = useState<BorradorSaldo>({});
  /** Por defecto: paquetes. «unidades» sirve cuando hay paquetes destapados. */
  const [modosEntrada, setModosEntrada] = useState<ModosEntrada>({});
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  /** Todas las filas del catálogo (sin filtro de búsqueda) para totales globales. */
  const filasTodas = useMemo(() => {
    return filtrarCatalogoSoloInsumos(insumos)
      .map((i) => {
        const { saldo, costoUnitarioReferencia } = saldoMostradoYFuenteParaInsumoKit(
          i,
          saldosPorClaveMap,
          saldoRows
        );
        const vista = vistaSaldoConEmpaque(saldo, i);
        return {
          insumo: i,
          saldoActual: saldo,
          costoUnitario: costoUnitarioReferencia,
          vista,
        };
      })
      .sort((a, b) => a.insumo.descripcion.localeCompare(b.insumo.descripcion, "es"));
  }, [insumos, saldoRows, saldosPorClaveMap]);

  const modoDe = useCallback(
    (id: string, vista: VistaSaldoEmpaque): ModoEntradaAjuste => {
      if (!vista.saldoEnPaquetes) return "paquetes";
      return modosEntrada[id] ?? "paquetes";
    },
    [modosEntrada]
  );

  const saldoNuevoSistema = useCallback(
    (f: { insumo: InsumoKitItem; saldoActual: number; vista: VistaSaldoEmpaque }): number | null => {
      const raw = borrador[f.insumo.id];
      if (raw == null || !String(raw).trim()) return null;
      const entrada = parseSaldo(raw);
      if (entrada == null) return null;
      return saldoSistemaDesdeEntrada(entrada, modoDe(f.insumo.id, f.vista), f.vista);
    },
    [borrador, modoDe]
  );

  const filas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return filasTodas;
    return filasTodas.filter(
      (r) =>
        r.insumo.sku.toLowerCase().includes(q) ||
        r.insumo.descripcion.toLowerCase().includes(q) ||
        (r.insumo.categoria ?? "").toLowerCase().includes(q)
    );
  }, [filasTodas, busqueda]);

  const cambiosPreview = useMemo(() => {
    const out: Array<{
      insumo: InsumoKitItem;
      saldoAnterior: number;
      saldoNuevo: number;
      delta: number;
      modoEntrada: ModoEntradaAjuste;
      vista: VistaSaldoEmpaque;
    }> = [];
    for (const f of filasTodas) {
      const nuevo = saldoNuevoSistema(f);
      if (nuevo == null) continue;
      const diff = nuevo - f.saldoActual;
      if (Math.abs(diff) < 1e-9) continue;
      out.push({
        insumo: f.insumo,
        saldoAnterior: f.saldoActual,
        saldoNuevo: nuevo,
        delta: Math.round(diff * 1000) / 1000,
        modoEntrada: modoDe(f.insumo.id, f.vista),
        vista: f.vista,
      });
    }
    return out;
  }, [filasTodas, saldoNuevoSistema, modoDe]);

  const valorizacion = useMemo(() => {
    let totalActual = 0;
    let totalProyectado = 0;
    let conCosto = 0;
    let sinCosto = 0;
    let deltaValor = 0;

    for (const f of filasTodas) {
      const nuevo = saldoNuevoSistema(f);
      const saldoEfectivo = nuevo != null ? nuevo : f.saldoActual;

      const vActual = valorStockValorizado(f.saldoActual, f.costoUnitario, f.insumo);
      const vNuevo = valorStockValorizado(saldoEfectivo, f.costoUnitario, f.insumo);

      if (vActual != null) {
        totalActual += vActual;
        conCosto += 1;
      } else {
        sinCosto += 1;
      }
      if (vNuevo != null) {
        totalProyectado += vNuevo;
      }
      if (vActual != null && vNuevo != null) {
        deltaValor += vNuevo - vActual;
      }
    }

    return {
      totalActual: Math.round(totalActual * 100) / 100,
      totalProyectado: Math.round(totalProyectado * 100) / 100,
      deltaValor: Math.round(deltaValor * 100) / 100,
      conCosto,
      sinCosto,
    };
  }, [filasTodas, saldoNuevoSistema]);

  const aplicarAjuste = useCallback(async () => {
    setError(null);
    setOk(null);
    const nombre = nombrePersona.trim();
    const mot = motivo.trim();
    if (!fechaAjuste.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(fechaAjuste.trim())) {
      setError("Indicá una fecha válida del ajuste.");
      return;
    }
    if (!nombre) {
      setError("Indicá el nombre de la persona que realiza el ajuste.");
      return;
    }
    if (mot.length < 5) {
      setError("Indicá el motivo del ajuste (al menos 5 caracteres).");
      return;
    }
    if (cambiosPreview.length === 0) {
      setError("No hay cambios de saldo. Escribí el nuevo saldo en los productos a ajustar.");
      return;
    }
    const to = correoDestino.trim();
    if (!to) {
      setError("Indicá el correo donde se enviará el resumen del ajuste.");
      return;
    }

    setEnviando(true);
    const lineasCorreo: LineaAjusteInventarioCorreo[] = [];
    const fallidos: string[] = [];

    for (const c of cambiosPreview) {
      const detalleModo =
        c.vista.saldoEnPaquetes && c.vista.unidadesPorPaquete
          ? c.modoEntrada === "unidades"
            ? ` · Entrada en und (paq. destapado; x${c.vista.unidadesPorPaquete} → ${formatNum(c.saldoNuevo)} paq.)`
            : ` · Entrada en paq. (x${c.vista.unidadesPorPaquete})`
          : "";
      const notas = `${NOTAS_PREFIJO_AJUSTE_INVENTARIO_HERRAMIENTA} ${NOTAS_PREFIJO_AJUSTE_SALDO_STOCK} Fecha ${fechaAjuste.trim()} · Por: ${nombre} · Motivo: ${mot}${detalleModo}`.slice(
        0,
        500
      );
      const r =
        c.delta > 0
          ? await registrarMovimientoInventario({
              puntoVenta: pv,
              insumo: c.insumo,
              tipo: "ajuste_positivo",
              cantidad: c.delta,
              notas,
              uid,
              email,
              permitirNegativo: true,
              fechaCargue: fechaAjuste.trim(),
            })
          : await registrarMovimientoInventario({
              puntoVenta: pv,
              insumo: c.insumo,
              tipo: "ajuste_negativo",
              cantidad: Math.abs(c.delta),
              notas,
              uid,
              email,
              permitirNegativo: true,
              fechaCargue: fechaAjuste.trim(),
            });
      if (!r.ok) {
        fallidos.push(`${c.insumo.sku}: ${r.message ?? "error"}`);
        continue;
      }
      lineasCorreo.push({
        sku: c.insumo.sku,
        descripcion: c.insumo.descripcion,
        saldoAnterior: c.saldoAnterior,
        saldoNuevo: c.saldoNuevo,
        delta: c.delta,
      });
    }

    if (lineasCorreo.length === 0) {
      setEnviando(false);
      setError(
        fallidos.length
          ? `No se pudo registrar ningún ajuste. ${fallidos.slice(0, 3).join(" · ")}`
          : "No se registraron cambios."
      );
      return;
    }

    let correoMsg = "";
    try {
      const token = await auth?.currentUser?.getIdToken();
      if (!token) {
        correoMsg = " Ajuste guardado, pero no hay sesión para enviar el correo.";
      } else {
        const mail = await enviarResumenAjusteInventarioPorCorreo({
          idToken: token,
          to,
          datos: {
            puntoVenta: pv,
            fechaAjusteYmd: fechaAjuste.trim(),
            ajustadoPorNombre: nombre,
            motivo: mot,
            lineas: lineasCorreo,
          },
        });
        correoMsg = mail.ok
          ? " Correo de resumen enviado."
          : ` Ajuste guardado; el correo no se pudo enviar: ${mail.message}`;
      }
    } catch (e) {
      correoMsg = ` Ajuste guardado; error al enviar correo: ${e instanceof Error ? e.message : "red"}`;
    }

    setBorrador({});
    setModosEntrada({});
    setEnviando(false);
    const avisoFallidos = fallidos.length ? ` (${fallidos.length} ítem(s) fallaron)` : "";
    setOk(
      `Ajuste registrado: ${lineasCorreo.length} producto(s)${avisoFallidos}.${correoMsg} El stock se actualiza en Inventarios.`
    );
    onCompletado();
  }, [
    nombrePersona,
    motivo,
    fechaAjuste,
    cambiosPreview,
    correoDestino,
    pv,
    uid,
    email,
    onCompletado,
  ]);

  return (
    <div className="space-y-4 rounded-xl border-2 border-brand-yellow/60 bg-amber-50/40 p-4 shadow-sm sm:p-5">
      <div>
        <h3 className="text-lg font-bold text-gray-900">Ajuste de inventario</h3>
        <p className="mt-1 text-sm text-gray-600">
          Indique fecha, quién ajusta y el motivo. El saldo del sistema en productos <strong>x6 / x100</strong> es en{" "}
          <strong>paquetes</strong>. Para paquetes destapados, elija cargar el nuevo saldo en{" "}
          <strong>unidades</strong> (se convierte a paquetes, incluso fracciones).
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div>
          <label className="block text-sm font-semibold text-gray-800">Fecha del ajuste</label>
          <input
            type="date"
            value={fechaAjuste}
            onChange={(e) => setFechaAjuste(e.target.value)}
            className="mt-1 w-full rounded-xl border-2 border-gray-200 bg-white px-3 py-2.5 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-200"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-800">Nombre de quien ajusta</label>
          <input
            type="text"
            value={nombrePersona}
            onChange={(e) => setNombrePersona(e.target.value)}
            placeholder="Ej. María Pérez"
            className="mt-1 w-full rounded-xl border-2 border-gray-200 bg-white px-3 py-2.5 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-200"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-800">Correo del resumen</label>
          <input
            type="email"
            value={correoDestino}
            onChange={(e) => setCorreoDestino(e.target.value)}
            placeholder="correo@ejemplo.com"
            className="mt-1 w-full rounded-xl border-2 border-gray-200 bg-white px-3 py-2.5 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-200"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-800">Motivo del ajuste</label>
        <textarea
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          rows={2}
          maxLength={400}
          placeholder="Ej. Conteo físico de cierre de mes / corrección por diferencia de remisión…"
          className="mt-1 w-full resize-y rounded-xl border-2 border-gray-200 bg-white px-3 py-2.5 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-200"
        />
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[12rem] flex-1">
          <label className="block text-sm font-semibold text-gray-800">Buscar producto</label>
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Código, nombre o categoría…"
            className="mt-1 w-full rounded-xl border-2 border-gray-200 bg-white px-3 py-2.5 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-200"
          />
        </div>
        <p className="pb-2 text-sm font-semibold text-amber-900">
          Cambios pendientes: <span className="tabular-nums">{cambiosPreview.length}</span>
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            Inventario valorizado (actual)
          </p>
          <p className="mt-1 text-lg font-bold tabular-nums text-gray-900">
            {formatCop(valorizacion.totalActual)}
          </p>
        </div>
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">
            Inventario valorizado (con este ajuste)
          </p>
          <p className="mt-1 text-lg font-bold tabular-nums text-amber-950">
            {formatCop(valorizacion.totalProyectado)}
          </p>
          <p
            className={`mt-0.5 text-xs font-semibold tabular-nums ${
              Math.abs(valorizacion.deltaValor) < 0.01
                ? "text-gray-500"
                : valorizacion.deltaValor > 0
                  ? "text-emerald-700"
                  : "text-red-700"
            }`}
          >
            {Math.abs(valorizacion.deltaValor) < 0.01
              ? "Sin cambio de valor"
              : `${valorizacion.deltaValor > 0 ? "+" : ""}${formatCop(valorizacion.deltaValor)} vs actual`}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Cobertura de costo</p>
          <p className="mt-1 text-sm text-gray-800">
            <span className="font-semibold tabular-nums">{valorizacion.conCosto}</span> con costo ·{" "}
            <span className="font-semibold tabular-nums">{valorizacion.sinCosto}</span> sin costo
          </p>
          <p className="mt-0.5 text-xs text-gray-500">
            El valor usa el costo medio de cargues. Si el saldo está en ml y el precio es por litro, se convierte
            (ml÷1000). Ítems sin precio no entran al total.
          </p>
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : null}
      {ok ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{ok}</p>
      ) : null}

      <div className="max-h-[min(32rem,60vh)] overflow-auto rounded-xl border-2 border-gray-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase text-gray-600">
            <tr>
              <th className="px-3 py-2">Código</th>
              <th className="px-3 py-2">Descripción</th>
              <th className="min-w-[7rem] px-3 py-2 text-right">Saldo actual</th>
              <th className="min-w-[11rem] px-3 py-2 text-right">Cargar en</th>
              <th className="min-w-[8rem] px-3 py-2 text-right">Nuevo saldo</th>
              <th className="px-3 py-2 text-right">Delta (paq.)</th>
              <th className="px-3 py-2 text-right">Costo unit.</th>
              <th className="px-3 py-2 text-right">Valor actual</th>
              <th className="px-3 py-2 text-right">Valor nuevo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filas.map((f) => {
              const modo = modoDe(f.insumo.id, f.vista);
              const raw = borrador[f.insumo.id] ?? "";
              const nuevoSis = saldoNuevoSistema(f);
              const saldoEfectivo = nuevoSis != null ? nuevoSis : f.saldoActual;
              const delta =
                nuevoSis != null ? Math.round((nuevoSis - f.saldoActual) * 1000) / 1000 : null;
              const cambiado = delta != null && Math.abs(delta) >= 1e-9;
              const vActual = valorStockValorizado(f.saldoActual, f.costoUnitario, f.insumo);
              const vNuevo = valorStockValorizado(saldoEfectivo, f.costoUnitario, f.insumo);
              const metaCosto = metaCostoInventarioItem(f.costoUnitario, f.insumo);
              const placeholderEntrada = formatNum(
                valorEntradaDesdeSaldoSistema(f.saldoActual, modo, f.vista)
              );
              const undPorPaq = f.vista.unidadesPorPaquete;
              return (
                <tr key={f.insumo.id} className={cambiado ? "bg-amber-50/80" : "bg-white"}>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-gray-700">{f.insumo.sku}</td>
                  <td className="px-3 py-2 text-gray-900">
                    {f.insumo.descripcion}
                    <span className="mt-0.5 block text-xs font-medium text-gray-600">
                      {f.vista.labelUnidad}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span className="block font-semibold tabular-nums text-gray-900">
                      {f.vista.textoPrincipal}
                    </span>
                    {f.vista.textoSecundario ? (
                      <span className="mt-0.5 block text-[10px] font-medium text-gray-500">
                        {f.vista.textoSecundario}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right align-middle">
                    {f.vista.saldoEnPaquetes && undPorPaq != null && undPorPaq >= 2 ? (
                      <div className="inline-flex rounded-lg border border-gray-300 bg-gray-50 p-0.5">
                        <button
                          type="button"
                          onClick={() => {
                            const actual = parseSaldo(borrador[f.insumo.id] ?? "") ?? f.saldoActual;
                            const enSis = saldoSistemaDesdeEntrada(actual, modo, f.vista);
                            const nuevoModo: ModoEntradaAjuste = "paquetes";
                            setModosEntrada((prev) => ({ ...prev, [f.insumo.id]: nuevoModo }));
                            if (borrador[f.insumo.id]?.trim()) {
                              setBorrador((prev) => ({
                                ...prev,
                                [f.insumo.id]: String(valorEntradaDesdeSaldoSistema(enSis, nuevoModo, f.vista)),
                              }));
                            }
                          }}
                          className={`rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${
                            modo === "paquetes"
                              ? "bg-amber-500 text-gray-900 shadow-sm"
                              : "text-gray-600 hover:bg-white"
                          }`}
                        >
                          Paquetes
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const actual = parseSaldo(borrador[f.insumo.id] ?? "") ?? f.saldoActual;
                            const enSis = saldoSistemaDesdeEntrada(actual, modo, f.vista);
                            const nuevoModo: ModoEntradaAjuste = "unidades";
                            setModosEntrada((prev) => ({ ...prev, [f.insumo.id]: nuevoModo }));
                            if (borrador[f.insumo.id]?.trim()) {
                              setBorrador((prev) => ({
                                ...prev,
                                [f.insumo.id]: String(valorEntradaDesdeSaldoSistema(enSis, nuevoModo, f.vista)),
                              }));
                            } else {
                              setModosEntrada((prev) => ({ ...prev, [f.insumo.id]: nuevoModo }));
                            }
                          }}
                          className={`rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${
                            modo === "unidades"
                              ? "bg-sky-600 text-white shadow-sm"
                              : "text-gray-600 hover:bg-white"
                          }`}
                          title="Usá unidades si hay paquetes destapados"
                        >
                          Unidades
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={raw}
                      placeholder={placeholderEntrada}
                      onChange={(e) =>
                        setBorrador((prev) => ({ ...prev, [f.insumo.id]: e.target.value }))
                      }
                      className="w-full min-w-[5rem] rounded-lg border border-gray-300 px-2 py-1.5 text-right text-sm tabular-nums focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-200"
                      aria-label={`Nuevo saldo ${f.insumo.sku} en ${modo}`}
                    />
                    <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                      {f.vista.saldoEnPaquetes
                        ? modo === "unidades"
                          ? `und (x${undPorPaq})`
                          : "paq."
                        : f.vista.labelUnidad}
                    </span>
                    {nuevoSis != null &&
                    f.vista.saldoEnPaquetes &&
                    modo === "unidades" &&
                    undPorPaq != null ? (
                      <span className="mt-0.5 block text-[10px] font-medium text-sky-800">
                        = {formatNum(nuevoSis)} paq. en sistema
                      </span>
                    ) : null}
                    {nuevoSis != null &&
                    f.vista.saldoEnPaquetes &&
                    modo === "paquetes" &&
                    undPorPaq != null ? (
                      <span className="mt-0.5 block text-[10px] font-medium text-gray-500">
                        ({formatNum(nuevoSis * undPorPaq)} und)
                      </span>
                    ) : null}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums text-sm font-semibold ${
                      delta == null || Math.abs(delta) < 1e-9
                        ? "text-gray-400"
                        : delta > 0
                          ? "text-emerald-700"
                          : "text-red-700"
                    }`}
                  >
                    {delta == null || Math.abs(delta) < 1e-9
                      ? "—"
                      : `${delta > 0 ? "+" : ""}${formatNum(delta)}`}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-xs text-gray-700">
                    {f.costoUnitario != null ? formatCop(f.costoUnitario) : "—"}
                    {metaCosto ? (
                      <span className="mt-0.5 block text-[10px] font-medium normal-case text-gray-500">
                        {metaCosto.etiquetaCosto}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-sm text-gray-800">
                    {vActual != null ? formatCop(vActual) : "—"}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums text-sm font-semibold ${
                      cambiado ? "text-amber-950" : "text-gray-800"
                    }`}
                  >
                    {vNuevo != null ? formatCop(vNuevo) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filas.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-gray-500">No hay productos para mostrar.</p>
        ) : null}
      </div>

      <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50/90 px-4 py-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
              Total inventario valorizado tras el ajuste
            </p>
            <p className="text-xs text-emerald-900/80">
              Se actualiza en tiempo real al escribir los nuevos saldos.
            </p>
          </div>
          <p className="text-2xl font-bold tabular-nums text-emerald-950">
            {formatCop(valorizacion.totalProyectado)}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={enviando || cambiosPreview.length === 0}
          onClick={() => void aplicarAjuste()}
          className="rounded-xl border-2 border-brand-yellow bg-brand-yellow px-5 py-3 text-sm font-bold text-gray-900 shadow-sm hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {enviando
            ? "Aplicando ajuste…"
            : `Aplicar ajuste${cambiosPreview.length ? ` (${cambiosPreview.length})` : ""} y enviar correo`}
        </button>
        <button
          type="button"
          disabled={enviando || Object.keys(borrador).length === 0}
          onClick={() => {
            setBorrador({});
            setModosEntrada({});
          }}
          className="rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Limpiar cambios
        </button>
      </div>
    </div>
  );
}
