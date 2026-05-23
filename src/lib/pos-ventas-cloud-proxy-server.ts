import type { NextApiRequest } from "next";

/**
 * En desarrollo local, reenvía APIs del POS al despliegue en Vercel (mismo Firebase, mismo Bearer).
 * Usa POS_DEPLOY_PROXY_URL o POS_VENTAS_CLOUD_PROXY_URL (p. ej. https://maria-chorizos-pos.vercel.app).
 */
export function posDeployProxyBaseUrl(): string | null {
  const raw =
    process.env.POS_DEPLOY_PROXY_URL?.trim() || process.env.POS_VENTAS_CLOUD_PROXY_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/$/, "");
}

/** @deprecated Usar posDeployProxyBaseUrl */
export const posVentasCloudProxyBaseUrl = posDeployProxyBaseUrl;

export function puedeUsarPosDeployProxyLocal(): boolean {
  const base = posDeployProxyBaseUrl();
  if (!base) return false;
  if (process.env.NODE_ENV === "production") {
    return process.env.POS_VENTAS_CLOUD_PROXY_IN_PRODUCTION === "1";
  }
  return true;
}

/** @deprecated Usar puedeUsarPosDeployProxyLocal */
export const puedeUsarProxyVentasCloudLocal = puedeUsarPosDeployProxyLocal;

export async function proxyPosApiRoute(
  req: NextApiRequest,
  ruta: string
): Promise<{ status: number; body: unknown } | null> {
  if (!puedeUsarPosDeployProxyLocal()) return null;
  const base = posDeployProxyBaseUrl();
  if (!base) return null;

  const url = `${base}/api/${ruta}`;
  const auth = req.headers.authorization;
  const headers: HeadersInit = {};
  if (auth) headers.Authorization = auth;

  try {
    if (req.method === "GET") {
      const r = await fetch(url, { headers });
      return { status: r.status, body: await r.json().catch(() => ({})) };
    }
    if (req.method === "POST" || req.method === "PATCH") {
      const r = await fetch(url, {
        method: req.method,
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(req.body ?? {}),
      });
      return { status: r.status, body: await r.json().catch(() => ({})) };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      status: 502,
      body: {
        ok: false,
        message: `No se pudo conectar con el proxy de ventas (${base}): ${msg}`,
      },
    };
  }
  return null;
}

export async function proxyApiVentasCloud(
  req: NextApiRequest,
  ruta: "pos_ventas_cloud" | "pos_venta_cloud"
): Promise<{ status: number; body: unknown } | null> {
  return proxyPosApiRoute(req, ruta);
}

export function mensajeCorreoPosSinConfigLocal(): string {
  const proxy = posDeployProxyBaseUrl();
  if (proxy && puedeUsarPosDeployProxyLocal()) {
    return (
      "Correo no configurado en este servidor local. Agrega SMTP_* o ZOHO_* o RESEND_* en .env.local " +
      `(copia desde Vercel), o define POS_DEPLOY_PROXY_URL=${proxy} y reinicia npm run dev para enviar vía producción.`
    );
  }
  return (
    "Envío por correo no configurado. Agrega SMTP_HOST, SMTP_USER y SMTP_PASS; o ZOHO_SMTP_USER y ZOHO_SMTP_PASSWORD; o RESEND_API_KEY en .env.local o Vercel."
  );
}

export function mensajeVentasCloudSinAdminLocal(): string {
  const proxy = posDeployProxyBaseUrl();
  if (proxy && !puedeUsarProxyVentasCloudLocal()) {
    return "Proxy de ventas deshabilitado en producción (usa FIREBASE_SERVICE_ACCOUNT_JSON).";
  }
  if (proxy) {
    return `Sin Firebase Admin en este servidor. Configura FIREBASE_SERVICE_ACCOUNT_JSON en .env.local o usa POS_VENTAS_CLOUD_PROXY_URL=${proxy} (solo desarrollo).`;
  }
  return (
    "Sin Firebase Admin en local: agrega FIREBASE_SERVICE_ACCOUNT_JSON en .env.local (copia el valor de Vercel del POS) " +
    "o POS_VENTAS_CLOUD_PROXY_URL=https://maria-chorizos-pos.vercel.app para leer ventas de producción en desarrollo."
  );
}
