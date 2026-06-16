"use client";

import { useCallback, useMemo, useState } from "react";
import { fechaHoraColombia } from "@/lib/fecha-colombia";
import { auth } from "@/lib/firebase";
import {
  construirDatosReporteVentasRangoCajero,
  filtrarVentasCajeroPorRangoMs,
  msTimestampVentaCajero,
  rangoFechaHoraCajeroPorDefecto,
  resolverRangoFechaHoraCajero,
  type RangoFechaHoraCajeroInput,
} from "@/lib/reporte-ventas-rango-cajero";
import type { VentaGuardadaLocal } from "@/lib/pos-ventas-local-storage";
import { esVentaVigente } from "@/lib/pos-ventas-local-storage";
import { construirFilasDocumentosPos, formatoPesos } from "@/lib/ventas-documentos-pos";
import type { NivelDetalleReporteVentas } from "@/lib/ventas-reporte-pos-data";
import { descargarPdfReporteVentasPos } from "@/lib/ventas-reporte-pos-pdf";
import { descargarExcelReporteVentasPos } from "@/lib/ventas-reporte-pos-excel";
import { enviarReporteVentasPosPorCorreo } from "@/lib/ventas-reporte-pos-correo";
import ModalReporteVentasPos from "@/components/ModalReporteVentasPos";

export interface ReporteVentasRangoCajeroPanelProps {
  ventas: VentaGuardadaLocal[];
  puntoVenta: string;
  emailSugerido?: string;
}

function formatMoney(n: number): string {
  return `$ ${n.toLocaleString("es-CO", { maximumFractionDigits: 0 })}`;
}

