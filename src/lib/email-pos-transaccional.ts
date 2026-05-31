import { enviarCorreoComoInformePos } from "@/lib/enviar-correo-informe-pos-servidor";

/**
 * Envío transaccional desde APIs del POS (misma lógica que informe de ventas / cierre de turno).
 */
export async function enviarCorreoTransaccionalPos(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  cc?: string[];
}): Promise<{ ok: true; via: string } | { ok: false; error: string }> {
  const r = await enviarCorreoComoInformePos(opts);
  if (!r.ok) return { ok: false, error: r.message };
  return { ok: true, via: r.via };
}
