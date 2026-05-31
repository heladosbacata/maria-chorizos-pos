import type { NextApiRequest, NextApiResponse } from "next";
import { mensajeErrorCorreoClubMillas } from "@/lib/recuperar-clave-club-millas-documento";

type Ok = { ok: true };
type Err = { ok: false; error: string };

/** @deprecated Usar /api/pos_correo_informe_servicio (misma lógica). */
export default async function handler(req: NextApiRequest, res: NextApiResponse<Ok | Err>) {
  const secret = process.env.CLUB_MILLAS_POS_SECRET?.trim();
  const base = (process.env.POS_DEPLOY_PROXY_URL || process.env.NEXT_PUBLIC_POS_URL || "").replace(/\/$/, "");
  const target = base
    ? `${base}/api/pos_correo_informe_servicio`
    : null;

  if (!target || !secret) {
    return res.status(503).json({ ok: false, error: "Redirige a pos_correo_informe_servicio no disponible." });
  }

  try {
    const r = await fetch(target, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-club-millas-pos-secret": secret,
      },
      body: JSON.stringify(req.body ?? {}),
    });
    const data = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; message?: string };
    if (r.ok && data.ok) return res.status(200).json({ ok: true });
    return res.status(200).json({
      ok: false,
      error: mensajeErrorCorreoClubMillas(data.error || data.message || "No se envió el correo."),
    });
  } catch (e) {
    return res.status(200).json({
      ok: false,
      error: mensajeErrorCorreoClubMillas(e instanceof Error ? e.message : String(e)),
    });
  }
}
