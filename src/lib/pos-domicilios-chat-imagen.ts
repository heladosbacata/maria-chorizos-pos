/**
 * Comprime una imagen del comprobante de transferencia para enviarla por el chat de domicilios (data URL).
 * Solo para uso en el navegador (landing /pedidos).
 */
export async function comprimirComprobanteTransferenciaParaChat(
  file: File,
  opts?: { maxAncho?: number; calidad?: number; maxBytesAprox?: number }
): Promise<{ dataUrl: string; nombre: string } | null> {
  if (typeof window === "undefined" || typeof document === "undefined") return null;
  const maxAncho = opts?.maxAncho ?? 960;
  const calidad = opts?.calidad ?? 0.82;
  const maxBytesAprox = opts?.maxBytesAprox ?? 240_000;

  if (!file.type.startsWith("image/")) {
    return null;
  }

  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return null;

  const w = bitmap.width;
  const h = bitmap.height;
  if (!w || !h) {
    bitmap.close();
    return null;
  }

  const scale = w > maxAncho ? maxAncho / w : 1;
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return null;
  }
  ctx.drawImage(bitmap, 0, 0, cw, ch);
  bitmap.close();

  let q = calidad;
  let dataUrl = canvas.toDataURL("image/jpeg", q);
  let intentos = 0;
  while (dataUrl.length > maxBytesAprox && intentos < 6) {
    q -= 0.1;
    intentos += 1;
    if (q < 0.35) break;
    dataUrl = canvas.toDataURL("image/jpeg", q);
  }

  if (dataUrl.length > 290_000) {
    return null;
  }

  const nombre = (file.name || "comprobante.jpg").replace(/[^\w.\-()\s]/g, "").slice(0, 120) || "comprobante.jpg";
  return { dataUrl, nombre };
}
