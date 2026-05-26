/** Prefijo autorizado en la resolución DIAN (ej. FE, SETT). Solo letras y números, mayúsculas. */
export function normalizarPrefijoFactura(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
}

/** Solo dígitos para número de resolución o consecutivos. */
export function soloDigitosDian(raw: string): string {
  return raw.replace(/\D/g, "");
}

export type DianHabilitacionDatosPaso1 = {
  dianTestSetId: string;
  dianResolutionNumber: string;
  prefijoFactura: string;
  consecutivoDesde: string;
  consecutivoHasta: string;
};

export function validarDatosPaso1(datos: DianHabilitacionDatosPaso1): string | null {
  if (!datos.dianTestSetId.trim()) {
    return "Pegá el identificador del set de pruebas.";
  }
  if (soloDigitosDian(datos.dianResolutionNumber).length < 5) {
    return "Ingresá el número de resolución DIAN (mínimo 5 dígitos).";
  }
  if (normalizarPrefijoFactura(datos.prefijoFactura).length < 1) {
    return "Ingresá el prefijo de facturación de tu resolución (ej. FE).";
  }
  const desde = soloDigitosDian(datos.consecutivoDesde);
  const hasta = soloDigitosDian(datos.consecutivoHasta);
  if (desde && hasta && Number(desde) > Number(hasta)) {
    return "El consecutivo «desde» no puede ser mayor que el «hasta».";
  }
  return null;
}
