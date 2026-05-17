import type { LineaComprobanteCorreo } from "@/lib/comprobante-correo-pos";

export type EnviarComprobanteCorreoBody = {
  to: string;
  puntoVenta: string;
  ventaLocalId?: string;
  comprobante: string;
  tipoLabel: string;
  total: number;
  fechaIso: string;
  lineas: LineaComprobanteCorreo[];
  clienteNombre?: string;
  clienteNit?: string;
  mensaje?: string;
  facturaElectronica?: { numero?: string; cufe?: string };
};

export async function enviarComprobantePorCorreo(
  token: string,
  body: EnviarComprobanteCorreoBody
): Promise<{ ok: true; enviadoAt: string; destino: string; via: string }> {
  const res = await fetch("/api/pos_comprobante_enviar_correo", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    message?: string;
    enviadoAt?: string;
    destino?: string;
    via?: string;
  };
  if (!res.ok || !data.ok) {
    throw new Error(data.message?.trim() || `Error ${res.status} al enviar correo.`);
  }
  return {
    ok: true,
    enviadoAt: data.enviadoAt ?? new Date().toISOString(),
    destino: data.destino ?? body.to,
    via: data.via ?? "smtp",
  };
}
