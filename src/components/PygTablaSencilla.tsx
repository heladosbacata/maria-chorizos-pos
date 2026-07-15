"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  BASE_PERSONAL_MENSUAL,
  calcularPygSimplificado,
  FEE_PUBLICIDAD_MENSUAL,
  formatCop,
  formatCopInput,
  GASTO_ASEO_MENSUAL,
  GASTO_INTERNET_MENSUAL,
  guardarPersonalLocal,
  guardarRentaLocal,
  leerPersonalGuardado,
  leerRentaGuardada,
  parseCopInput,
  PORCENTAJE_INSUMOS_VENTAS,
} from "@/lib/pyg-simplificado";

type Props = {
  ingresos: number;
  desde: string;
  hasta: string;
  uid: string;
  puntoVenta?: string;
};

function filaTabla({
  concepto,
  valor,
  nota,
  destacado,
  negativo,
  entrada,
}: {
  concepto: string;
  valor?: string;
  nota?: string;
  destacado?: boolean;
  negativo?: boolean;
  entrada?: ReactNode;
}) {
  return (
    <tr className={`border-t border-gray-200${destacado ? " bg-emerald-50/80" : ""}`}>
      <td className="px-4 py-3 align-top">
        <p className={`font-medium text-gray-900${destacado ? " font-bold" : ""}`}>{concepto}</p>
        {nota ? <p className="mt-0.5 text-xs leading-relaxed text-gray-500">{nota}</p> : null}
      </td>
      <td className="px-4 py-3 text-right align-top">
        {entrada ?? (
          <span
            className={`font-semibold tabular-nums${
              destacado ? " text-lg font-extrabold" : ""
            }${negativo ? " text-gray-500" : ""}${
              destacado && valor && !valor.startsWith("−") ? " text-emerald-700" : ""
            }${destacado && valor?.startsWith("−") ? " text-red-700" : ""}`}
          >
            {valor ?? "—"}
          </span>
        )}
      </td>
    </tr>
  );
}

