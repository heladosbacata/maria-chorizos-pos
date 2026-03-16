import type { NextApiRequest, NextApiResponse } from "next";

const WMS_URL =
  process.env.NEXT_PUBLIC_WMS_URL || "https://maria-chorizos-wms.vercel.app";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  const base = WMS_URL.replace(/\/$/, "");
  const url = `${base}/api/pos/productos/listar`;
  const headers: HeadersInit = {};
  const auth = req.headers.authorization;
  if (auth) headers.Authorization = auth;

  try {
    const response = await fetch(url, { headers });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return res
        .status(response.status)
        .json({
          ok: false,
          message: data?.message || data?.error || `Error ${response.status}`,
        });
    }

    return res.status(200).json(data);
  } catch (err) {
    const code = err instanceof Error && "code" in err ? String((err as NodeJS.ErrnoException).code) : "";
    const message =
      code === "ECONNREFUSED" || code === "ENOTFOUND"
        ? "No se pudo conectar con el WMS. Compruebe que esté en ejecución (ej. http://localhost:3002 si usa .env.local)."
        : err instanceof Error
          ? err.message
          : "Error al conectar con el WMS";
    // Devolver 200 con ok: false para que la app no muestre 502 en consola y el usuario vea el mensaje y pueda reintentar
    return res.status(200).json({ ok: false, message, productos: [] });
  }
}
