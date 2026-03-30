import QRCode from "qrcode";

export interface FidelizacionLineaSku {
  sku: string;
  cantidad: number;
}

/**
 * JSON compacto para QR de fidelización (app María Chorizos).
 * Incluye id de venta para evitar doble uso; el backend puede validar y marcar consumido.
 */
export function construirPayloadFidelizacionV1(params: {
  ventaId: string;
  puntoVenta: string;
  isoTimestamp: string;
  total: number;
  lineas: FidelizacionLineaSku[];
}): string {
  const obj = {
    v: 1 as const,
    i: params.ventaId.trim(),
    p: params.puntoVenta.trim(),
    t: params.isoTimestamp.trim(),
    T: Math.round(params.total * 100) / 100,
    k: params.lineas.map((l) => [String(l.sku).trim(), Number(l.cantidad) || 0] as [string, number]),
  };
  return JSON.stringify(obj);
}

export async function generarDataUrlQrFidelizacion(payloadUtf8: string): Promise<string> {
  return QRCode.toDataURL(payloadUtf8, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 220,
    type: "image/png",
  });
}
