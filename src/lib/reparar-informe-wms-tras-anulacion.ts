/**
 * Tras anular un ticket en posVentasCloud, sincroniza INFORME_VENTAS_MC con el WMS.
 * Fire-and-forget: no bloquea la respuesta al cajero.
 */
import { getWmsPublicBaseUrl } from "@/lib/wms-public-base";

export async function repararInformeWmsTrasAnulacion(opts: {
  token: string;
  fechaYmd: string;
  puntoVenta: string;
}): Promise<void> {
  const base = getWmsPublicBaseUrl().replace(/\/$/, "");
  const fechaYmd = String(opts.fechaYmd ?? "").trim().slice(0, 10);
  const puntoVenta = String(opts.puntoVenta ?? "").trim();
  if (!base || !/^\d{4}-\d{2}-\d{2}$/.test(fechaYmd) || !puntoVenta) return;

  try {
    const r = await fetch(`${base}/api/ventas/reparar-informe-desde-tickets`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fechaYmd, puntoVenta }),
    });
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      console.warn("[repararInformeWmsTrasAnulacion]", r.status, body.slice(0, 300));
    }
  } catch (e) {
    console.warn("[repararInformeWmsTrasAnulacion]", e);
  }
}
