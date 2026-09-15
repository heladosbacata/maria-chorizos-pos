/**
 * Sincronización de mínimos de Inventarios POS → Firestore (`posInventarioMinimos`).
 * Fuente de verdad por punto de venta (no el catálogo global de hoja).
 *
 * Prioridad al combinar: Firestore (`minimoPaquetes`) → localStorage → hoja (fallback débil).
 */

import { inferirUnidadesPorPaquete } from "@/lib/inventario-cargue-presentacion";
import { leerMinimosInventarioLocal } from "@/lib/inventario-minimos-local-storage";
import {
  guardarMinimoUsuarioInventario,
  listarMinimosUsuarioInventario,
  normSkuInventario,
} from "@/lib/inventario-pos-firestore";
import type { InsumoKitItem } from "@/types/inventario-pos";

function unidadesPorPaqueteInsumo(item: Pick<InsumoKitItem, "sku" | "descripcion" | "unidad">): number {
  return inferirUnidadesPorPaquete(`${item.sku} ${item.descripcion}`) ?? 1;
}

/**
 * Combina mínimos de nube y de este navegador (valor = paquetes).
 * Si un SKU está en Firestore, prevalece; si no, se usa el valor local.
 */
export function combinarMinimosUsuarioInventario(
  firestore: Map<string, number>,
  local: Map<string, number>
): Map<string, number> {
  const out = new Map<string, number>();
  for (const [k, v] of Array.from(local.entries())) {
    const nk = normSkuInventario(k);
    if (nk && Number.isFinite(v) && v >= 0) out.set(nk, v);
  }
  for (const [k, v] of Array.from(firestore.entries())) {
    const nk = normSkuInventario(k);
    if (nk && Number.isFinite(v) && v >= 0) out.set(nk, v);
  }
  return out;
}

/**
 * Mínimo efectivo en paquetes (o und si no hay empaque).
 * Prioriza override por PV (Firestore/local); la hoja global es solo fallback.
 */
export function minimoEfectivoInventario(
  minUsuario: number | undefined | null,
  minSheet: number | undefined | null
): number | null {
  if (minUsuario != null && Number.isFinite(minUsuario) && minUsuario >= 0) return minUsuario;
  if (minSheet != null && Number.isFinite(minSheet) && minSheet >= 0) return minSheet;
  return null;
}

/** stockMinimo (und) = minimoPaquetes × unidadesPorPaquete */
export function stockMinimoDesdePaquetes(minimoPaquetes: number, unidadesPorPaquete: number): number {
  const p = Number.isFinite(minimoPaquetes) && minimoPaquetes >= 0 ? minimoPaquetes : 0;
  const u = unidadesPorPaquete >= 1 ? unidadesPorPaquete : 1;
  return Math.round(p * u * 1000) / 1000;
}

/** faltantePaquetes = max(0, minimoPaquetes − stockActualPaquetes) */
export function faltantePaquetesPedido(minimoPaquetes: number, stockActualPaquetes: number): number {
  const min = Number.isFinite(minimoPaquetes) ? minimoPaquetes : 0;
  const stock = Number.isFinite(stockActualPaquetes) ? stockActualPaquetes : 0;
  return Math.max(0, Math.round((min - stock) * 1000) / 1000);
}

/**
 * Sube a Firestore los mínimos que solo existen en localStorage (migración one-shot por SKU).
 * No borra localStorage. No sobrescribe un SKU que ya está en la nube.
 */
export async function migrarMinimosLocalesAFirestore(params: {
  uid: string;
  puntoVenta: string;
  /** Si se omite, se lee de localStorage. */
  locales?: Map<string, number>;
  /** Si se omite, se consulta Firestore. */
  existentesFirestore?: Map<string, number>;
  /** Catálogo para enriquecer descripcion / unidadesPorPaquete. */
  insumos?: InsumoKitItem[];
}): Promise<{ migrados: number; errores: number }> {
  const uid = params.uid.trim();
  const pv = params.puntoVenta.trim();
  if (!uid || !pv) return { migrados: 0, errores: 0 };

  const locales = params.locales ?? leerMinimosInventarioLocal(uid, pv);
  if (locales.size === 0) return { migrados: 0, errores: 0 };

  const existentes = params.existentesFirestore ?? (await listarMinimosUsuarioInventario(pv));
  const porSku = new Map<string, InsumoKitItem>();
  for (const it of params.insumos ?? []) {
    const k = normSkuInventario(it.sku);
    if (k) porSku.set(k, it);
  }

  let migrados = 0;
  let errores = 0;

  for (const [skuNorm, minimo] of Array.from(locales.entries())) {
    if (existentes.has(skuNorm)) continue;
    const item = porSku.get(skuNorm);
    const uxp = item ? unidadesPorPaqueteInsumo(item) : 1;
    const r = await guardarMinimoUsuarioInventario({
      puntoVenta: pv,
      insumoSku: item?.sku ?? skuNorm,
      minimo,
      uid,
      descripcion: item?.descripcion,
      unidadesPorPaquete: uxp,
    });
    if (r.ok) {
      migrados += 1;
      existentes.set(skuNorm, minimo);
    } else {
      errores += 1;
    }
  }

  return { migrados, errores };
}

/**
 * Carga Firestore + local, migra lo que falte en la nube y devuelve el mapa combinado
 * (Firestore prevalece sobre local). Valores = minimoPaquetes.
 */
export async function cargarYSincronizarMinimosUsuarioInventario(
  uid: string,
  puntoVenta: string,
  insumos?: InsumoKitItem[]
): Promise<Map<string, number>> {
  const u = uid.trim();
  const pv = puntoVenta.trim();
  const local = leerMinimosInventarioLocal(u, pv);
  if (!u || !pv) return local;

  const firestore = await listarMinimosUsuarioInventario(pv);
  await migrarMinimosLocalesAFirestore({
    uid: u,
    puntoVenta: pv,
    locales: local,
    existentesFirestore: firestore,
    insumos,
  });
  return combinarMinimosUsuarioInventario(firestore, local);
}
