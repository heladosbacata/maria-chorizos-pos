const RELOAD_KEY = "pos_build_reload_intent";

export function buildIdClientePos(): string {
  return process.env.NEXT_PUBLIC_POS_BUILD_ID?.trim() || "unknown";
}

/**
 * Tras cobrar: si Vercel ya tiene un build más nuevo, recarga /caja para cargar el JS actualizado.
 * Evita bucles con sessionStorage si el reload no aplicó el bundle nuevo.
 */
export async function verificarActualizacionPosTrasVenta(): Promise<void> {
  if (typeof window === "undefined") return;
  const clientId = buildIdClientePos();
  if (!clientId || clientId === "unknown") return;

  try {
    const res = await fetch("/api/pos_app_version", { method: "GET", cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json().catch(() => null)) as { buildId?: string } | null;
    const serverId = typeof data?.buildId === "string" ? data.buildId.trim() : "";
    if (!serverId || serverId === clientId) {
      sessionStorage.removeItem(RELOAD_KEY);
      return;
    }

    const prevIntent = sessionStorage.getItem(RELOAD_KEY);
    if (prevIntent === serverId) return;

    sessionStorage.setItem(RELOAD_KEY, serverId);
    window.location.reload();
  } catch {
    // Sin red o API caída: no interrumpir la caja.
  }
}
