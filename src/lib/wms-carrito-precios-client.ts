import {
  buildMapaPreciosCarrito,
  mapaPreciosCarritoVacio,
  type MapaPreciosCarrito,
  type ProductoCarritoPrecio,
} from "@/lib/precios-compra-carrito";

export type MapaPreciosCarritoResult = {
  ok: boolean;
  mapa: MapaPreciosCarrito;
  /** Productos con precio en DB_Carrito. */
  totalCarrito: number;
  message?: string;
};

/** Precios unitarios del carrito de compras (app + WMS), indexados por SKU y nombre. */
export async function fetchMapaPreciosCarritoCompras(): Promise<MapaPreciosCarritoResult> {
  try {
    const res = await fetch("/api/pos_carrito_precios", {
      method: "GET",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      data?: ProductoCarritoPrecio[];
      error?: string;
      _posUpstream?: string;
    };
    if (!res.ok || !data.ok || !Array.isArray(data.data)) {
      return {
        ok: false,
        mapa: mapaPreciosCarritoVacio(),
        totalCarrito: 0,
        message: data.error ?? `No se pudo leer el carrito (${res.status}).`,
      };
    }
    const mapa = buildMapaPreciosCarrito(data.data);
    return { ok: true, mapa, totalCarrito: mapa.porSku.size };
  } catch {
    return {
      ok: false,
      mapa: mapaPreciosCarritoVacio(),
      totalCarrito: 0,
      message: "No se pudo conectar con el carrito de compras.",
    };
  }
}
