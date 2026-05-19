import { getFirestore } from "firebase-admin/firestore";
import { getFirebaseAdminApp } from "@/lib/firebase-admin-server";
import {
  DEFAULT_COSTO_DOMICILIO_COP,
  DEFAULT_UMBRAL_GRATIS_COP,
} from "@/lib/pos-domicilios-tarifa-defaults";
import { normalizarHoraConfig } from "@/lib/pos-domicilios-horario";

export { DEFAULT_COSTO_DOMICILIO_COP, DEFAULT_UMBRAL_GRATIS_COP } from "@/lib/pos-domicilios-tarifa-defaults";

const COLL = "posDomiciliosConfig";

const DEFAULT_HORA_INICIO = "07:00";
const DEFAULT_HORA_FIN = "22:00";

function normPv(puntoVenta: string): string {
  return puntoVenta.trim().toLowerCase();
}

type MemVal = {
  costoDomicilioCop: number;
  umbralGratisCop: number;
  domiciliosHabilitados: boolean;
  domiciliosHoraInicio: string;
  domiciliosHoraFin: string;
};

const globalForMem = globalThis as typeof globalThis & {
  __posDomiciliosTarifaMem__?: Map<string, MemVal>;
};

function memMap(): Map<string, MemVal> {
  if (!globalForMem.__posDomiciliosTarifaMem__) {
    globalForMem.__posDomiciliosTarifaMem__ = new Map();
  }
  return globalForMem.__posDomiciliosTarifaMem__;
}

function defaultsMem(): MemVal {
  return {
    costoDomicilioCop: DEFAULT_COSTO_DOMICILIO_COP,
    umbralGratisCop: DEFAULT_UMBRAL_GRATIS_COP,
    domiciliosHabilitados: true,
    domiciliosHoraInicio: DEFAULT_HORA_INICIO,
    domiciliosHoraFin: DEFAULT_HORA_FIN,
  };
}

/** Config pública del punto para tarifa, horario y bandera de domicilios. */
export type DomicilioTarifaPublica = {
  costoDomicilioCop: number;
  umbralGratisCop: number;
  domiciliosHabilitados: boolean;
  domiciliosHoraInicio: string;
  domiciliosHoraFin: string;
};

function leerHorarioDeDoc(d: Record<string, unknown>): { ini: string; fin: string } {
  const hiRaw = typeof d.domiciliosHoraInicio === "string" ? d.domiciliosHoraInicio : "";
  const hfRaw = typeof d.domiciliosHoraFin === "string" ? d.domiciliosHoraFin : "";
  const hi = normalizarHoraConfig(hiRaw) ?? DEFAULT_HORA_INICIO;
  const hf = normalizarHoraConfig(hfRaw) ?? DEFAULT_HORA_FIN;
  return { ini: hi, fin: hf };
}

export async function getDomicilioTarifaConfig(puntoVenta: string): Promise<DomicilioTarifaPublica> {
  const pv = puntoVenta.trim();
  if (!pv) {
    return defaultsMem();
  }
  const nk = normPv(pv);
  const app = getFirebaseAdminApp();
  if (!app) {
    const m = memMap().get(nk);
    return m ?? defaultsMem();
  }
  const db = getFirestore(app);
  const snap = await db.collection(COLL).doc(nk).get();
  if (!snap.exists) {
    return defaultsMem();
  }
  const d = snap.data() as Record<string, unknown>;
  const costoRaw = d.costoDomicilioCop;
  const costo =
    typeof costoRaw === "number" && Number.isFinite(costoRaw) && costoRaw >= 0
      ? Math.round(costoRaw)
      : DEFAULT_COSTO_DOMICILIO_COP;
  const umbralRaw = d.umbralGratisCop;
  const umbral =
    typeof umbralRaw === "number" && Number.isFinite(umbralRaw) && umbralRaw >= 5000
      ? Math.round(umbralRaw)
      : DEFAULT_UMBRAL_GRATIS_COP;
  const domRaw = d.domiciliosHabilitados;
  const domiciliosHabilitados = domRaw === false ? false : true;
  const { ini, fin } = leerHorarioDeDoc(d);
  return {
    costoDomicilioCop: costo,
    umbralGratisCop: umbral,
    domiciliosHabilitados,
    domiciliosHoraInicio: ini,
    domiciliosHoraFin: fin,
  };
}

export async function setDomicilioTarifaConfig(params: {
  puntoVenta: string;
  costoDomicilioCop?: number;
  umbralGratisCop?: number;
  domiciliosHabilitados?: boolean;
  domiciliosHoraInicio?: string;
  domiciliosHoraFin?: string;
}): Promise<{ ok: boolean; message?: string }> {
  const pv = params.puntoVenta.trim();
  if (!pv) return { ok: false, message: "puntoVenta es obligatorio." };

  const tieneTarifa = params.costoDomicilioCop !== undefined;
  const tieneOperacion =
    params.domiciliosHabilitados !== undefined ||
    params.domiciliosHoraInicio !== undefined ||
    params.domiciliosHoraFin !== undefined ||
    params.umbralGratisCop !== undefined;

  if (!tieneTarifa && !tieneOperacion) {
    return { ok: false, message: "Indicá al menos un campo para actualizar." };
  }

  const actual = await getDomicilioTarifaConfig(pv);
  const costo =
    params.costoDomicilioCop !== undefined ? Math.round(params.costoDomicilioCop) : actual.costoDomicilioCop;
  if (!Number.isFinite(costo) || costo < 0 || costo > 500_000) {
    return { ok: false, message: "Costo de domicilio fuera de rango válido." };
  }
  const umbral =
    params.umbralGratisCop !== undefined ? Math.round(params.umbralGratisCop) : actual.umbralGratisCop;
  if (!Number.isFinite(umbral) || umbral < 5000 || umbral > 50_000_000) {
    return { ok: false, message: "Umbral de domicilio gratis inválido." };
  }

  let domiciliosHoraInicio = actual.domiciliosHoraInicio;
  let domiciliosHoraFin = actual.domiciliosHoraFin;
  if (params.domiciliosHoraInicio !== undefined) {
    const n = normalizarHoraConfig(params.domiciliosHoraInicio);
    if (!n) return { ok: false, message: "Hora de inicio inválida (usá HH:mm, 24 h)." };
    domiciliosHoraInicio = n;
  }
  if (params.domiciliosHoraFin !== undefined) {
    const n = normalizarHoraConfig(params.domiciliosHoraFin);
    if (!n) return { ok: false, message: "Hora de cierre inválida (usá HH:mm, 24 h)." };
    domiciliosHoraFin = n;
  }

  const domiciliosHabilitados =
    params.domiciliosHabilitados !== undefined ? params.domiciliosHabilitados : actual.domiciliosHabilitados;

  const nk = normPv(pv);
  const now = new Date().toISOString();
  const app = getFirebaseAdminApp();
  if (!app) {
    memMap().set(nk, {
      costoDomicilioCop: costo,
      umbralGratisCop: umbral,
      domiciliosHabilitados,
      domiciliosHoraInicio,
      domiciliosHoraFin,
    });
    return { ok: true };
  }
  const db = getFirestore(app);
  await db.collection(COLL).doc(nk).set(
    {
      puntoVenta: pv,
      puntoVentaNorm: nk,
      costoDomicilioCop: costo,
      umbralGratisCop: umbral,
      domiciliosHabilitados,
      domiciliosHoraInicio,
      domiciliosHoraFin,
      actualizadoEnIso: now,
    },
    { merge: true }
  );
  return { ok: true };
}
