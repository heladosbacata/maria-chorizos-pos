import { fetchCatalogoInsumosDesdeSheet } from "@/lib/catalogo-insumos-sheet-client";
import { auth } from "@/lib/firebase";
import { getCatalogoPOS } from "@/lib/catalogo-pos";
import { mergeCatalogoInventarioBase, mergeCatalogoInventarioConProductosPos } from "@/lib/inventario-pos-catalogo";
import {
  insumoKitDesdeCatalogoPorSku,
  listarInsumosKitPorPuntoVenta,
  normSkuInventario,
  registrarMovimientoInventario,
} from "@/lib/inventario-pos-firestore";
import { anularVentaPosCloud } from "@/lib/pos-ventas-cloud-client";
import { marcarVentaAnuladaLocal, type VentaGuardadaLocal } from "@/lib/pos-ventas-local-storage";
import type { InsumoKitItem } from "@/types/inventario-pos";

async function catalogoInsumosKitParaAnulacion(puntoVenta: string): Promise<InsumoKitItem[]> {
  const [sheetRes, desdeFs, posRes] = await Promise.all([
    fetchCatalogoInsumosDesdeSheet(puntoVenta),
    listarInsumosKitPorPuntoVenta(puntoVenta),
    getCatalogoPOS(null, puntoVenta),
  ]);
  const base = mergeCatalogoInventarioBase(sheetRes.ok && sheetRes.data.length > 0 ? sheetRes.data : [], desdeFs);
  return mergeCatalogoInventarioConProductosPos(base, posRes.ok ? posRes.productos ?? [] : []).items;
}

/**
 * Anula una venta guardada en este equipo: marca local, devuelve stock POS por línea (ajuste positivo)
 * y replica anulación en la nube del POS si hay sesión.
 */
export async function anularVentaEnEquipoInventarioYNube(params: {
  uid: string;
  email: string | null;
  puntoVenta: string;
  ventaId: string;
  motivo: string;
  /**
   * Si es true: solo marca la venta anulada y replica en nube; no hace ajustes + en inventario POS por SKU de línea.
   * Útil cuando el descuento real fue por ensamble WMS aún no aplicado o ya revertido por otro flujo.
   */
  omitirDevolucionInventarioPos?: boolean;
}): Promise<
  { ok: true; venta: VentaGuardadaLocal; fallosSku: string[] } | { ok: false; message: string }
> {
  const { uid, email, puntoVenta, ventaId, motivo, omitirDevolucionInventarioPos } = params;
  const motivoTrim = motivo.trim().slice(0, 500);
  if (!motivoTrim) return { ok: false, message: "Falta el motivo de anulación." };

  const actualizada = marcarVentaAnuladaLocal(uid, ventaId, { motivo: motivoTrim, anuladaPorUid: uid });
  if (!actualizada) {
    return { ok: false, message: "No se encontró la venta en este equipo o ya estaba anulada." };
  }

  const pv = puntoVenta.trim();
  const fallosSku: string[] = [];

  if (!omitirDevolucionInventarioPos) {
    const catalog = await catalogoInsumosKitParaAnulacion(pv);
    const notasBase = `Anulación recibo ${ventaId}. ${motivoTrim}`;

    for (const linea of actualizada.lineas) {
      const qty = linea.cantidad;
      if (!(qty > 0)) continue;
      const insumo = insumoKitDesdeCatalogoPorSku(catalog, linea.inventarioLookupKey || linea.lineId || linea.sku);
      if (!insumo) {
        fallosSku.push(linea.inventarioLookupKey || linea.lineId || linea.sku || linea.descripcion);
        continue;
      }
      const r = await registrarMovimientoInventario({
        puntoVenta: pv,
        insumo,
        tipo: "ajuste_positivo",
        cantidad: qty,
        notas: notasBase.slice(0, 500),
        uid,
        email,
      });
      if (!r.ok) {
        fallosSku.push(`${linea.sku}: ${r.message ?? "error"}`);
      }
    }
  }

  try {
    const token = await auth?.currentUser?.getIdToken();
    if (token) {
      const sync = await anularVentaPosCloud(token, {
        ventaLocalId: ventaId,
        motivo: motivoTrim,
        anuladaEnIso: actualizada.anuladaEnIso ?? new Date().toISOString(),
      });
      if (!sync.ok) {
        console.warn("Anulación local OK; nube:", sync.message);
      }
    }
  } catch (e) {
    console.warn("Anulación local OK; no se pudo replicar en nube.", e);
  }

  return { ok: true, venta: actualizada, fallosSku };
}
