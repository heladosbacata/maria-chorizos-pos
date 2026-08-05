/**
 * Al marcar un domicilio como LISTO_PARA_DESPACHO, registra una venta en caja
 * (Ventas y comprobantes) y encola/emite factura electrónica si DIAN está activo.
 */

import { auth } from "@/lib/firebase";
import { ymdColombia } from "@/lib/fecha-colombia";
import { encolarFeEmitirPendiente } from "@/lib/pos-fe-retry-queue";
import { emitirVentaLocalRegistrada } from "@/lib/pos-metas-ventas-event";
import { registrarVentaPosCloud } from "@/lib/pos-ventas-cloud-client";
import {
  appendVentaLocal,
  actualizarVentaLocalClienteComprobante,
  actualizarVentaLocalFacturaElectronica,
  type LineaVentaGuardada,
} from "@/lib/pos-ventas-local-storage";
import { wmsPosAlegraEmitirCobro, wmsPosDianConfigGet, type EmitirCobroPayload } from "@/lib/wms-pos-dian-client";
import type { PedidoDomicilio } from "@/types/pos-domicilios";

export type EnviarDomicilioFacturacionResult = {
  ok: boolean;
  ventaLocalId?: string;
  emitida?: boolean;
  message: string;
};

function etiquetaMetodoPago(metodo: PedidoDomicilio["metodoPago"]): string {
  if (metodo === "datafono") return "Datáfono";
  if (metodo === "transferencia") return "Transferencia";
  return "Efectivo";
}

/** Une ítems del pedido en líneas de venta/FE (total repartido; residual en la última). */
export function lineasVentaDesdePedidoDomicilio(pedido: PedidoDomicilio): LineaVentaGuardada[] {
  const items = (pedido.items ?? []).map((x) => x.trim()).filter(Boolean);
  const total = Math.max(0, Math.round(pedido.total));
  if (items.length === 0) {
    return [
      {
        lineId: `dom-${pedido.id}-1`,
        sku: `DOM-${pedido.id}`,
        descripcion: `Pedido domicilio ${pedido.id}`,
        cantidad: 1,
        precioUnitario: total,
      },
    ];
  }
  const n = items.length;
  const base = Math.floor(total / n);
  let restante = total - base * n;
  return items.map((desc, i) => {
    const extra = restante > 0 ? 1 : 0;
    if (restante > 0) restante -= 1;
    const precio = base + extra;
    return {
      lineId: `dom-${pedido.id}-${i + 1}`,
      sku: `DOM-${pedido.id}-${i + 1}`,
      descripcion: desc.slice(0, 500) || `Ítem ${i + 1}`,
      cantidad: 1,
      precioUnitario: precio,
    };
  });
}

function payloadFeDesdePedido(
  pedido: PedidoDomicilio,
  lineas: LineaVentaGuardada[],
  ventaLocalId: string
): EmitirCobroPayload {
  return {
    fecha: ymdColombia(),
    lineas: lineas.map((l) => ({
      descripcion: (l.descripcion || "Ítem").trim().slice(0, 500),
      sku: l.sku,
      cantidad: l.cantidad,
      montoConIva: Math.round(l.precioUnitario * l.cantidad * 100) / 100,
    })),
    clienteNombre: pedido.cliente.trim() || "Consumidor final",
    clienteNit: "222222222",
    observaciones: `Domicilio ${pedido.id} · ${etiquetaMetodoPago(pedido.metodoPago)} · ${pedido.direccion}`.slice(
      0,
      400
    ),
    formaPago: etiquetaMetodoPago(pedido.metodoPago),
    ventaLocalId,
  };
}

