/**
 * Configuración DIAN / emisión Alegra POS → proxies /pages/api/pos_* → WMS.
 */

const PATH_DIAN_CONFIG = "/api/pos_dian_config";
const PATH_PING = "/api/pos_alegra_ping_pos";
const PATH_EMITIR = "/api/pos_alegra_emitir_cobro";

export type DianConfigResponse = {
  ok: true;
  emisorNit: string;
  alegraCompanyId: string;
  habilitado: boolean;
};

export type DianPingOk = {
  ok: true;
  empresaAlegra: { id: string; name: string; identification: string };
  resolucion: {
    prefix: string;
    resolutionNumber: string;
    minNumber: number;
    maxNumber: number;
  };
};

export type PosCobroLineaPayload = {
  descripcion: string;
  sku?: string;
  cantidad: number;
  montoConIva: number;
};

export async function wmsPosDianConfigGet(
  idToken: string
): Promise<DianConfigResponse | { ok: false; error: string }> {
  const t = idToken?.trim();
  if (!t) return { ok: false, error: "Sin sesión." };
  try {
    const res = await fetch(PATH_DIAN_CONFIG, {
      method: "GET",
      cache: "no-store",
      headers: { Authorization: `Bearer ${t}`, Accept: "application/json" },
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || !data.ok) {
      return { ok: false, error: String(data.error ?? `Error ${res.status}`) };
    }
    return {
      ok: true,
      emisorNit: String(data.emisorNit ?? ""),
      alegraCompanyId: String(data.alegraCompanyId ?? ""),
      habilitado: Boolean(data.habilitado),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Red" };
  }
}

export async function wmsPosDianConfigPut(
  idToken: string,
  body: { emisorNit: string; alegraCompanyId?: string; habilitado: boolean }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const t = idToken?.trim();
  if (!t) return { ok: false, error: "Sin sesión." };
  try {
    const res = await fetch(PATH_DIAN_CONFIG, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${t}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error ?? `Error ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Red" };
  }
}

export async function wmsPosAlegraPingPos(
  idToken: string
): Promise<DianPingOk | { ok: false; error: string; paso?: string }> {
  const t = idToken?.trim();
  if (!t) return { ok: false, error: "Sin sesión." };
  try {
    const res = await fetch(PATH_PING, {
      method: "GET",
      cache: "no-store",
      headers: { Authorization: `Bearer ${t}`, Accept: "application/json" },
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || !data.ok) {
      return {
        ok: false,
        error: String(data.error ?? `Error ${res.status}`),
        paso: data.paso != null ? String(data.paso) : undefined,
      };
    }
    return data as unknown as DianPingOk;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Red" };
  }
}

export type EmitirCobroPayload = {
  fecha: string;
  lineas: PosCobroLineaPayload[];
  clienteNombre: string;
  clienteNit: string;
  clienteTipoIdentificacion?: string;
  observaciones?: string;
  formaPago?: string;
  ventaLocalId?: string;
};

export async function wmsPosAlegraEmitirCobro(
  idToken: string,
  body: EmitirCobroPayload
): Promise<
  | { ok: true; alegraCufe?: string; alegraDocId?: string; numeroFactura?: string; enviadoAt?: string }
  | { ok: false; error: string }
> {
  const t = idToken?.trim();
  if (!t) return { ok: false, error: "Sin sesión." };
  try {
    const res = await fetch(PATH_EMITIR, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${t}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || !data.ok) {
      return { ok: false, error: String(data.error ?? `Error ${res.status}`) };
    }
    return {
      ok: true,
      alegraCufe: data.alegraCufe != null ? String(data.alegraCufe) : undefined,
      alegraDocId: data.alegraDocId != null ? String(data.alegraDocId) : undefined,
      numeroFactura: data.numeroFactura != null ? String(data.numeroFactura) : undefined,
      enviadoAt: data.enviadoAt != null ? String(data.enviadoAt) : undefined,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Red" };
  }
}
