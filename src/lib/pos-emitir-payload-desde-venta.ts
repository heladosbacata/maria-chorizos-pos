import type { VentaGuardadaLocal } from "@/lib/pos-ventas-local-storage";
import type { EmitirCobroPayload } from "@/lib/wms-pos-dian-client";

/**
 * Reconstruye el cuerpo de emitir-cobro desde una venta guardada (misma idea que caja al armar líneas FE).
 * Útil para JSON de depuración cuando no hay cola de reintento.
 */
export function emitirCobroPayloadDesdeVentaLocal(v: VentaGuardadaLocal): EmitirCobroPayload {
  const lineas = v.lineas.map((l) => ({
    descripcion: (l.descripcion || "Ítem").trim().slice(0, 500),
    sku: l.sku,
    cantidad: l.cantidad,
    montoConIva: Math.round(l.precioUnitario * l.cantidad * 100) / 100,
  }));
  let clienteNombre = "Consumidor final";
  let clienteNit = "222222222";
  if (v.clienteNombreVenta?.trim()) clienteNombre = v.clienteNombreVenta.trim();
  if (v.clienteNitVenta?.trim()) clienteNit = v.clienteNitVenta.trim();
  return {
    fecha: v.fechaYmd,
    lineas,
    clienteNombre,
    clienteNit,
    observaciones: v.pagoResumen?.trim().slice(0, 400) || undefined,
    ventaLocalId: v.id,
  };
}
