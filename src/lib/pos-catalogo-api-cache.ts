/**
 * Caché en memoria del proxy /api/productos_listar (servidor Node único en despliegue propio).
 */

const TTL_MS = Number(process.env.POS_CATALOGO_API_CACHE_MS) > 0
  ? Number(process.env.POS_CATALOGO_API_CACHE_MS)
  : 180_000;

type Entry = { expiresAt: number; body: unknown };

const cache = new Map<string, Entry>();
const inFlight = new Map<string, Promise<unknown>>();

export function catalogoApiCacheKey(puntoVenta: string, authHeader?: string): string {
  const pv = puntoVenta.trim() || "_sin_pv_";
  const auth = (authHeader ?? "").slice(-24) || "anon";
  return `${pv}::${auth}`;
}

export async function withCatalogoApiCache<T>(
  key: string,
  fn: () => Promise<T>
): Promise<T> {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) {
    return hit.body as T;
  }

  let pending = inFlight.get(key) as Promise<T> | undefined;
  if (pending) return pending;

  pending = fn().then((body) => {
    cache.set(key, { expiresAt: now + TTL_MS, body });
    inFlight.delete(key);
    return body;
  });
  inFlight.set(key, pending as Promise<unknown>);
  pending.catch(() => inFlight.delete(key));
  return pending;
}
