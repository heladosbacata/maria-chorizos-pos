import type { NextApiRequest, NextApiResponse } from "next";

const WMS_URL =
  process.env.NEXT_PUBLIC_WMS_URL || "https://maria-chorizos-wms.vercel.app";

/**
 * Alta de cajero POS en el WMS (Firebase Auth + Firestore users).
 *
 * WMS esperado: POST /api/pos/usuarios/crear
 * Body: { email: string, password: string, puntoVenta?: string }
 * Auth: Bearer ID token del administrador que crea el usuario.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  const body = req.body as { email?: string; password?: string; puntoVenta?: string } | undefined;
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const puntoVenta = typeof body?.puntoVenta === "string" ? body.puntoVenta.trim() : "";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ ok: false, message: "Correo electrónico inválido." });
  }
  if (!password || password.length < 8) {
    return res.status(400).json({ ok: false, message: "La contraseña debe tener al menos 8 caracteres." });
  }

  const base = WMS_URL.replace(/\/$/, "");
  const url = `${base}/api/pos/usuarios/crear`;
  const auth = req.headers.authorization;
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (auth) headers.Authorization = auth;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        email,
        password,
        ...(puntoVenta ? { puntoVenta } : {}),
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return res.status(response.status).json({
        ok: false,
        message: data?.message || data?.error || `Error ${response.status}`,
      });
    }
    return res.status(200).json(data);
  } catch (err) {
    const code = err instanceof Error && "code" in err ? String((err as NodeJS.ErrnoException).code) : "";
    const message =
      code === "ECONNREFUSED" || code === "ENOTFOUND"
        ? "No se pudo conectar con el WMS."
        : err instanceof Error
          ? err.message
          : "Error al conectar con el WMS";
    return res.status(502).json({ ok: false, message });
  }
}
