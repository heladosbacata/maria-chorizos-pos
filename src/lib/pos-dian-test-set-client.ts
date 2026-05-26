import type { DianHabilitacionDatosPaso1 } from "@/lib/dian-habilitacion-campos";

const PATH = "/api/pos_dian_test_set";

export type PosDianHabilitacionGuardada = {
  dianTestSetId: string;
  dianResolutionNumber: string;
  prefijoFactura: string;
  consecutivoDesde: string;
  consecutivoHasta: string;
};

export type PosDianTestSetGetOk = {
  ok: true;
  puntoVenta: string;
  updatedAt: string | null;
  enviadoABacataAt: string | null;
} & PosDianHabilitacionGuardada;

export async function posDianTestSetGet(
  idToken: string
): Promise<PosDianTestSetGetOk | { ok: false; error: string }> {
  const t = idToken?.trim();
  if (!t) return { ok: false, error: "Sin sesión." };
  try {
    const res = await fetch(PATH, {
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
      dianTestSetId: String(data.dianTestSetId ?? "").trim(),
      dianResolutionNumber: String(data.dianResolutionNumber ?? "").trim(),
      prefijoFactura: String(data.prefijoFactura ?? "").trim(),
      consecutivoDesde: String(data.consecutivoDesde ?? "").trim(),
      consecutivoHasta: String(data.consecutivoHasta ?? "").trim(),
      puntoVenta: String(data.puntoVenta ?? ""),
      updatedAt: data.updatedAt != null ? String(data.updatedAt) : null,
      enviadoABacataAt: data.enviadoABacataAt != null ? String(data.enviadoABacataAt) : null,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Red" };
  }
}

export type PosDianTestSetEnviarOk = {
  ok: true;
  dianTestSetId: string;
  puntoVenta: string;
  notificacionAdmin: boolean;
  notificacionPos: boolean;
  canalAdmin?: string;
};

/** Guarda borrador en Firestore sin notificar a administración (solo TestSetId u otros campos parciales). */
export async function posDianTestSetGuardarBorrador(
  idToken: string,
  datos: Partial<DianHabilitacionDatosPaso1>
): Promise<{ ok: true } | { ok: false; error: string }> {
  const t = idToken?.trim();
  if (!t) return { ok: false, error: "Sin sesión." };
  try {
    const res = await fetch(PATH, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${t}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ ...datos, enviarABacata: false }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || !data.ok) {
      return { ok: false, error: String(data.error ?? `Error ${res.status}`) };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Red" };
  }
}

/** Guarda datos DIAN del paso 1, notifica al WMS y registra aviso en bandeja del POS. */
export async function posDianTestSetEnviarABacata(
  idToken: string,
  datos: DianHabilitacionDatosPaso1
): Promise<PosDianTestSetEnviarOk | { ok: false; error: string }> {
  const t = idToken?.trim();
  if (!t) return { ok: false, error: "Sin sesión." };
  try {
    const res = await fetch(PATH, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${t}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        ...datos,
        confirmar: true,
        enviarABacata: true,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || !data.ok) {
      return { ok: false, error: String(data.error ?? `Error ${res.status}`) };
    }
    return {
      ok: true,
      dianTestSetId: String(data.dianTestSetId ?? datos.dianTestSetId).trim(),
      puntoVenta: String(data.puntoVenta ?? ""),
      notificacionAdmin: Boolean(data.notificacionAdmin),
      notificacionPos: Boolean(data.notificacionPos),
      canalAdmin: data.canalAdmin != null ? String(data.canalAdmin) : undefined,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Red" };
  }
}