export default function PygTablaSencilla({ ingresos, desde, hasta, uid, puntoVenta }: Props) {
  const [rentaTexto, setRentaTexto] = useState("");
  const [personalTexto, setPersonalTexto] = useState(() => formatCopInput(BASE_PERSONAL_MENSUAL));

  useEffect(() => {
    const guardada = leerRentaGuardada(uid, puntoVenta);
    if (guardada > 0) setRentaTexto(formatCopInput(guardada));
  }, [uid, puntoVenta]);

  useEffect(() => {
    const guardado = leerPersonalGuardado(uid, puntoVenta);
    if (guardado !== null) {
      setPersonalTexto(guardado > 0 ? formatCopInput(guardado) : "");
    }
  }, [uid, puntoVenta]);

  const rentaMensual = parseCopInput(rentaTexto);
  const personalMensual = parseCopInput(personalTexto);
  const calc = useMemo(
    () => calcularPygSimplificado(ingresos, rentaMensual, desde, hasta, personalMensual),
    [ingresos, rentaMensual, personalMensual, desde, hasta]
  );

  const pctInsumos = Math.round(PORCENTAJE_INSUMOS_VENTAS * 100);
  const utilidadPositiva = calc.utilidadPeriodo >= 0;

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
        <h2 className="text-lg font-bold text-gray-900">Tu PyG en números simples</h2>
        <p className="mt-1 text-sm text-gray-600">
          Ventas del POS · insumos al {pctInsumos}% · renta y personal repartidos por día
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead>
            <tr className="bg-white text-[11px] font-bold uppercase tracking-wide text-gray-500">
              <th className="px-4 py-2">Qué significa</th>
              <th className="px-4 py-2 text-right">Valor (COP)</th>
            </tr>
          </thead>
          <tbody>
            {filaTabla({
              concepto: "1. Ventas en este periodo",
              valor: formatCop(calc.ingresos),
              nota: `Tickets del POS (${desde} → ${hasta})`,
            })}
            {filaTabla({
              concepto: "2. Días que llevas operando",
              valor: String(calc.diasOperando),
              nota: `De ${calc.diasDelMes} días del mes`,
            })}
            {filaTabla({
              concepto: `3. Costo de insumos (${pctInsumos}% de ventas)`,
              valor: `− ${formatCop(calc.costoInsumos)}`,
              negativo: true,
              nota: `No son tus pedidos al WMS: es el ${pctInsumos}% estándar sobre ${formatCop(calc.ingresos)} vendidos`,
            })}
            {filaTabla({
              concepto: "4. Margen después de insumos",
              valor: formatCop(calc.margenBruto),
              nota: "Ventas menos insumos",
            })}
            {filaTabla({
              concepto: "5. Renta del local (mes completo)",
              nota: "Escribe aquí lo que pagas de arriendo al mes. Se reparte entre los días del mes.",
              entrada: (
                <div className="inline-flex max-w-[220px] items-center justify-end gap-1">
                  <span className="text-gray-400">$</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="0"
                    value={rentaTexto}
                    onChange={(e) => {
                      const t = e.target.value.replace(/[^\d.,]/g, "");
                      setRentaTexto(t);
                    }}
                    onBlur={() => {
                      const n = parseCopInput(rentaTexto);
                      setRentaTexto(n > 0 ? formatCopInput(n) : "");
                      guardarRentaLocal(uid, puntoVenta, n);
                    }}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-right text-sm font-semibold text-gray-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                  />
                </div>
              ),
            })}
            {filaTabla({
              concepto: "6. Renta de este periodo",
              valor: rentaMensual > 0 ? `− ${formatCop(calc.rentaPeriodo)}` : formatCop(0),
              negativo: rentaMensual > 0,
              nota:
                rentaMensual > 0
                  ? `${formatCop(calc.rentaMensual)} ÷ ${calc.diasDelMes} días × ${calc.diasOperando} días operados`
                  : "Ingresa la renta mensual arriba para ver el valor proporcional",
            })}
            {filaTabla({
              concepto: "7. Pago de personal (mes completo)",
              nota: `Valor de referencia ${formatCop(BASE_PERSONAL_MENSUAL)}. Ajústalo si tu nómina es distinta. Se reparte igual que la renta.`,
              entrada: (
                <div className="inline-flex max-w-[220px] items-center justify-end gap-1">
                  <span className="text-gray-400">$</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder={formatCopInput(BASE_PERSONAL_MENSUAL)}
                    value={personalTexto}
                    onChange={(e) => {
                      const t = e.target.value.replace(/[^\d.,]/g, "");
                      setPersonalTexto(t);
                    }}
                    onBlur={() => {
                      const n = parseCopInput(personalTexto);
                      setPersonalTexto(n > 0 ? formatCopInput(n) : "");
                      guardarPersonalLocal(uid, puntoVenta, n);
                    }}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-right text-sm font-semibold text-gray-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                  />
                </div>
              ),
            })}
            {filaTabla({
              concepto: "8. Personal de este periodo",
              valor: personalMensual > 0 ? `− ${formatCop(calc.personalPeriodo)}` : formatCop(0),
              negativo: personalMensual > 0,
              nota:
                personalMensual > 0
                  ? `${formatCop(calc.personalMensual)} ÷ ${calc.diasDelMes} días × ${calc.diasOperando} días operados`
                  : "Ingresa el pago de personal arriba para ver el valor proporcional",
            })}
            {filaTabla({
              concepto: "9. Otros gastos fijos del periodo",
              valor: `− ${formatCop(calc.otrosGastosFijosPeriodo)}`,
              negativo: true,
              nota: `Internet ${formatCop(GASTO_INTERNET_MENSUAL)} + aseo ${formatCop(GASTO_ASEO_MENSUAL)} + publicidad ${formatCop(FEE_PUBLICIDAD_MENSUAL)} al mes, repartidos por día (${formatCop(calc.otrosGastosFijosMensual)} ÷ ${calc.diasDelMes} × ${calc.diasOperando})`,
            })}
            {filaTabla({
              concepto: "10. Utilidad del periodo (lo que te queda)",
              valor: `${utilidadPositiva ? "" : "− "}${formatCop(Math.abs(calc.utilidadPeriodo))}`,
              destacado: true,
              nota: "Ventas − insumos (44%) − renta − personal − internet, aseo y publicidad",
            })}
          </tbody>
        </table>
      </div>

      <div className="grid gap-0 border-t border-gray-200 sm:grid-cols-2">
        <div className="border-b border-gray-200 p-4 sm:border-b-0 sm:border-r">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
            Promedio venta por día
          </p>
          <p className="mt-1 text-xl font-extrabold text-primary-700">
            {formatCop(calc.promedioVentaDiario)}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {formatCop(calc.ingresos)} ÷ {calc.diasOperando} días
          </p>
        </div>
        <div className="p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
            Utilidad promedio por día
          </p>
          <p
            className={`mt-1 text-xl font-extrabold ${
              calc.utilidadDiaria >= 0 ? "text-emerald-700" : "text-red-700"
            }`}
          >
            {calc.utilidadDiaria >= 0 ? "" : "− "}
            {formatCop(Math.abs(calc.utilidadDiaria))}
          </p>
          <p className="mt-1 text-xs text-gray-500">Con renta, personal y gastos fijos del periodo</p>
        </div>
      </div>

      {calc.diasOperando < calc.diasDelMes && calc.ingresos > 0 ? (
        <div className="space-y-0 border-t border-gray-200">
          <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
              Si mantienes este ritmo hasta fin de mes
            </p>
            <p className="mt-1 text-sm text-gray-700">
              Ventas estimadas: <strong>{formatCop(calc.ventasProyectadasMes)}</strong>
              {" · "}
              Utilidad estimada:{" "}
              <strong className={calc.utilidadProyectadaMes >= 0 ? "text-emerald-700" : "text-red-700"}>
                {formatCop(calc.utilidadProyectadaMes)}
              </strong>
            </p>
            <p className="mt-1 text-xs text-gray-500">
              (renta mes completo + personal {formatCop(calc.personalMensual)} + internet{" "}
              {formatCop(GASTO_INTERNET_MENSUAL)} + aseo {formatCop(GASTO_ASEO_MENSUAL)} + publicidad{" "}
              {formatCop(FEE_PUBLICIDAD_MENSUAL)} + insumos al {pctInsumos}%)
            </p>
          </div>

          <div className="bg-gradient-to-br from-emerald-50 to-teal-50 px-4 py-5">
            <p className="text-sm leading-relaxed text-gray-700">
              Si incrementas un <strong>10%</strong> tus ventas diarias respecto a lo que llevas
              hoy, al cierre del mes podrías ganar:
            </p>
            <p
              className={`mt-3 text-3xl font-extrabold tracking-tight ${
                calc.utilidadProyectadaMesPlus10 >= 0 ? "text-emerald-700" : "text-red-700"
              }`}
            >
              {formatCop(calc.utilidadProyectadaMesPlus10)}
            </p>
            {calc.gananciaExtraConPlus10 > 0 ? (
              <p className="mt-2 text-sm font-semibold text-teal-800">
                Eso son {formatCop(calc.gananciaExtraConPlus10)} más que manteniendo el ritmo
                actual ({formatCop(calc.utilidadProyectadaMes)}).
              </p>
            ) : null}
            <p className="mt-3 text-xs leading-relaxed text-gray-500">
              Ventas con +10%: {formatCop(calc.ventasProyectadasMesPlus10)} al mes · Incluye
              insumos al {pctInsumos}%, renta, personal {formatCop(calc.personalMensual)},
              internet {formatCop(GASTO_INTERNET_MENSUAL)}, aseo {formatCop(GASTO_ASEO_MENSUAL)} y
              publicidad {formatCop(FEE_PUBLICIDAD_MENSUAL)}.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
