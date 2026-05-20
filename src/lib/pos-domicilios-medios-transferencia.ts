import {
  ETIQUETAS_MEDIO_TRANSFERENCIA,
  MEDIOS_TRANSFERENCIA_IDS,
  MEDIOS_TRANSFERENCIA_VACIOS,
  type MedioTransferenciaId,
  type MediosTransferenciaConfig,
} from "@/types/pos-domicilios-medios-transferencia";

/** Misma clave que «Espacio para franquiciados» en caja. */
export const CLAVE_ESPACIO_FRANQUICIADOS = "MC2026";

export function normalizarMediosTransferencia(raw: unknown): MediosTransferenciaConfig {
  const out = { ...MEDIOS_TRANSFERENCIA_VACIOS };
  if (!raw || typeof raw !== "object") return out;
  const o = raw as Record<string, unknown>;
  for (const id of MEDIOS_TRANSFERENCIA_IDS) {
    const v = o[id];
    if (typeof v === "string") out[id] = v.trim().slice(0, 500);
  }
  return out;
}

export function tieneMediosTransferenciaConfigurados(m: MediosTransferenciaConfig): boolean {
  return MEDIOS_TRANSFERENCIA_IDS.some((id) => Boolean(m[id]?.trim()));
}

export function mediosTransferenciaParaCliente(m: MediosTransferenciaConfig): Array<{
  id: MedioTransferenciaId;
  etiqueta: string;
  valor: string;
}> {
  return MEDIOS_TRANSFERENCIA_IDS.filter((id) => Boolean(m[id]?.trim())).map((id) => ({
    id,
    etiqueta: ETIQUETAS_MEDIO_TRANSFERENCIA[id],
    valor: m[id].trim(),
  }));
}
