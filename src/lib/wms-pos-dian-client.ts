/**
 * Configuración DIAN / emisión Alegra POS → proxies /pages/api/pos_* → WMS.
 */

const PATH_DIAN_CONFIG = "/api/pos_dian_config";
const PATH_PING = "/api/pos_alegra_ping_pos";
const PATH_SYNC_RESOLUCIONES = "/api/pos_alegra_sync_resoluciones";
const PATH_EMITIR = "/api/pos_alegra_emitir_cobro";

export type DianConfigResponse = {
  ok: true;
  emisorNit: string;
  alegraCompanyId: string;
  /** Número de resolución DIAN (texto); el WMS puede usarlo para elegir la fila en DB_ResolucionesDian. */
  dianResolutionNumber: string;
  /** Razón social exacta (RUT / FAJ43b) guardada en Firestore y volcada a la hoja en sandbox. */
  razonSocialDian: string;
  /** Prefijo en hoja; vacío = SETT u omisión según WMS. */
  prefijoFactura: string;
  habilitado: boolean;
  /** Valor inicial de la caja. Default servidor/cliente: documento_interno. */
  tipoComprobantePredeterminado: "documento_interno" | "factura_electronica";
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
  /** Indica si el WMS llama a sandbox-api.alegra.com (facturas de prueba en Alanube Reseller sandbox). */
  alegraAmbiente?: "sandbox" | "produccion";
  /** Host de la API e-provider (ej. sandbox-api.alegra.com). */
  alegraApiHost?: string;
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
      dianResolutionNumber: String(data.dianResolutionNumber ?? "").trim(),
      razonSocialDian: String(data.razonSocialDian ?? "").trim(),
      prefijoFactura: String(data.prefijoFactura ?? "").trim(),
      habilitado: Boolean(data.habilitado),
      tipoComprobantePredeterminado:
        data.tipoComprobantePredeterminado === "factura_electronica"
          ? "factura_electronica"
          : "documento_interno",
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Red" };
  }
}

