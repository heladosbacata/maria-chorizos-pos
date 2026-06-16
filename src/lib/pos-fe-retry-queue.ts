/**
 * Cobros con factura electrónica cuya emisión falló tras registrar la venta en caja.
 * Reintenta POST emitir-cobro con el mismo payload (idempotencia depende de Alegra/WMS).
 */

import { actualizarVentaLocalFacturaElectronica } from "@/lib/pos-ventas-local-storage";
import { actualizarFeVentaPosCloud } from "@/lib/pos-ventas-cloud-client";
import type { EmitirCobroPayload } from "@/lib/wms-pos-dian-client";
import { wmsPosAlegraEmitirCobro } from "@/lib/wms-pos-dian-client";

const STORAGE_KEY = "pos_mc_fe_emitir_pendiente_v1";
const MAX = 80;

export type FeEmitirQueueItem = {
  id: string;
  uid: string;
  ventaLocalId: string | null;
  payload: EmitirCobroPayload;
};

type Stored = FeEmitirQueueItem;

function leer(): Stored[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const p = JSON.parse(raw) as unknown;
    if (!Array.isArray(p)) return [];
    return p.filter(
      (x): x is Stored =>
        x != null &&
        typeof x === "object" &&
        typeof (x as Stored).id === "string" &&
        typeof (x as Stored).uid === "string" &&
        (x as Stored).payload != null &&
        typeof (x as Stored).payload === "object"
    );
  } catch {
    return [];
  }
}

function escribir(lista: Stored[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lista));
  } catch {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lista.slice(-Math.floor(MAX / 2))));
    } catch {
      /* ignore */
    }
  }
}

export function encolarFeEmitirPendiente(
  uid: string,
  ventaLocalId: string | null | undefined,
  payload: EmitirCobroPayload
): void {
  if (typeof window === "undefined" || !uid.trim()) return;
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const prev = leer();
  const body = JSON.parse(JSON.stringify(payload)) as EmitirCobroPayload;
  const next = [
    ...prev,
    {
      id,
      uid: uid.trim(),
      ventaLocalId: ventaLocalId?.trim() || null,
      payload: body,
    },
  ];
  escribir(next.length > MAX ? next.slice(next.length - MAX) : next);
}

export function contarFeEmitirPendientes(): number {
  return leer().length;
}

/** Payload guardado al fallar emitir-cobro (misma forma que envía el reintento). */
export function buscarPayloadPendientePorVenta(uid: string, ventaLocalId: string): EmitirCobroPayload | null {
  const u = uid.trim();
  const vid = ventaLocalId.trim();
  if (!u || !vid) return null;
  const coinciden = leer().filter((x) => x.uid === u && x.ventaLocalId === vid);
  if (coinciden.length === 0) return null;
  const last = coinciden[coinciden.length - 1];
  try {
    return JSON.parse(JSON.stringify(last.payload)) as EmitirCobroPayload;
  } catch {
    return null;
  }
}

/** Tras emitir FE con éxito, evita que la cola vuelva a POSTear el mismo cobro. */
export function removerFeEmitirPendientePorVenta(uid: string, ventaLocalId: string): void {
  const u = uid.trim();
  const vid = ventaLocalId.trim();
  if (!u || !vid || typeof window === "undefined") return;
  const prev = leer();
  const next = prev.filter((x) => !(x.uid === u && x.ventaLocalId === vid));
  if (next.length !== prev.length) escribir(next);
}

let inflight = false;

/** Procesa la cola en orden; ante el primer fallo deja el resto intacto. */
export async function procesarColaFeEmitir(getIdToken: () => Promise<string | null>): Promise<void> {
  if (typeof window === "undefined" || inflight) return;
  inflight = true;
  try {
    let lista = leer();
    while (lista.length > 0) {
      const [first, ...rest] = lista;
      const token = await getIdToken();
      if (!token) break;
      const r = await wmsPosAlegraEmitirCobro(token, first.payload);
      if (!r.ok) break;
      if (first.ventaLocalId) {
        actualizarVentaLocalFacturaElectronica(first.uid, first.ventaLocalId, {
          numero: r.numeroFactura,
          cufe: r.alegraCufe,
          enviadoAt: r.enviadoAt,
        });
        void actualizarFeVentaPosCloud(token, {
          ventaLocalId: first.ventaLocalId,
          facturaElectronicaNumero: r.numeroFactura,
          facturaElectronicaCufe: r.alegraCufe,
          facturaElectronicaEnviadoAt: r.enviadoAt,
        }).catch(() => {
          /* nube opcional */
        });
      }
      lista = rest;
      escribir(lista);
    }
  } finally {
    inflight = false;
  }
}
