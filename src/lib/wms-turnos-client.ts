/**
 * Turnos de caja en el WMS (monitor administrativo + INFORME_VENTAS_MC al cerrar).
 * Base: `getWmsPublicBaseUrl()` → NEXT_PUBLIC_WMS_URL o NEXT_PUBLIC_WMS_API_URL.
 */
import { nombreDisplayCajeroTurno, type CajeroTurnoDoc } from "@/lib/cajeros-turno-firestore";
import { getWmsPublicBaseUrl } from "@/lib/wms-public-base";

const UEN_DEFAULT = "Maria Chorizos";

function baseRoot(): string {
  return getWmsPublicBaseUrl().replace(/\/$/, "");
}

const BACKOFF_MS = [250, 700, 1600];

export type WmsTurnoCajeroPayload = {
  cajeroTurnoId: string;
  cajeroNombre: string;
  cajeroDocumento?: string;
  cajeroTipoDocumento?: string;
  turnoSesionId?: string;
};

/** Datos del cajero que validó documento en el catálogo del punto. */
export function wmsCajeroDesdeCatalogo(cajero: CajeroTurnoDoc, turnoSesionId?: string | null): WmsTurnoCajeroPayload {
  const out: WmsTurnoCajeroPayload = {
    cajeroTurnoId: cajero.id.trim(),
    cajeroNombre: nombreDisplayCajeroTurno(cajero.ficha),
  };
  const doc = cajero.ficha.numeroDocumento?.trim();
  if (doc) out.cajeroDocumento = doc;
  const tipo = cajero.ficha.tipoDocumento?.trim();
  if (tipo) out.cajeroTipoDocumento = tipo;
  const sid = turnoSesionId?.trim();
  if (sid) out.turnoSesionId = sid;
  return out;
}

export function wmsTurnoCajeroPayload(
  cajero: { id: string; nombreDisplay: string; documento?: string; tipoDocumento?: string },
  turnoSesionId?: string | null
): WmsTurnoCajeroPayload {
  const out: WmsTurnoCajeroPayload = {
    cajeroTurnoId: cajero.id.trim(),
    cajeroNombre: cajero.nombreDisplay.trim(),
  };
  const doc = cajero.documento?.trim();
  if (doc) out.cajeroDocumento = doc;
  const tipo = cajero.tipoDocumento?.trim();
  if (tipo) out.cajeroTipoDocumento = tipo;
  const sid = turnoSesionId?.trim();
  if (sid) out.turnoSesionId = sid;
  return out;
}

function appendCajeroToBody(body: Record<string, string>, cajero: Partial<WmsTurnoCajeroPayload>): void {
  if (cajero.cajeroTurnoId?.trim()) body.cajeroTurnoId = cajero.cajeroTurnoId.trim();
  if (cajero.cajeroNombre?.trim()) body.cajeroNombre = cajero.cajeroNombre.trim();
  if (cajero.cajeroDocumento?.trim()) body.cajeroDocumento = cajero.cajeroDocumento.trim();
  if (cajero.cajeroTipoDocumento?.trim()) body.cajeroTipoDocumento = cajero.cajeroTipoDocumento.trim();
  if (cajero.turnoSesionId?.trim()) body.turnoSesionId = cajero.turnoSesionId.trim();
}

/**
 * POST /api/pos/cajeros/identificar — registra quién validó su documento (monitor de ventas).
 */
