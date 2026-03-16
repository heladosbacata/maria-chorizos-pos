import { NextRequest, NextResponse } from "next/server";

const WMS_URL = process.env.NEXT_PUBLIC_WMS_URL;

/**
 * Proxy GET /api/catalogo → WMS GET /api/pos/productos/listar.
 * Evita CORS: el navegador llama a este endpoint (mismo origen) y el servidor
 * llama al WMS (sin restricción CORS).
 */
export async function GET(request: NextRequest) {
  if (!WMS_URL) {
    return NextResponse.json(
      { ok: false, message: "NEXT_PUBLIC_WMS_URL no está configurada" },
      { status: 500 }
    );
  }

  const url = `${WMS_URL.replace(/\/$/, "")}/api/pos/productos/listar`;
  const headers: HeadersInit = {};
  const auth = request.headers.get("authorization");
  if (auth) {
    headers.Authorization = auth;
  }

  try {
    const res = await fetch(url, { headers });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return NextResponse.json(
        { ok: false, message: data?.message || data?.error || `Error ${res.status}` },
        { status: res.status }
      );
    }

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al conectar con el WMS";
    return NextResponse.json({ ok: false, message }, { status: 502 });
  }
}
