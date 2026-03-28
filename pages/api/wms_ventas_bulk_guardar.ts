import type { NextApiRequest, NextApiResponse } from "next";
import { getWmsPublicBaseUrl } from "@/lib/wms-public-base";

/**
 * El navegador no puede llamar directo al WMS en otro dominio si falta CORS (falla como "Failed to fetch"
 * aunque haya internet). Este handler reenvía el POST al WMS desde el servidor del POS (mismo origen en el cliente).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  const root = getWmsPublicBaseUrl().replace(/\/$/, "");
  const url = `${root}/api/ventas/bulk-guardar`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const auth = req.headers.authorization;
  if (typeof auth === "string" && auth.trim()) {
    headers.Authorization = auth;
  }

  const body = JSON.stringify(req.body ?? {});

  let wmsRes: Response;
  try {
    wmsRes = await fetch(url, { method: "POST", headers, body });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error de conexión con el servidor";
    return res.status(502).json({
      ok: false,
      message,
      error: message,
    });
  }

  const text = await wmsRes.text();
  let data: Record<string, unknown> = {};
  if (text) {
    try {
      const parsed = JSON.parse(text) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        data = parsed as Record<string, unknown>;
      } else {
        data = { message: String(parsed) };
      }
    } catch {
      data = { message: text.slice(0, 500) };
    }
  }

  return res.status(wmsRes.status).json(Object.keys(data).length ? data : { ok: wmsRes.ok });
}
