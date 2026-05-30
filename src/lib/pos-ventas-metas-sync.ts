import { puntoVentaCoincide } from "@/lib/punto-venta-clave";
import {
  listarVentasPuntoVentaEnEsteEquipo,
  mergeVentasReporteNubeLocal,
  migrarVentasSkuCompuestoEnEquipo,
  normalizarLineaVentaSkuCompuesto,
  type VentaGuardadaLocal,
} from "@/lib/pos-ventas-local-storage";

/** Une ventas locales + nube y normaliza líneas para conteo de metas/retos. */
export function mergeVentasParaMetasAvance(
  local: VentaGuardadaLocal[],
  nube: VentaGuardadaLocal[],
  puntoVenta: string
): VentaGuardadaLocal[] {
  const pv = puntoVenta.trim();
  const filtrarPv = (rows: VentaGuardadaLocal[]) =>
    pv ? rows.filter((v) => puntoVentaCoincide(v.puntoVenta, pv)) : rows;

  const merged = mergeVentasReporteNubeLocal(filtrarPv(local), filtrarPv(nube));
  return merged.map((v) => ({
    ...v,
    lineas: v.lineas.map(normalizarLineaVentaSkuCompuesto),
  }));
}

/**
 * Ventas del punto listas para el banner de metas: migra SKU históricos, mezcla local + nube.
 */
export function ventasParaMetasAvance(
  puntoVenta: string,
  ventasNube: VentaGuardadaLocal[] | null
): VentaGuardadaLocal[] {
  const pv = puntoVenta.trim();
  if (!pv) return [];
  migrarVentasSkuCompuestoEnEquipo(pv);
  const local = listarVentasPuntoVentaEnEsteEquipo(pv);
  if (ventasNube === null) {
    return local.map((v) => ({
      ...v,
      lineas: v.lineas.map(normalizarLineaVentaSkuCompuesto),
    }));
  }
  return mergeVentasParaMetasAvance(local, ventasNube, pv);
}