export async function wmsPosDianConfigPut(
  idToken: string,
  body: {
    emisorNit: string;
    alegraCompanyId?: string;
    dianResolutionNumber?: string;
    razonSocialDian?: string;
    prefijoFactura?: string;
    tipoComprobantePredeterminado?: "documento_interno" | "factura_electronica";
    habilitado: boolean;
  }
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

export type DianSyncResolucionesResult =
  | {
      ok: true;
      synced: number;
      message: string;
      /** Pestaña del libro Google donde escribe el WMS (no es la primera hoja del archivo por defecto). */
      pestanaGoogleSheet?: string;
      sandboxMetaResolucion?: string;
      /** Detalle de la fila matriz SETT (NIT vacío) creada en sandbox. */
      sandboxMatrizResolucion?: string;
      resolucionLista?: boolean;
      resolucion?: DianPingOk["resolucion"];
      resolutionError?: string;
    }
  | { ok: false; error: string; synced?: number };

/** POST: sincroniza resolución / fila meta en Google Sheets (DB_ResolucionesDian) vía WMS. */
export async function wmsPosAlegraSyncResoluciones(
  idToken: string,
  body?: { nitEmisor?: string; alegraCompanyId?: string }
): Promise<DianSyncResolucionesResult> {
  const t = idToken?.trim();
  if (!t) return { ok: false, error: "Sin sesión." };
  try {
    const res = await fetch(PATH_SYNC_RESOLUCIONES, {
      method: "POST",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${t}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body ?? {}),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (data.ok === true) {
      const resol =
        data.resolucion && typeof data.resolucion === "object" && !Array.isArray(data.resolucion)
          ? (data.resolucion as Record<string, unknown>)
          : null;
      return {
        ok: true,
        synced: Number(data.synced ?? 0) || 0,
        message: String(data.message ?? "").trim() || "Sincronización completada.",
        ...(typeof data.pestanaGoogleSheet === "string" && data.pestanaGoogleSheet.trim()
          ? { pestanaGoogleSheet: data.pestanaGoogleSheet.trim() }
          : {}),
        ...(typeof data.sandboxMetaResolucion === "string" && data.sandboxMetaResolucion.trim()
          ? { sandboxMetaResolucion: data.sandboxMetaResolucion.trim() }
          : {}),
        ...(typeof data.sandboxMatrizResolucion === "string" && data.sandboxMatrizResolucion.trim()
          ? { sandboxMatrizResolucion: data.sandboxMatrizResolucion.trim() }
          : {}),
        ...(typeof data.resolucionLista === "boolean" ? { resolucionLista: data.resolucionLista } : {}),
        ...(resol
          ? {
              resolucion: {
                prefix: String(resol.prefix ?? ""),
                resolutionNumber: String(resol.resolutionNumber ?? ""),
                minNumber: Number(resol.minNumber ?? 0) || 0,
                maxNumber: Number(resol.maxNumber ?? 0) || 0,
              },
            }
          : {}),
        ...(typeof data.resolutionError === "string" && data.resolutionError.trim()
          ? { resolutionError: data.resolutionError.trim() }
          : {}),
      };
    }
    return {
      ok: false,
      error: String(data.error ?? `Error ${res.status}`),
      ...(typeof data.synced === "number" ? { synced: data.synced } : {}),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Red" };
  }
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
      const ambRaw = data.alegraAmbiente;
      const alegraAmbiente =
        ambRaw === "sandbox" || ambRaw === "produccion" ? (ambRaw as "sandbox" | "produccion") : undefined;
      const alegraApiHost = String(data.alegraApiHost ?? "").trim() || undefined;
      return {
        ok: true,
        empresaAlegra: emp,
        resolucion: {
          prefix: String(resol.prefix ?? ""),
          resolutionNumber: String(resol.resolutionNumber ?? ""),
          minNumber: Number(resol.minNumber ?? 0) || 0,
          maxNumber: Number(resol.maxNumber ?? 0) || 0,
        },
        ...(alegraAmbiente && alegraApiHost ? { alegraAmbiente, alegraApiHost } : {}),
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

/** Igual que emitir-cobro con `soloPayload: true` en el WMS: no reserva consecutivo ni llama a Alegra. */
export async function wmsPosAlegraEmitirCobroSoloPayload(
  idToken: string,
  body: EmitirCobroPayload
): Promise<
  | { ok: true; payload: unknown; numeroFacturaSimulado?: string }
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
      body: JSON.stringify({ ...body, soloPayload: true }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || !data.ok) {
      return { ok: false, error: String(data.error ?? `Error ${res.status}`) };
    }
    return {
      ok: true,
      payload: data.payload,
      numeroFacturaSimulado:
        data.numeroFacturaSimulado != null ? String(data.numeroFacturaSimulado) : undefined,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Red" };
  }
}

function descargarBlobArchivo(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const sleepMs = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Tres archivos como en GEB/WMS: JSON del payload a Alegra, JSON de contexto (ping POS),
 * y texto con instrucciones (no se vuelve a emitir factura real).
 */
export async function descargarPaqueteDebugEmitirFePos(
  idToken: string,
  payload: EmitirCobroPayload,
  meta: { slug: string; ventaLocalId?: string }
): Promise<void> {
  const slug = (meta.slug || "venta").replace(/[^\w.-]+/g, "_").slice(0, 96);
  const solo = await wmsPosAlegraEmitirCobroSoloPayload(idToken, payload);
  if (!solo.ok) throw new Error(solo.error);
  descargarBlobArchivo(
    `request_payload-${slug}.json`,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        ventaLocalId: meta.ventaLocalId,
        numeroFacturaSimulado: solo.numeroFacturaSimulado,
        payload: solo.payload,
      },
      null,
      2
    ),
    "application/json;charset=utf-8"
  );
  await sleepMs(200);

  const pingRes = await fetch(PATH_PING, {
    method: "GET",
    headers: { Authorization: `Bearer ${idToken.trim()}`, Accept: "application/json" },
    cache: "no-store",
  });
  const pingBody = await pingRes.json().catch(() => ({}));
  descargarBlobArchivo(
    `response_contexto_pos-${slug}.json`,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        nota:
          "No es la respuesta de Alegra al emitir; evita duplicar facturas. Incluye ping POS (empresa, resolución, ambiente).",
        ventaLocalId: meta.ventaLocalId,
        endpoint: PATH_PING,
        httpStatus: pingRes.status,
        body: pingBody,
      },
      null,
      2
    ),
    "application/json;charset=utf-8"
  );
  await sleepMs(200);

  const contexto = [
    "Depuración POS → WMS → Alegra (emitir-cobro)",
    `Generado: ${new Date().toISOString()}`,
    meta.ventaLocalId ? `ventaLocalId: ${meta.ventaLocalId}` : "",
    "",
    "Archivos:",
    "- request_payload-*.json: cuerpo que el WMS armaría para Alanube/Alegra (soloPayload; no consume consecutivo ni POST /invoices).",
    "- response_contexto_pos-*.json: GET pos_alegra_ping_pos (conexión, resolución, ambiente).",
    "",
    "La columna «Correo» (Sin enviar) es solo el comprobante por email al cliente, no el estado DIAN ni Alegra.",
    "Si request_payload falla, leé el campo error en la respuesta del WMS en red (F12 → Network → emitir-cobro).",
    "",
  ]
    .filter(Boolean)
    .join("\n");
  descargarBlobArchivo(`contexto_prueba-${slug}.txt`, contexto, "text/plain;charset=utf-8");
}
