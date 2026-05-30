import { CLUB_MILLAS_PORTAL_URL } from "@/lib/wms-club-millas-premios";

/** URL para que el cliente vea su plan de millas (QR en tirilla, no acumulación). */
export function construirUrlConsultaClubMillas(documento?: string): string {
  const env =
    process.env.NEXT_PUBLIC_CLUB_MILLAS_MI_PLAN_URL?.trim() ||
    process.env.CLUB_MILLAS_MI_PLAN_URL?.trim();
  const base = (env && /^https?:\/\//i.test(env) ? env : `${CLUB_MILLAS_PORTAL_URL}/mi-plan`).replace(
    /\/$/,
    ""
  );
  const u = new URL(base);
  const doc = String(documento ?? "").replace(/\D/g, "").trim();
  if (doc.length >= 5) u.searchParams.set("documento", doc);
  return u.toString();
}

export const MENSAJE_TIRILLA_CLUB_SALDO_TITULO = "CLUB DE MILLAS — TU SALDO";
export const MENSAJE_TIRILLA_CLUB_SALDO_ANTES_LABEL = "Millas ahora";
export const MENSAJE_TIRILLA_CLUB_SALDO_DESPUES_LABEL = "Quedas con";
export const MENSAJE_TIRILLA_CLUB_SALDO_LABEL = "Millas acumuladas";
export const MENSAJE_TIRILLA_CLUB_GANADAS_LABEL = "Millas de esta compra";
export const MENSAJE_TIRILLA_CLUB_CONSULTA_PASO = "Escaneá el QR para ver tu plan y premios";
export const MENSAJE_TIRILLA_CLUB_ACUMULADO_AUTO = "Millas sumadas automáticamente con tu cédula";
