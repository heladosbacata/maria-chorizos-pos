export type PremioClubMillas = {
  id: string;
  titulo: string;
  descripcion: string;
  imagenUrl?: string;
  puntosNecesarios: number;
};

/** Landing login/registro del club (antes de validar millas del QR de tirilla). */
export const CLUB_MILLAS_PORTAL_URL = "https://maria-chorizos-wms.vercel.app/club-de-millas";

export async function listarPremiosClubMillasWms(): Promise<
  { ok: true; premios: PremioClubMillas[] } | { ok: false; message: string }
> {
  try {
    const res = await fetch("/api/pos_club_millas_premios", { cache: "no-store" });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      premios?: PremioClubMillas[];
      message?: string;
    };
    if (!res.ok || !data.ok) {
      return { ok: false, message: data.message?.trim() || `Error ${res.status} al cargar premios.` };
    }
    return { ok: true, premios: Array.isArray(data.premios) ? data.premios : [] };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "No se pudo conectar con el catálogo de premios.",
    };
  }
}
