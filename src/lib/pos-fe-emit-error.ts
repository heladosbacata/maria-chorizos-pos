/**
 * Clasifica fallos de emitir-cobro (POS → WMS → Alegra/DIAN).
 * Regla 90 y otros rechazos DIAN no se reintentan: el consecutivo ya existe o el documento es inválido.
 */

export function esErrorFeReintentable(error: string): boolean {
  const e = (error ?? "").trim().toLowerCase();
  if (!e) return true;

  if (esRechazoDianOAlegraPermanente(e)) return false;

  return (
    pareceErrorDeRed(e) ||
    e.includes("502") ||
    e.includes("503") ||
    e.includes("504") ||
    e.includes("timeout") ||
    e.includes("timed out")
  );
}

function esRechazoDianOAlegraPermanente(eLower: string): boolean {
  if (eLower.includes("regla: 90") || eLower.includes("regla 90")) return true;
  if (eLower.includes("procesado anteriormente")) return true;
  if (eLower.includes("factura rechazada por la dian")) return true;
  if (eLower.includes("rechazo:") && eLower.includes("dian")) return true;
  if (eLower.includes("aep6008")) return true;
  if (eLower.includes("no está autorizad")) return true;
  return false;
}

function pareceErrorDeRed(eLower: string): boolean {
  return (
    eLower === "red" ||
    eLower.includes("failed to fetch") ||
    eLower.includes("network") ||
    eLower.includes("networkerror") ||
    eLower.includes("fetch failed") ||
    eLower.includes("econnreset") ||
    eLower.includes("etimedout") ||
    eLower.includes("sin conexión") ||
    eLower.includes("offline") ||
    eLower.includes("abort")
  );
}

/** Texto de alert en caja según si el fallo es reintentable. */
export function mensajeAlertaFeFallida(error: string, encolado: boolean): string {
  const base = `La venta se registró en caja, pero la factura electrónica no se pudo enviar a la DIAN:\n\n${error.trim()}`;
  if (encolado) {
    return `${base}\n\nSe reintentará automáticamente al recuperar conexión. Revisá también Espacio Franquiciado → Habilitaciones DIAN → Facturación electrónica o contactá a administración.`;
  }
  if (/regla\s*:?\s*90|procesado anteriormente/i.test(error)) {
    return (
      `${base}\n\n` +
      `Ese número de factura ya fue aceptado por la DIAN (duplicado de consecutivo). ` +
      `No se reintentará solo: hay que alinear el consecutivo del punto en administración (WMS / Alegra) con el siguiente libre ante la DIAN, y revisar si la factura ya aparece en el portal del proveedor. ` +
      `Contactá a administración; no sirve volver a cobrar la misma venta para «forzar» el envío.`
    );
  }
  return (
    `${base}\n\n` +
    `Este error no se reintenta solo (no es un fallo de red). Revisá Espacio Franquiciado → Habilitaciones DIAN → Facturación electrónica o contactá a administración.`
  );
}

export function mensajeColaFeTrasError(error: string, encolado: boolean): string {
  if (encolado) {
    return `La FE quedó en cola de reintento: ${error}`;
  }
  if (/regla\s*:?\s*90|procesado anteriormente/i.test(error)) {
    return `FE rechazada (Regla 90: documento ya procesado). No se encoló reintento; avisá a administración para sincronizar consecutivo: ${error}`;
  }
  return `FE no emitida (error no reintentable): ${error}`;
}
