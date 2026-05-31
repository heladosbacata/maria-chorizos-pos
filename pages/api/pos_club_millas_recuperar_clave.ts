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

  async function llamar(base: string): Promise<{ status: number; data: Record<string, unknown> }> {
    const url = `${base.replace(/\/$/, "")}${path}`;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body,
        cache: "no-store",
      });
      const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      return { status: response.status, data };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error de red";
      return { status: 0, data: { message: msg } };
    }
  }

  try {
    let { status, data } = await llamar(primaryBase);
    const puedeFallback =
      fallbackBase.toLowerCase() !== primaryBase.toLowerCase() &&
      (status === 0 || status === 404 || status >= 500);
    if (puedeFallback && (status === 0 || (wmsHostIsLocalhost(primaryBase) && status >= 500))) {
      const second = await llamar(fallbackBase);
      if (second.status >= 200 && second.status < 300) {
        status = second.status;
        data = second.data;
      } else if (status === 0 && second.status > 0) {
        status = second.status;
        data = second.data;
      }
    }

    if (status === 0) {
      const red = typeof data.message === "string" ? data.message : "";
      return res.status(200).json({
        ok: false,
        message:
          red.includes("fetch failed") || red.includes("Failed to fetch")
            ? "No se pudo contactar al WMS (red o URL). Revisá NEXT_PUBLIC_WMS_URL o probá de nuevo en unos segundos."
            : red || "No hubo respuesta del WMS al enviar la recuperación de clave.",
      });
    }

    if (data.ok !== true) {
      const err =
        (typeof data.error === "string" && data.error) ||
        (typeof data.message === "string" && data.message) ||
        `El WMS respondió HTTP ${status}.`;
      return res.status(200).json({
        ok: false,
        message: err,
      });
    }

    const correo = typeof data.correoEnmascarado === "string" ? data.correoEnmascarado.trim() : "";
    const msg =
      (typeof data.message === "string" ? data.message.trim() : "") ||
      (correo
        ? `Se envió la clave de acceso al correo ${correo}. Pedile al cliente que revise bandeja y spam.`
        : "Se envió la clave de acceso al correo registrado del cliente.");

    return res.status(200).json({
      ok: true,
      message: msg,
      ...(correo ? { correoEnmascarado: correo } : {}),
      ...(data.pinRenovado === true ? { pinRenovado: true } : {}),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No se pudo contactar al WMS.";
    return res.status(200).json({
      ok: false,
      message:
        msg.includes("fetch failed") || msg.includes("Failed to fetch")
          ? "No se pudo contactar al WMS (red o URL). Revisá NEXT_PUBLIC_WMS_URL."
          : msg,
    });
  }
}