export async function wmsCajeroIdentificar(
  idToken: string,
  cajero: WmsTurnoCajeroPayload
): Promise<{ ok: true } | { ok: false; error: string }> {
  const t = idToken?.trim();
  if (!t) return { ok: false, error: "Sin sesión (token vacío)." };
  if (!cajero.cajeroDocumento?.trim()) {
    return { ok: false, error: "Falta documento del cajero identificado." };
  }
  const body: Record<string, string> = {};
  appendCajeroToBody(body, cajero);
  try {
    const res = await fetch(`${baseRoot()}/api/pos/cajeros/identificar`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${t}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || data.ok !== true) {
      return {
        ok: false,
        error:
          typeof data.error === "string" && data.error.trim()
            ? data.error.trim()
            : `Error del servidor (${res.status})`,
      };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error de red al registrar identificación." };
  }
}

export type WmsTurnosAbrirResult =
  | { ok: true; yaAbierto?: boolean; turnoId?: string; message?: string }
  | { ok: false; error: string };

/**
 * POST /api/pos/turnos/abrir — `uen` es unidad de negocio (ej. Maria Chorizos), no el punto de venta.
 */
export async function wmsTurnosAbrir(
  idToken: string,
  opts: { uen?: string } & Partial<WmsTurnoCajeroPayload>
): Promise<WmsTurnosAbrirResult> {
  const t = idToken?.trim();
  if (!t) return { ok: false, error: "Sin sesión (token vacío)." };
  const uen = (opts.uen ?? UEN_DEFAULT).trim() || UEN_DEFAULT;
  const body: Record<string, string> = { uen };
  appendCajeroToBody(body, opts);
  try {
    const res = await fetch(`${baseRoot()}/api/pos/turnos/abrir`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${t}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      yaAbierto?: boolean;
      turnoId?: string;
      message?: string;
      error?: string;
    };
    if (!res.ok || data.ok !== true) {
      const err =
        typeof data.error === "string" && data.error.trim()
          ? data.error.trim()
          : typeof data.message === "string" && data.message.trim()
            ? data.message.trim()
            : `Error del servidor (${res.status})`;
      return { ok: false, error: err };
    }
    return {
      ok: true,
      yaAbierto: data.yaAbierto === true,
      turnoId: typeof data.turnoId === "string" ? data.turnoId : undefined,
      message: typeof data.message === "string" ? data.message : undefined,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error de red al abrir turno en el WMS." };
  }
}

/**
 * POST /api/pos/turnos/sincronizar — reintentos con backoff; fallos finales solo consola (no bloquea cobro).
 */
export async function wmsTurnosSincronizarSilent(
  idToken: string,
  totalVenta: number,
  cajero?: WmsTurnoCajeroPayload | null
): Promise<void> {
  const t = idToken?.trim();
  if (!t) {
    console.warn("[wms-turnos] sincronizar: sin token");
    return;
  }
  const body: Record<string, string | number> = {
    totalVenta: Math.round(Math.max(0, Number(totalVenta) || 0) * 100) / 100,
  };
  if (cajero) appendCajeroToBody(body as Record<string, string>, cajero);
  const url = `${baseRoot()}/api/pos/turnos/sincronizar`;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${t}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && data.ok === true) return;
      if (attempt < 2) {
        console.warn("[wms-turnos] sincronizar intento", attempt + 1, res.status, data.error ?? "");
      }
    } catch (e) {
      console.warn("[wms-turnos] sincronizar intento", attempt + 1, e);
    }
    if (attempt < BACKOFF_MS.length) {
      await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt]!));
    }
  }
  console.warn("[wms-turnos] sincronizar: agotados reintentos (totalVenta en cuerpo fue)", totalVenta);
}

export type WmsTurnosCerrarResult =
  | { ok: true; message?: string; totalVenta?: number }
  | { ok: false; error: string };

/**
 * POST /api/pos/turnos/cerrar — `uen` es unidad de negocio (ej. Maria Chorizos).
 */
export async function wmsTurnosCerrar(
  idToken: string,
  opts?: { uen?: string; plataformaMovil?: string }
): Promise<WmsTurnosCerrarResult> {
  const t = idToken?.trim();
  if (!t) return { ok: false, error: "Sin sesión (token vacío)." };
  const uen = (opts?.uen ?? UEN_DEFAULT).trim() || UEN_DEFAULT;
  const plataformaMovil = (opts?.plataformaMovil ?? "POS GEB").trim() || "POS GEB";
  try {
    const res = await fetch(`${baseRoot()}/api/pos/turnos/cerrar`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${t}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ uen, plataformaMovil }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      message?: string;
      totalVenta?: number;
    };
    if (!res.ok || data.ok !== true) {
      const err =
        typeof data.error === "string" && data.error.trim()
          ? data.error.trim()
          : typeof data.message === "string" && data.message.trim()
            ? data.message.trim()
            : `Error del servidor (${res.status})`;
      return { ok: false, error: err };
    }
    return {
      ok: true,
      message: typeof data.message === "string" ? data.message : undefined,
      totalVenta: typeof data.totalVenta === "number" ? data.totalVenta : undefined,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error de red al cerrar turno en el WMS." };
  }
}
