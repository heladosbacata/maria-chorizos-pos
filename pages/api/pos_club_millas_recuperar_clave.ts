import type { NextApiRequest, NextApiResponse } from "next";
import { getFirebaseAdminApp, getCreadorFirestoreContext } from "@/lib/firebase-admin-server";
import { POS_CONTADOR_ROLE } from "@/lib/auth-roles";
import { getWmsPublicBaseUrl, WMS_VERCEL_URL } from "@/lib/wms-public-base";

type Ok = {
  ok: true;
  message: string;
  correoEnmascarado?: string;
  pinRenovado?: boolean;
};
type Err = { ok: false; message: string };

function normalizarDocumento(raw: string): string {
  return raw.replace(/\s/g, "").replace(/[.\-]/g, "").trim();
}

function wmsHostIsLocalhost(base: string): boolean {
  try {
    const u = new URL(base.includes("://") ? base : `http://${base}`);
    const h = u.hostname.toLowerCase();
    return h === "localhost" || h === "127.0.0.1" || h === "::1";
  } catch {
    return /localhost|127\.0\.0\.1/i.test(base);
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<Ok | Err>) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  const app = getFirebaseAdminApp();
  if (!app) {
    return res.status(503).json({ ok: false, message: "Servidor POS sin Firebase Admin configurado." });
  }

  const token = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7).trim()
    : "";
  if (!token) {
    return res.status(401).json({ ok: false, message: "Falta Authorization Bearer." });
  }

  const ctx = await getCreadorFirestoreContext(app, token);
  if (!ctx.ok) {
    return res.status(401).json({ ok: false, message: ctx.message });
  }
  if (ctx.role === POS_CONTADOR_ROLE) {
    return res.status(403).json({ ok: false, message: "Las cuentas de contador no pueden enviar recuperación de clave." });
  }

  const rawDoc =
    typeof (req.body as { documento?: unknown })?.documento === "string"
      ? (req.body as { documento: string }).documento
      : "";
  const documento = normalizarDocumento(rawDoc);
  if (documento.length < 5) {
    return res.status(400).json({ ok: false, message: "Indica un documento válido (mínimo 5 dígitos)." });
  }

  const primaryBase = getWmsPublicBaseUrl().replace(/\/$/, "");
  const fallbackBase = (process.env.WMS_CATALOGO_FALLBACK_URL?.trim() || WMS_VERCEL_URL).replace(/\/$/, "");
  const path = "/api/club-de-millas/recuperar-clave";
  const body = JSON.stringify({ documento, numeroDocumento: documento, numeroIdentificacion: documento });

  async function llamar(base: string) {
    const url = `${base.replace(/\/$/, "")}${path}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body,
      cache: "no-store",
    });
    const data = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      message?: string;
      correoEnmascarado?: string;
      pinRenovado?: boolean;
    };
    return { status: response.status, data };
  }

  try {
    let { status, data } = await llamar(primaryBase);
    if (
      (status === 0 || status >= 500 || status === 404) &&
      wmsHostIsLocalhost(primaryBase) &&
      fallbackBase.toLowerCase() !== primaryBase.toLowerCase()
    ) {
      const second = await llamar(fallbackBase);
      if (second.status >= 200 && second.status < 300) {
        status = second.status;
        data = second.data;
      }
    }

    if (data.ok !== true) {
      return res.status(200).json({
        ok: false,
        message: data.error || data.message || `El WMS respondió HTTP ${status}.`,
      });
    }

    const correo = data.correoEnmascarado?.trim();
    const msg =
      data.message?.trim() ||
      (correo
        ? `Se envió la clave de acceso al correo ${correo}. Pedile al cliente que revise bandeja y spam.`
        : "Se envió la clave de acceso al correo registrado del cliente.");

    return res.status(200).json({
      ok: true,
      message: msg,
      ...(correo ? { correoEnmascarado: correo } : {}),
      ...(data.pinRenovado ? { pinRenovado: true } : {}),
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      message: e instanceof Error ? e.message : "No se pudo contactar al WMS.",
    });
  }
}