async function marcarFacturacionEnServidor(params: {
  puntoVenta: string;
  pedidoId: string;
  facturaVentaLocalId: string;
  enviadoAFacturacionEnIso: string;
  facturaElectronicaCufe?: string;
}): Promise<void> {
  try {
    await fetch("/api/pos_domicilios_marcar_facturacion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
  } catch {
    /* no bloquear el flujo de caja */
  }
}

/**
 * Registra el pedido listo en Ventas (facturación) e intenta emitir FE si DIAN está habilitada.
 * Idempotente: si ya tiene `facturaVentaLocalId` / `enviadoAFacturacionEnIso`, no vuelve a crear venta.
 */
export async function enviarPedidoDomicilioAFacturacion(
  pedido: PedidoDomicilio
): Promise<EnviarDomicilioFacturacionResult> {
  if (pedido.facturaVentaLocalId?.trim() || pedido.enviadoAFacturacionEnIso?.trim()) {
    return {
      ok: true,
      ventaLocalId: pedido.facturaVentaLocalId,
      emitida: Boolean(pedido.facturaElectronicaCufe?.trim()),
      message: "Este pedido ya estaba en facturación.",
    };
  }

  const uid = auth?.currentUser?.uid?.trim();
  if (!uid) {
    return { ok: false, message: "Sin sesión de cajero: no se pudo enviar a facturación." };
  }

  const lineas = lineasVentaDesdePedidoDomicilio(pedido);
  const totalLineas = lineas.reduce((acc, l) => acc + Math.round(l.precioUnitario * l.cantidad), 0);
  const total = totalLineas > 0 ? totalLineas : Math.round(pedido.total);
  const pagoResumen = [
    `Domicilio ${pedido.id}`,
    etiquetaMetodoPago(pedido.metodoPago),
    pedido.canal,
    pedido.direccion,
  ]
    .filter(Boolean)
    .join(" · ");

  const ventaLocalId = appendVentaLocal(uid, {
    fechaYmd: ymdColombia(),
    isoTimestamp: new Date().toISOString(),
    puntoVenta: pedido.puntoVenta,
    total,
    lineas,
    pagoResumen,
    tipoComprobanteAlCobro: "factura_electronica",
    clienteNombreVenta: pedido.cliente.trim() || "Consumidor final",
    clienteNitVenta: "222222222",
  });

  if (!ventaLocalId) {
    return { ok: false, message: "No se pudo registrar la venta para facturación." };
  }

  emitirVentaLocalRegistrada();

  const enviadoAFacturacionEnIso = new Date().toISOString();
  let emitida = false;
  let cufe: string | undefined;
  let message =
    "Pedido listo enviado a facturación (Ventas y comprobantes). Podés emitir la factura electrónica desde ahí.";

  const token = await auth?.currentUser?.getIdToken().catch(() => null);
  if (token) {
    void registrarVentaPosCloud(token, {
      ventaLocalId,
      fechaYmd: ymdColombia(),
      isoTimestamp: enviadoAFacturacionEnIso,
      puntoVenta: pedido.puntoVenta,
      total,
      lineas,
      pagoResumen,
      wmsSincronizado: false,
      tipoComprobanteAlCobro: "factura_electronica",
    }).catch(() => undefined);

    const cfg = await wmsPosDianConfigGet(token);
    const digitosNit = cfg.ok ? cfg.emisorNit.replace(/\D/g, "") : "";
    const puedeEmitir = cfg.ok && cfg.habilitado && digitosNit.length >= 8;

    if (puedeEmitir) {
      const payload = payloadFeDesdePedido(pedido, lineas, ventaLocalId);
      const rFe = await wmsPosAlegraEmitirCobro(token, payload);
      if (rFe.ok) {
        emitida = true;
        cufe = rFe.alegraCufe;
        actualizarVentaLocalFacturaElectronica(uid, ventaLocalId, {
          numero: rFe.numeroFactura,
          cufe: rFe.alegraCufe,
          enviadoAt: rFe.enviadoAt,
        });
        actualizarVentaLocalClienteComprobante(uid, ventaLocalId, {
          nombre: pedido.cliente.trim() || "Consumidor final",
          nit: "222222222",
        });
        message = rFe.numeroFactura
          ? `Pedido listo facturado: ${rFe.numeroFactura}.`
          : "Pedido listo: factura electrónica enviada.";
      } else {
        encolarFeEmitirPendiente(uid, ventaLocalId, payload);
        message = `Pedido listo enviado a facturación. La FE quedó en cola de reintento: ${rFe.error}`;
      }
    }
  }

  await marcarFacturacionEnServidor({
    puntoVenta: pedido.puntoVenta,
    pedidoId: pedido.id,
    facturaVentaLocalId: ventaLocalId,
    enviadoAFacturacionEnIso,
    ...(cufe ? { facturaElectronicaCufe: cufe } : {}),
  });

  return { ok: true, ventaLocalId, emitida, message };
}
