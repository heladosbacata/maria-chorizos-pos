/**
 * Cobros con factura electrónica cuya emisión falló tras registrar la venta en caja.
 * Reintenta POST emitir-cobro solo ante fallos de red/5xx (idempotencia depende de Alegra/WMS).
 * Rechazos DIAN permanentes (p. ej. Regla 90) no deben encolarse; si quedan en cola, se descartan.
 */

import { esErrorFeReintentable } from "@/lib/pos-fe-emit-error";
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

/**
 * Encola solo si el error es reintentable (red/5xx). Devuelve true si quedó en cola.
 * Ante Regla 90 u otro rechazo DIAN, no encola (evitar quemar consecutivos y bloquear la cola).
 */
export function encolarFeEmitirPendiente(
  uid: string,
  ventaLocalId: string | null | undefined,
  payload: EmitirCobroPayload,
  errorMotivo?: string
): boolean {
  if (typeof window === "undefined" || !uid.trim()) return false;
  if (errorMotivo != null && !esErrorFeReintentable(errorMotivo)) return false;
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
  return true;
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

/**
 * Procesa la cola en orden.
 * - Éxito: saca el ítem y continúa.
 * - Fallo reintentable (red): deja el ítem y detiene (no quema el resto).
 * - Fallo permanente (Regla 90, etc.): saca el ítem y continúa (no bloquea la cola).
 */
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
      if (!r.ok) {
        if (esErrorFeReintentable(r.error)) {
          break;
        }
        console.warn("[pos-fe-retry] descarte de cola (error no reintentable):", r.error);
        lista = rest;
        escribir(lista);
        continue;
      }
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
