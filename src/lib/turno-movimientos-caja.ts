export type TipoMovimientoCaja = "ingreso" | "retiro";

export interface MovimientoCajaTurno {
  id: string;
  tipo: TipoMovimientoCaja;
  monto: number;
  motivo: string;
  creadoEnIso: string;
  creadoPor: {
    uid?: string;
    nombreDisplay: string;
    email?: string;
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function normalizarMovimientosCaja(raw: unknown): MovimientoCajaTurno[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const tipo = row.tipo === "ingreso" || row.tipo === "retiro" ? row.tipo : null;
    const monto = typeof row.monto === "number" && Number.isFinite(row.monto) ? round2(row.monto) : NaN;
    const motivo = typeof row.motivo === "string" ? row.motivo.trim() : "";
    const creadoEnIso = typeof row.creadoEnIso === "string" ? row.creadoEnIso : "";
    const creadoPorRaw = row.creadoPor;
    const creadoPor =
      creadoPorRaw && typeof creadoPorRaw === "object" ? (creadoPorRaw as Record<string, unknown>) : null;
    const nombreDisplay = typeof creadoPor?.nombreDisplay === "string" ? creadoPor.nombreDisplay.trim() : "";
    const uid = typeof creadoPor?.uid === "string" && creadoPor.uid.trim() ? creadoPor.uid.trim() : undefined;
    const email = typeof creadoPor?.email === "string" && creadoPor.email.trim() ? creadoPor.email.trim() : undefined;
    const id = typeof row.id === "string" && row.id.trim() ? row.id.trim() : "";
    if (!tipo || !(monto > 0) || !motivo || !creadoEnIso || !nombreDisplay || !id) return [];
    return [
      {
        id,
        tipo,
        monto,
        motivo,
        creadoEnIso,
        creadoPor: {
          nombreDisplay,
          ...(uid ? { uid } : {}),
          ...(email ? { email } : {}),
        },
      } satisfies MovimientoCajaTurno,
    ];
  });
}

export function acumularMovimientosCaja(movimientos: MovimientoCajaTurno[]): {
  totalIngresoEfectivo: number;
  totalRetiroEfectivo: number;
  netoMovimientosEfectivo: number;
} {
  let totalIngresoEfectivo = 0;
  let totalRetiroEfectivo = 0;
  for (const mov of movimientos) {
    if (mov.tipo === "ingreso") totalIngresoEfectivo += mov.monto;
    if (mov.tipo === "retiro") totalRetiroEfectivo += mov.monto;
  }
  totalIngresoEfectivo = round2(totalIngresoEfectivo);
  totalRetiroEfectivo = round2(totalRetiroEfectivo);
  return {
    totalIngresoEfectivo,
    totalRetiroEfectivo,
    netoMovimientosEfectivo: round2(totalIngresoEfectivo - totalRetiroEfectivo),
  };
}

export function crearMovimientoCajaTurno(input: {
  tipo: TipoMovimientoCaja;
  monto: number;
  motivo: string;
  uid?: string | null;
  nombreDisplay: string;
  email?: string | null;
  ahora?: Date;
}): MovimientoCajaTurno {
  const ahora = input.ahora ?? new Date();
  return {
    id: `mov_${ahora.getTime()}_${Math.random().toString(36).slice(2, 8)}`,
    tipo: input.tipo,
    monto: round2(input.monto),
    motivo: input.motivo.trim(),
    creadoEnIso: ahora.toISOString(),
    creadoPor: {
      nombreDisplay: input.nombreDisplay.trim(),
      ...(input.uid?.trim() ? { uid: input.uid.trim() } : {}),
      ...(input.email?.trim() ? { email: input.email.trim() } : {}),
    },
  };
}
