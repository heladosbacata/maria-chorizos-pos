import { getFirestore } from "firebase-admin/firestore";
import { getFirebaseAdminApp } from "@/lib/firebase-admin-server";
import {
  DEFAULT_COSTO_DOMICILIO_COP,
  DEFAULT_UMBRAL_GRATIS_COP,
} from "@/lib/pos-domicilios-tarifa-defaults";

export { DEFAULT_COSTO_DOMICILIO_COP, DEFAULT_UMBRAL_GRATIS_COP } from "@/lib/pos-domicilios-tarifa-defaults";

const COLL = "posDomiciliosConfig";

function normPv(puntoVenta: string): string {
  return puntoVenta.trim().toLowerCase();
}

type MemVal = { costoDomicilioCop: number; umbralGratisCop: number };

const globalForMem = globalThis as typeof globalThis & {
  __posDomiciliosTarifaMem__?: Map<string, MemVal>;
};

function memMap(): Map<string, MemVal> {
  if (!globalForMem.__posDomiciliosTarifaMem__) {
    globalForMem.__posDomiciliosTarifaMem__ = new Map();
  }
  return globalForMem.__posDomiciliosTarifaMem__;
}

export type DomicilioTarifaPublica = {
  costoDomicilioCop: number;
  umbralGratisCop: number;
};

export async function getDomicilioTarifaConfig(puntoVenta: string): Promise<DomicilioTarifaPublica> {
  const pv = puntoVenta.trim();
  if (!pv) {
    return { costoDomicilioCop: DEFAULT_COSTO_DOMICILIO_COP, umbralGratisCop: DEFAULT_UMBRAL_GRATIS_COP };
  }
  const nk = normPv(pv);
  const app = getFirebaseAdminApp();
  if (!app) {
    const m = memMap().get(nk);
    return {
      costoDomicilioCop: m?.costoDomicilioCop ?? DEFAULT_COSTO_DOMICILIO_COP,
      umbralGratisCop: m?.umbralGratisCop ?? DEFAULT_UMBRAL_GRATIS_COP,
    };
  }
  const db = getFirestore(app);
  const snap = await db.collection(COLL).doc(nk).get();
  if (!snap.exists) {
    return { costoDomicilioCop: DEFAULT_COSTO_DOMICILIO_COP, umbralGratisCop: DEFAULT_UMBRAL_GRATIS_COP };
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
  return { costoDomicilioCop: costo, umbralGratisCop: umbral };
}

export async function setDomicilioTarifaConfig(params: {
  puntoVenta: string;
  costoDomicilioCop: number;
  umbralGratisCop?: number;
}): Promise<{ ok: boolean; message?: string }> {
  const pv = params.puntoVenta.trim();
  if (!pv) return { ok: false, message: "puntoVenta es obligatorio." };
  const costo = Math.round(params.costoDomicilioCop);
  if (!Number.isFinite(costo) || costo < 0 || costo > 500_000) {
    return { ok: false, message: "Costo de domicilio fuera de rango válido." };
  }
  const actual = await getDomicilioTarifaConfig(pv);
  const umbral =
    params.umbralGratisCop !== undefined
      ? Math.round(params.umbralGratisCop)
      : actual.umbralGratisCop;
  if (!Number.isFinite(umbral) || umbral < 5000 || umbral > 50_000_000) {
    return { ok: false, message: "Umbral de domicilio gratis inválido." };
  }
  const nk = normPv(pv);
  const now = new Date().toISOString();
  const app = getFirebaseAdminApp();
  if (!app) {
    memMap().set(nk, { costoDomicilioCop: costo, umbralGratisCop: umbral });
    return { ok: true };
  }
  const db = getFirestore(app);
  await db.collection(COLL).doc(nk).set(
    {
      puntoVenta: pv,
      puntoVentaNorm: nk,
      costoDomicilioCop: costo,
      umbralGratisCop: umbral,
      actualizadoEnIso: now,
    },
    { merge: true }
  );
  return { ok: true };
}
