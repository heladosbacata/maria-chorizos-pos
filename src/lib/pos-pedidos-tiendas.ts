import { puntoVentaFirestoreClave } from "@/lib/pos-domicilios-pv-clave";

export type TiendaPedidoMapa = {
  nombre: string;
  lat: number;
  lng: number;
  direccionCorta: string;
  zona: string;
};

/**
 * Tiendas de referencia para el mapa del cliente (Medellín / área metro).
 * El punto del QR siempre se incluye aunque no esté en esta lista.
 */
export const TIENDAS_PEDIDOS_MAPA: TiendaPedidoMapa[] = [
  {
    nombre: "Punto Demo App",
    lat: 6.2442,
    lng: -75.5812,
    direccionCorta: "Zona demo · Medellín",
    zona: "Centro",
  },
  {
    nombre: "Laureles",
    lat: 6.2453,
    lng: -75.5955,
    direccionCorta: "Laureles · Medellín",
    zona: "Laureles",
  },
  {
    nombre: "El Poblado",
    lat: 6.2086,
    lng: -75.567,
    direccionCorta: "El Poblado · Medellín",
    zona: "Poblado",
  },
  {
    nombre: "Belén",
    lat: 6.2312,
    lng: -75.6105,
    direccionCorta: "Belén · Medellín",
    zona: "Belén",
  },
  {
    nombre: "Envigado",
    lat: 6.1699,
    lng: -75.5854,
    direccionCorta: "Envigado",
    zona: "Envigado",
  },
];

const KEY_PUNTO_RECURRENTE = "pos_mc_pedidos_punto_recurrente_v1";

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const lat1 = (aLat * Math.PI) / 180;
  const lat2 = (bLat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function resolverTiendaPedido(nombre: string): TiendaPedidoMapa {
  const pv = nombre.trim();
  const hit = TIENDAS_PEDIDOS_MAPA.find(
    (t) => puntoVentaFirestoreClave(t.nombre) === puntoVentaFirestoreClave(pv)
  );
  if (hit) return hit;
  return {
    nombre: pv || "Punto María Chorizos",
    lat: 6.2442,
    lng: -75.5812,
    direccionCorta: pv ? `Punto ${pv}` : "Medellín",
    zona: "Tu zona",
  };
}

export function tiendasCercanasParaPedido(
  puntoActual: string,
  origen?: { lat: number; lng: number } | null
): Array<TiendaPedidoMapa & { distanciaKm: number | null; esActual: boolean }> {
  const actual = resolverTiendaPedido(puntoActual);
  const base = origen ?? { lat: actual.lat, lng: actual.lng };
  const porClave = new Map<string, TiendaPedidoMapa>();
  for (const t of TIENDAS_PEDIDOS_MAPA) porClave.set(puntoVentaFirestoreClave(t.nombre), t);
  porClave.set(puntoVentaFirestoreClave(actual.nombre), actual);

  return Array.from(porClave.values())
    .map((t) => ({
      ...t,
      distanciaKm: Number(haversineKm(base.lat, base.lng, t.lat, t.lng).toFixed(1)),
      esActual: puntoVentaFirestoreClave(t.nombre) === puntoVentaFirestoreClave(puntoActual),
    }))
    .sort((a, b) => {
      if (a.esActual) return -1;
      if (b.esActual) return 1;
      return (a.distanciaKm ?? 99) - (b.distanciaKm ?? 99);
    });
}

export function urlEmbedMapaTienda(t: TiendaPedidoMapa): string {
  const delta = 0.02;
  const left = t.lng - delta;
  const right = t.lng + delta;
  const top = t.lat + delta;
  const bottom = t.lat - delta;
  const bbox = `${left}%2C${bottom}%2C${right}%2C${top}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${t.lat}%2C${t.lng}`;
}

export function leerPuntoRecurrentePedidos(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(KEY_PUNTO_RECURRENTE)?.trim();
    return v || null;
  } catch {
    return null;
  }
}

export function guardarPuntoRecurrentePedidos(puntoVenta: string): void {
  if (typeof window === "undefined") return;
  const pv = puntoVenta.trim();
  if (!pv) return;
  try {
    localStorage.setItem(KEY_PUNTO_RECURRENTE, pv);
  } catch {
    /* quota */
  }
}