export default function ReporteVentasRangoCajeroPanel({
  ventas,
  puntoVenta,
  emailSugerido = "",
}: ReporteVentasRangoCajeroPanelProps) {
  const [rangoInput, setRangoInput] = useState<RangoFechaHoraCajeroInput>(() => rangoFechaHoraCajeroPorDefecto());
  const [incluirAnuladas, setIncluirAnuladas] = useState(false);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [nivelReporte, setNivelReporte] = useState<NivelDetalleReporteVentas>("transacciones");
  const [reporteEmailPara, setReporteEmailPara] = useState(emailSugerido);
  const [reporteEmailCc, setReporteEmailCc] = useState("");
  const [reporteBusy, setReporteBusy] = useState<"idle" | "pdf" | "excel" | "correo">("idle");
  const [reporteError, setReporteError] = useState<string | null>(null);
  const [reporteExito, setReporteExito] = useState<string | null>(null);

  const rangoResuelto = useMemo(() => resolverRangoFechaHoraCajero(rangoInput), [rangoInput]);
  const errorRango =
    rangoResuelto === null
      ? "Revisá las fechas y horas: el inicio debe ser anterior o igual al fin (horario Colombia)."
      : null;

  const ventasEnRango = useMemo(() => {
    if (!rangoResuelto) return [];
    let rows = filtrarVentasCajeroPorRangoMs(ventas, rangoResuelto.desdeMs, rangoResuelto.hastaMs);
    if (!incluirAnuladas) rows = rows.filter(esVentaVigente);
    return rows.sort((a, b) => msTimestampVentaCajero(b) - msTimestampVentaCajero(a));
  }, [ventas, rangoResuelto, incluirAnuladas]);

  const filasPreview = useMemo(
    () =>
      construirFilasDocumentosPos({
        ventas: ventasEnRango,
        cotizaciones: [],
        remisiones: [],
      }),
    [ventasEnRango]
  );

  const totalVigente = useMemo(
    () => ventasEnRango.filter(esVentaVigente).reduce((s, v) => s + v.total, 0),
    [ventasEnRango]
  );

  const unidades = useMemo(
    () =>
      ventasEnRango.filter(esVentaVigente).reduce((s, v) => s + v.lineas.reduce((a, l) => a + l.cantidad, 0), 0),
    [ventasEnRango]
  );

  const datosReporte = useCallback(() => {
    if (!rangoResuelto) throw new Error(errorRango ?? "Rango inválido.");
    return construirDatosReporteVentasRangoCajero({
      puntoVenta,
      ventas,
      rango: rangoResuelto,
      nivel: nivelReporte,
      soloVigentes: !incluirAnuladas,
    });
  }, [rangoResuelto, errorRango, puntoVenta, ventas, nivelReporte, incluirAnuladas]);

  const abrirModalInforme = () => {
    if (errorRango) {
      window.alert(errorRango);
      return;
    }
    if (ventasEnRango.length === 0) {
      window.alert("No hay ventas en el rango seleccionado.");
      return;
    }
    setReporteError(null);
    setReporteExito(null);
    setModalAbierto(true);
  };

  const descargarPdf = useCallback(async () => {
    if (ventasEnRango.length === 0) return;
    setReporteBusy("pdf");
    setReporteError(null);
    setReporteExito(null);
    try {
      await descargarPdfReporteVentasPos(datosReporte());
      setReporteExito("PDF descargado en tu equipo.");
    } catch (e) {
      setReporteError(e instanceof Error ? e.message : "No se pudo generar el PDF.");
    } finally {
      setReporteBusy("idle");
    }
  }, [ventasEnRango.length, datosReporte]);

  const descargarExcel = useCallback(async () => {
    if (ventasEnRango.length === 0) return;
    setReporteBusy("excel");
    setReporteError(null);
    setReporteExito(null);
    try {
      await descargarExcelReporteVentasPos(datosReporte());
      setReporteExito("Excel descargado en tu equipo.");
    } catch (e) {
      setReporteError(e instanceof Error ? e.message : "No se pudo generar el Excel.");
    } finally {
      setReporteBusy("idle");
    }
  }, [ventasEnRango.length, datosReporte]);

  const enviarCorreo = useCallback(async () => {
    if (ventasEnRango.length === 0 || !reporteEmailPara.trim()) return;
    setReporteBusy("correo");
    setReporteError(null);
    setReporteExito(null);
    try {
      const token = await auth?.currentUser?.getIdToken();
      if (!token) throw new Error("Sesión expirada. Volvé a iniciar sesión.");
      const r = await enviarReporteVentasPosPorCorreo({
        idToken: token,
        datos: datosReporte(),
        to: reporteEmailPara.trim(),
        cc: reporteEmailCc.trim() || undefined,
      });
      if (!r.ok) throw new Error(r.message);
      setReporteExito(
        `Reporte enviado a ${reporteEmailPara.trim()}${r.via ? ` (${r.via})` : ""}.${r.aviso ? ` ${r.aviso}` : ""}`
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo enviar el correo.";
      if (/no configurado|Firebase Admin|POS_DEPLOY_PROXY|PROXY_URL/i.test(msg)) {
        setReporteError(
          `${msg} Podés descargar el PDF igualmente. En local: configurá SMTP en .env.local o usá el deploy en Vercel.`
        );
      } else {
        setReporteError(msg);
      }
    } finally {
      setReporteBusy("idle");
    }
  }, [ventasEnRango.length, reporteEmailPara, reporteEmailCc, datosReporte]);

  const patchRango = (patch: Partial<RangoFechaHoraCajeroInput>) => {
    setRangoInput((prev) => ({ ...prev, ...patch }));
  };

  return (
    <>
      <section className="rounded-2xl border-2 border-indigo-100 bg-white p-5 shadow-sm md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-bold text-gray-900">Monitoreo por rango de fecha y hora</h3>
            <p className="mt-1 text-sm text-gray-600">
              Consultá ventas cobradas con carrito en un intervalo exacto (horario Colombia). Descargá PDF, Excel o
              enviá el informe por correo.
            </p>
          </div>
          <button
            type="button"
            onClick={abrirModalInforme}
            disabled={Boolean(errorRango) || ventasEnRango.length === 0}
            className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            PDF / correo
          </button>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <fieldset className="rounded-xl border border-gray-100 bg-gray-50/80 p-4">
            <legend className="px-1 text-sm font-semibold text-gray-900">Desde</legend>
            <div className="mt-2 flex flex-wrap gap-3">
              <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
                Fecha
                <input
                  type="date"
                  value={rangoInput.desdeYmd}
                  onChange={(e) => e.target.value && patchRango({ desdeYmd: e.target.value })}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-900"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
                Hora
                <input
                  type="time"
                  value={rangoInput.desdeHora}
                  onChange={(e) => patchRango({ desdeHora: e.target.value })}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-900"
                />
              </label>
            </div>
          </fieldset>

          <fieldset className="rounded-xl border border-gray-100 bg-gray-50/80 p-4">
            <legend className="px-1 text-sm font-semibold text-gray-900">Hasta</legend>
            <div className="mt-2 flex flex-wrap gap-3">
              <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
                Fecha
                <input
                  type="date"
                  value={rangoInput.hastaYmd}
                  onChange={(e) => e.target.value && patchRango({ hastaYmd: e.target.value })}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-900"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
                Hora
                <input
                  type="time"
                  value={rangoInput.hastaHora}
                  onChange={(e) => patchRango({ hastaHora: e.target.value })}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-900"
                />
              </label>
            </div>
          </fieldset>
        </div>

        <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={incluirAnuladas}
            onChange={(e) => setIncluirAnuladas(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          Incluir ventas anuladas en el listado e informe (no suman en totales vigentes).
        </label>

        {errorRango ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{errorRango}</p>
        ) : rangoResuelto ? (
          <p className="mt-3 text-center text-sm font-medium text-indigo-900">{rangoResuelto.periodoLabel}</p>
        ) : null}

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-indigo-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Tickets</p>
            <p className="mt-1 text-2xl font-black tabular-nums text-indigo-950">{ventasEnRango.length}</p>
          </div>
          <div className="rounded-xl bg-emerald-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Total vigente</p>
            <p className="mt-1 text-2xl font-black tabular-nums text-emerald-950">{formatMoney(totalVigente)}</p>
          </div>
          <div className="rounded-xl bg-sky-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Unidades</p>
            <p className="mt-1 text-2xl font-black tabular-nums text-sky-950">{unidades}</p>
          </div>
        </div>

        {filasPreview.length === 0 ? (
          <p className="mt-8 rounded-xl border border-dashed border-gray-200 bg-gray-50 py-10 text-center text-sm text-gray-500">
            No hay ventas en este rango. Ajustá fechas/horas o pulsá «Actualizar» arriba para sincronizar la nube.
          </p>
        ) : (
          <div className="mt-6 overflow-x-auto rounded-xl border border-gray-100">
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead className="bg-indigo-50/80 text-left text-gray-700">
                <tr>
                  <th className="px-3 py-2.5 font-bold">Fecha y hora</th>
                  <th className="px-3 py-2.5 font-bold">Recibo</th>
                  <th className="px-3 py-2.5 font-bold">Cajero</th>
                  <th className="px-3 py-2.5 font-bold">Cliente</th>
                  <th className="px-3 py-2.5 font-bold">Pago</th>
                  <th className="px-3 py-2.5 text-right font-bold">Total</th>
                  <th className="px-3 py-2.5 font-bold">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 bg-white">
                {filasPreview.map((f) => {
                  const ms = f.fechaMs > 0 ? f.fechaMs : 0;
                  const fechaLabel =
                    ms > 0
                      ? fechaHoraColombia(new Date(ms), { dateStyle: "short", timeStyle: "short" })
                      : "—";
                  return (
                    <tr key={f.id} className={f.anulada ? "bg-rose-50/40" : "hover:bg-gray-50/80"}>
                      <td className="whitespace-nowrap px-3 py-2.5 text-gray-700">{fechaLabel}</td>
                      <td className="max-w-[120px] truncate px-3 py-2.5 font-mono text-xs text-gray-600" title={f.comprobante}>
                        {f.comprobante}
                      </td>
                      <td className="max-w-[100px] truncate px-3 py-2.5 text-gray-700">
                        {f.venta?.cajeroNombre?.trim() || "—"}
                      </td>
                      <td className="max-w-[140px] truncate px-3 py-2.5 text-gray-800" title={f.clienteNombre}>
                        {f.clienteNombre}
                      </td>
                      <td className="max-w-[100px] truncate px-3 py-2.5 text-gray-600" title={f.medioPagoDetalle}>
                        {f.medioPagoLabel}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums text-gray-900">
                        {formatoPesos(f.total)}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            f.anulada ? "bg-rose-100 text-rose-800" : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          {f.anulada ? "Anulada" : "Vigente"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ModalReporteVentasPos
        open={modalAbierto}
        onClose={() => {
          if (reporteBusy === "idle") setModalAbierto(false);
        }}
        puntoVenta={puntoVenta}
        desdeYmd={rangoInput.desdeYmd}
        hastaYmd={rangoInput.hastaYmd}
        periodoLabel={rangoResuelto?.periodoLabel}
        cantidadDocumentos={ventas.length}
        cantidadEnRango={ventasEnRango.length}
        totalVigente={totalVigente}
        nivel={nivelReporte}
        onNivelChange={setNivelReporte}
        emailPara={reporteEmailPara}
        onEmailParaChange={setReporteEmailPara}
        emailCc={reporteEmailCc}
        onEmailCcChange={setReporteEmailCc}
        busy={reporteBusy}
        onDescargarPdf={() => void descargarPdf()}
        onDescargarExcel={() => void descargarExcel()}
        onEnviarCorreo={() => void enviarCorreo()}
        errorMsg={reporteError}
        exitoMsg={reporteExito}
      />
    </>
  );
}
