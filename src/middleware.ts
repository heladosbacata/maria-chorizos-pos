import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * Evita que proxies o el navegador sirvan HTML viejo de /caja (bundles con UI desactualizada).
 */
export function middleware(request: NextRequest) {
  const res = NextResponse.next();
  res.headers.set("Cache-Control", "private, no-cache, no-store, max-age=0, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  return res;
}

export const config = {
  matcher: ["/caja", "/caja/"],
};
