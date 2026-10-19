import type {
  PlanBonosEmojiFelicitar,
  PlanBonosLogroPublicado,
  PlanBonosMetaId,
} from "@/lib/plan-bonos-artesanos";

const PATH = "/api/pos_plan_bonos_artesanos";

export async function publicarLogroPlanBonos(
  idToken: string,
  input: {
    metaId: PlanBonosMetaId;
    ventaAlcanzada: number;
    puntoVenta?: string;
    artesanoNombre?: string;
  }
): Promise<{ ok: true; logro: PlanBonosLogroPublicado; creado: boolean } | { ok: false; error: string }> {
  const t = idToken?.trim();
  if (!t) return { ok: false, error: "Sin sesión." };
  try {
    const res = await fetch(PATH, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${t}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ action: "publicar", ...input }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      logro?: PlanBonosLogroPublicado;
      creado?: boolean;
      message?: string;
    };
    if (!res.ok || !data.ok || !data.logro) {
      return { ok: false, error: data.message || `Error ${res.status}` };
    }
    return { ok: true, logro: data.logro, creado: Boolean(data.creado) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Red" };
  }
}

export async function felicitarLogroPlanBonos(
  idToken: string,
  input: { logroId: string; emoji: PlanBonosEmojiFelicitar }
): Promise<{ ok: true; logro: PlanBonosLogroPublicado } | { ok: false; error: string }> {
  const t = idToken?.trim();
  if (!t) return { ok: false, error: "Sin sesión." };
  try {
    const res = await fetch(PATH, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${t}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ action: "felicitar", ...input }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      logro?: PlanBonosLogroPublicado;
      message?: string;
    };
    if (!res.ok || !data.ok || !data.logro) {
      return { ok: false, error: data.message || `Error ${res.status}` };
    }
    return { ok: true, logro: data.logro };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Red" };
  }
}

export async function listarLogrosPlanBonosHoy(
  idToken: string
): Promise<{ ok: true; logros: PlanBonosLogroPublicado[]; ymd: string } | { ok: false; error: string }> {
  const t = idToken?.trim();
  if (!t) return { ok: false, error: "Sin sesión." };
  try {
    const res = await fetch(PATH, {
      method: "GET",
      cache: "no-store",
      headers: { Authorization: `Bearer ${t}`, Accept: "application/json" },
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      logros?: PlanBonosLogroPublicado[];
      ymd?: string;
      message?: string;
    };
    if (!res.ok || !data.ok || !Array.isArray(data.logros)) {
      return { ok: false, error: data.message || `Error ${res.status}` };
    }
    return { ok: true, logros: data.logros, ymd: data.ymd || "" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Red" };
  }
}
