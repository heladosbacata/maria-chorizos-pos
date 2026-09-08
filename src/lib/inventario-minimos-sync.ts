/**
 * Sincronización de mínimos de Inventarios POS → Firestore (`posInventarioMinimos`)
 * para que la app de franquiciados lea el mismo mínimo efectivo que el POS.
 *
 * Prioridad al combinar: Firestore → localStorage → (hoja en el caller).
 */

import { leerMinimosInventarioLocal } from "@/lib/inventario-minimos-local-storage";
import {
  guardarMinimoUsuarioInventario,
  listarMinimosUsuarioInventario,
  normSkuInventario,
} from "@/lib/inventario-pos-firestore";

/**
 * Combina mínimos de nube y de este navegador.
 * Si un SKU está en Firestore, prevalece; si no, se usa el valor local.
 */
export function combinarMinimosUsuarioInventario(
  firestore: Map<string, number>,
  local: Map<string, number>
): Map<string, number> {
  const out = new Map<string, number>();
  for (const [k, v] of local) {
    const nk = normSkuInventario(k);
    if (nk && Number.isFinite(v) && v >= 0) out.set(nk, v);
  }
  for (const [k, v] of firestore) {
    const nk = normSkuInventario(k);
    if (nk && Number.isFinite(v) && v >= 0) out.set(nk, v);
  }
  return out;
}

/** Mínimo efectivo mostrado en Inventarios / pedido sugerido. */
export function minimoEfectivoInventario(
  minUsuario: number | undefined | null,
  minSheet: number | undefined | null
): number | null {
  if (minUsuario != null && Number.isFinite(minUsuario) && minUsuario >= 0) return minUsuario;
  if (minSheet != null && Number.isFinite(minSheet) && minSheet >= 0) return minSheet;
  return null;
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
}): Promise<{ migrados: number; errores: number }> {
  const uid = params.uid.trim();
  const pv = params.puntoVenta.trim();
  if (!uid || !pv) return { migrados: 0, errores: 0 };

  const locales = params.locales ?? leerMinimosInventarioLocal(uid, pv);
  if (locales.size === 0) return { migrados: 0, errores: 0 };

  const existentes = params.existentesFirestore ?? (await listarMinimosUsuarioInventario(pv));
  let migrados = 0;
  let errores = 0;

  for (const [skuNorm, minimo] of locales) {
    if (existentes.has(skuNorm)) continue;
    const r = await guardarMinimoUsuarioInventario({
      puntoVenta: pv,
      insumoSku: skuNorm,
      minimo,
      uid,
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
 * (Firestore prevalece sobre local).
 */
export async function cargarYSincronizarMinimosUsuarioInventario(
  uid: string,
  puntoVenta: string
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
  });
  // Releer nube por si hubo migraciones (el mapa `firestore` ya se actualizó in-place).
  return combinarMinimosUsuarioInventario(firestore, local);
}
