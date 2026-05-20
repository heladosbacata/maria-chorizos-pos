/**
 * Anuncios publicitarios WMS → overlay en caja (proxy /pages/api/pos_anuncios_*).
 */

export type PosAnuncioCampanaCliente = {
  id: string;
  titulo: string;
  imageUrl: string;
  cadaNVentas: number;
  textoBotonConfirmacion: string;
  requiereConfirmacionLectura?: boolean;
};

const PATH_ACTIVO = "/api/pos_anuncios_activo";
const PATH_CONFIRMAR = "/api/pos_anuncios_confirmar_lectura";

export async function wmsAnunciosCampanaActiva(): Promise<
  { ok: true; campana: PosAnuncioCampanaCliente } | { ok: false; error: string; campana?: null }
> {
  try {
    const res = await fetch(PATH_ACTIVO, { method: "GET", cache: "no-store", headers: { Accept: "application/json" } });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      activo?: boolean;
      campana?: PosAnuncioCampanaCliente | null;
      error?: string;
      razonInactivo?: string | null;
      totalCampanas?: number;
      campanasEnHorario?: number;
      _posUpstream?: string;
    };
    if (res.status === 404) {
      return {
        ok: false,
        error:
          "El WMS no tiene la ruta de anuncios (404). Desplegá maria-chorizos-wms en Vercel o usá NEXT_PUBLIC_WMS_URL=http://localhost:3002 y NEXT_PUBLIC_WMS_USE_LOCAL=1.",
        campana: null,
      };
    }
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || `Error ${res.status}`, campana: null };
    }
    if (!data.activo || !data.campana?.id || !data.campana.imageUrl?.trim()) {
      const detalle =
        data.razonInactivo?.trim() ||
        (typeof data.totalCampanas === "number"
          ? `Campañas en WMS: ${data.totalCampanas}, en horario ahora: ${data.campanasEnHorario ?? 0}.`
          : "");
      return {
        ok: false,
        error: detalle || "Sin campaña en horario.",
        campana: null,
      };
    }
    const cadaNVentas = Math.max(1, Math.round(Number(data.campana.cadaNVentas) || 1));
    return {
      ok: true,
      campana: {
        ...data.campana,
        cadaNVentas,
        textoBotonConfirmacion:
          String(data.campana.textoBotonConfirmacion ?? "").trim() || "He leído este anuncio",
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Red", campana: null };
  }
}

export async function wmsAnunciosConfirmarLectura(
  idToken: string,
  campanaId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const t = idToken?.trim();
  if (!t) return { ok: false, error: "Sin sesión." };
  try {
    const res = await fetch(PATH_CONFIRMAR, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${t}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ campanaId }),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || `Error ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Red" };
  }
}
