/** Costo de insumos = 44% de ventas (estándar franquicia María Chorizos). */
export const PORCENTAJE_INSUMOS_VENTAS = 0.44;

/** Base mensual de nómina / personal (se prorratea igual que la renta). */
export const BASE_PERSONAL_MENSUAL = 2_000_000;

/** Gastos fijos mensuales adicionales (se prorratean por día). */
export const GASTO_INTERNET_MENSUAL = 35_000;
export const GASTO_ASEO_MENSUAL = 200_000;
export const FEE_PUBLICIDAD_MENSUAL = 100_000;

/** Incremento motivador sobre el ritmo actual de ventas. */
export const INCREMENTO_VENTAS_MOTIVADOR = 0.1;

export function gastosFijosOperativosMensual(): number {
  return GASTO_INTERNET_MENSUAL + GASTO_ASEO_MENSUAL + FEE_PUBLICIDAD_MENSUAL;
}

export type PygSimplificadoCalculo = {
  ingresos: number;
  diasOperando: number;
  diasDelMes: number;
  costoInsumos: number;
  rentaMensual: number;
  rentaPeriodo: number;
  personalMensual: number;
  personalPeriodo: number;
  otrosGastosFijosMensual: number;
  otrosGastosFijosPeriodo: number;
  margenBruto: number;
  utilidadPeriodo: number;
  promedioVentaDiario: number;
  utilidadDiaria: number;
  ventasProyectadasMes: number;
  utilidadProyectadaMes: number;
  ventasProyectadasMesPlus10: number;
  utilidadProyectadaMesPlus10: number;
  gananciaExtraConPlus10: number;
};

const STORAGE_KEY_RENTA = "mc_pyg_renta_mensual";
const STORAGE_KEY_PERSONAL = "mc_pyg_personal_mensual";

export function diasEnPeriodo(desde: string, hasta: string): number {
  const d0 = Date.parse(`${desde.slice(0, 10)}T12:00:00`);
  const d1 = Date.parse(`${hasta.slice(0, 10)}T12:00:00`);
  if (!Number.isFinite(d0) || !Number.isFinite(d1)) return 1;
  return Math.max(1, Math.round((d1 - d0) / 86_400_000) + 1);
}

export function diasDelMesRef(fechaHasta: string): number {
  const d = new Date(
    fechaHasta.includes("T") ? fechaHasta : `${fechaHasta.slice(0, 10)}T12:00:00`
  );
  if (Number.isNaN(d.getTime())) return 30;
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

export function gastoMensualProrrateadoPeriodo(
  gastoMensual: number,
  diasOperando: number,
  diasDelMes: number
): number {
  if (gastoMensual <= 0 || diasOperando <= 0) return 0;
  return Math.round((gastoMensual / Math.max(diasDelMes, 1)) * diasOperando);
}

export function calcularPygSimplificado(
  ingresos: number,
  rentaMensual: number,
  desde: string,
  hasta: string,
  personalMensual: number = BASE_PERSONAL_MENSUAL
): PygSimplificadoCalculo {
  const ventas = Math.max(0, Math.round(ingresos));
  const diasOperando = diasEnPeriodo(desde, hasta);
  const diasDelMes = diasDelMesRef(hasta);
  const costoInsumos = Math.round(ventas * PORCENTAJE_INSUMOS_VENTAS);
  const rentaPeriodo = gastoMensualProrrateadoPeriodo(rentaMensual, diasOperando, diasDelMes);
  const personalBase = Math.max(0, Math.round(personalMensual));
  const personalPeriodo = gastoMensualProrrateadoPeriodo(personalBase, diasOperando, diasDelMes);
  const otrosFijosMensual = gastosFijosOperativosMensual();
  const otrosFijosPeriodo = gastoMensualProrrateadoPeriodo(
    otrosFijosMensual,
    diasOperando,
    diasDelMes
  );
  const margenBruto = ventas - costoInsumos;
  const utilidadPeriodo = margenBruto - rentaPeriodo - personalPeriodo - otrosFijosPeriodo;
  const promedioVentaDiario = Math.round(ventas / diasOperando);
  const utilidadDiaria = Math.round(utilidadPeriodo / diasOperando);

  const gastosFijosMesCompleto = Math.round(rentaMensual) + personalBase + otrosFijosMensual;

  const ventasProyectadasMes = Math.round(promedioVentaDiario * diasDelMes);
  const costoInsumosMes = Math.round(ventasProyectadasMes * PORCENTAJE_INSUMOS_VENTAS);
  const utilidadProyectadaMes =
    ventasProyectadasMes - costoInsumosMes - gastosFijosMesCompleto;

  const promedioPlus10 = Math.round(promedioVentaDiario * (1 + INCREMENTO_VENTAS_MOTIVADOR));
  const ventasProyectadasMesPlus10 = Math.round(promedioPlus10 * diasDelMes);
  const costoInsumosMesPlus10 = Math.round(ventasProyectadasMesPlus10 * PORCENTAJE_INSUMOS_VENTAS);
  const utilidadProyectadaMesPlus10 =
    ventasProyectadasMesPlus10 - costoInsumosMesPlus10 - gastosFijosMesCompleto;
  const gananciaExtraConPlus10 = utilidadProyectadaMesPlus10 - utilidadProyectadaMes;

  return {
    ingresos: ventas,
    diasOperando,
    diasDelMes,
    costoInsumos,
    rentaMensual: Math.round(rentaMensual),
    rentaPeriodo,
    personalMensual: personalBase,
    personalPeriodo,
    otrosGastosFijosMensual: otrosFijosMensual,
    otrosGastosFijosPeriodo: otrosFijosPeriodo,
    margenBruto,
    utilidadPeriodo,
    promedioVentaDiario,
    utilidadDiaria,
    ventasProyectadasMes,
    utilidadProyectadaMes,
    ventasProyectadasMesPlus10,
    utilidadProyectadaMesPlus10,
    gananciaExtraConPlus10,
  };
}

export function storageKeyRenta(uid: string, punto?: string): string {
  const pv = (punto ?? "").trim().replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);
  return `${STORAGE_KEY_RENTA}_${uid}_${pv || "pv"}`;
}

export function storageKeyPersonal(uid: string, punto?: string): string {
  const pv = (punto ?? "").trim().replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);
  return `${STORAGE_KEY_PERSONAL}_${uid}_${pv || "pv"}`;
}

export function leerRentaGuardada(uid: string, punto?: string): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = localStorage.getItem(storageKeyRenta(uid, punto));
    if (!raw) return 0;
    const n = Number(raw.replace(/[^\d]/g, ""));
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

export function guardarRentaLocal(uid: string, punto: string | undefined, valor: number): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKeyRenta(uid, punto), String(Math.max(0, Math.round(valor))));
  } catch {
    /* ignore */
  }
}

export function leerPersonalGuardado(uid: string, punto?: string): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKeyPersonal(uid, punto));
    if (raw === null) return null;
    const n = Number(raw.replace(/[^\d]/g, ""));
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function guardarPersonalLocal(uid: string, punto: string | undefined, valor: number): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKeyPersonal(uid, punto), String(Math.max(0, Math.round(valor))));
  } catch {
    /* ignore */
  }
}

export function formatCop(valor?: number): string {
  if (valor === undefined || valor === null || Number.isNaN(valor)) return "—";
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(valor);
}

export function formatCopInput(valor: number): string {
  if (!Number.isFinite(valor) || valor <= 0) return "";
  return Math.round(valor).toLocaleString("es-CO");
}

export function parseCopInput(texto: string): number {
  const n = Number(String(texto ?? "").replace(/[^\d]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
