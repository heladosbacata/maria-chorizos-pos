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
  /** Notas del WMS (sandbox DIAN, FAJ43b, etc.). */
  notasDian?: string[];
};

export type DianPingErr = {
  ok: false;
  error: string;
  paso?: string;
  /** Si Alegra respondió pero falló resolución en Sheets, el WMS puede devolver la empresa igual. */
  empresaAlegra?: { id: string; name: string; identification?: string };
};

export type DianPingResult = DianPingOk | DianPingErr;

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

function parseEmpresaAlegra(raw: unknown): DianPingOk["empresaAlegra"] | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const id = String(o.id ?? "").trim();
  const name = String(o.name ?? "").trim();
  if (!id || !name) return undefined;
  return {
    id,
    name,
    identification: String(o.identification ?? "").trim(),
  };
}

export async function wmsPosAlegraPingPos(idToken: string): Promise<DianPingResult> {
  const t = idToken?.trim();
  if (!t) return { ok: false, error: "Sin sesión." };
  try {
    const res = await fetch(PATH_PING, {
      method: "GET",
      cache: "no-store",
      headers: { Authorization: `Bearer ${t}`, Accept: "application/json" },
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (data.ok === true) {
      const emp = parseEmpresaAlegra(data.empresaAlegra);
      const resol = data.resolucion && typeof data.resolucion === "object" && !Array.isArray(data.resolucion) ? (data.resolucion as Record<string, unknown>) : null;
      if (!emp || !resol) {
        return { ok: false, error: "Respuesta incompleta del WMS al verificar Alegra." };
      }
      const notasDian = Array.isArray(data.notasDian) ? data.notasDian.map((x) => String(x)).filter(Boolean) : undefined;
      return {
        ok: true,
        empresaAlegra: emp,
        resolucion: {
          prefix: String(resol.prefix ?? ""),
          resolutionNumber: String(resol.resolutionNumber ?? ""),
          minNumber: Number(resol.minNumber ?? 0) || 0,
          maxNumber: Number(resol.maxNumber ?? 0) || 0,
        },
        ...(notasDian?.length ? { notasDian } : {}),
      };
    }
    return {
      ok: false,
      error: String(data.error ?? `Error ${res.status}`),
      paso: data.paso != null ? String(data.paso) : undefined,
      empresaAlegra: parseEmpresaAlegra(data.empresaAlegra),
    };
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
