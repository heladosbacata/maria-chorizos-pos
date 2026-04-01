/**
 * Turnos de caja en el WMS (monitor administrativo + INFORME_VENTAS_MC).
 * Base: NEXT_PUBLIC_WMS_URL o NEXT_PUBLIC_WMS_API_URL (ver `getWmsPublicBaseUrl`).
 */
import { getWmsPublicBaseUrl } from "@/lib/wms-public-base";

const PATH_ABRIR = "/api/pos/turnos/abrir";
const PATH_SINCRONIZAR = "/api/pos/turnos/sincronizar";
const PATH_CERRAR = "/api/pos/turnos/cerrar";

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function postJson(
  path: string,
  idToken: string,
  body: Record<string, unknown> | undefined
): Promise<{ res: Response; data: unknown }> {
  const base = getWmsPublicBaseUrl();
  const url = `${base}${path}`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(body ?? {}),
  });
  let data: unknown = null;
  try {
    data = await r.json();
  } catch {
    data = null;
  }
  return { res: r, data };
}

export type WmsTurnosAbrirResult = {
  ok: boolean;
  yaAbierto?: boolean;
  message?: string;
  networkError?: boolean;
};

export async function wmsTurnosAbrir(
  idToken: string,
  opts?: { uen?: string }
): Promise<WmsTurnosAbrirResult> {
  try {
    const body: Record<string, string> = {};
    if (opts?.uen?.trim()) body.uen = opts.uen.trim();
    const { res, data } = await postJson(PATH_ABRIR, idToken, Object.keys(body).length ? body : undefined);
    const d = data as { ok?: boolean; yaAbierto?: boolean; message?: string };
    if (res.ok && d?.ok) return { ok: true, yaAbierto: Boolean(d.yaAbierto) };
    return {
      ok: false,
      message: typeof d?.message === "string" && d.message.trim() ? d.message.trim() : `Error ${res.status}`,
    };
  } catch {
    return { ok: false, message: "Sin conexión con el servidor.", networkError: true };
  }
}

/**
 * Reintentos silenciosos; no bloquea cobro. Ignora fallos finales (solo consola).
 */
export async function wmsTurnosSincronizarSilent(idToken: string, totalVenta: number): Promise<void> {
  const n = Number(totalVenta);
  const payload = { totalVenta: Number.isFinite(n) ? n : 0 };
  const attempts = 3;
  for (let i = 0; i < attempts; i++) {
    try {
      const { res, data } = await postJson(PATH_SINCRONIZAR, idToken, payload);
      const d = data as { ok?: boolean };
      if (res.ok && d?.ok) return;
    } catch {
      /* reintentar */
    }
    await delay(350 * (i + 1));
  }
  console.warn("[WMS turnos] sincronizar falló tras reintentos, totalVenta=", payload.totalVenta);
}

export type WmsTurnosCerrarResult = { ok: boolean; message?: string };

export async function wmsTurnosCerrar(
  idToken: string,
  opts?: { uen?: string; plataformaMovil?: string }
): Promise<WmsTurnosCerrarResult> {
  try {
    const body: Record<string, string> = {};
    if (opts?.uen?.trim()) body.uen = opts.uen.trim();
    if (opts?.plataformaMovil?.trim()) body.plataformaMovil = opts.plataformaMovil.trim();
    const { res, data } = await postJson(PATH_CERRAR, idToken, Object.keys(body).length ? body : undefined);
    const d = data as { ok?: boolean; message?: string };
    if (res.ok && d?.ok) return { ok: true };
    const msg =
      typeof d?.message === "string" && d.message.trim()
        ? d.message.trim()
        : `No se pudo cerrar el turno en el servidor (${res.status}).`;
    return { ok: false, message: msg };
  } catch {
    return {
      ok: false,
      message: "Sin conexión. El turno puede seguir abierto en el servidor hasta que se confirme el cierre.",
    };
  }
}
