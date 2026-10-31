import { EVENTO_CUPO_PROMO_HALLOWEEN } from "@/lib/promo-halloween-pos";

export type CupoPromoHalloweenRespuesta = {
  ok: boolean;
  disponibles: number;
  cupoMax?: number;
  vendidos?: number;
  activa?: boolean;
  already?: boolean;
  message?: string;
};

function publicarDisponibles(disponibles: number) {
  if (typeof window === "undefined" || !Number.isFinite(disponibles)) return;
  window.dispatchEvent(
    new CustomEvent(EVENTO_CUPO_PROMO_HALLOWEEN, { detail: { disponibles } })
  );
}

async function llamarCupo(
  token: string,
  init: RequestInit
): Promise<CupoPromoHalloweenRespuesta> {
  const res = await fetch("/api/pos_promo_halloween_cupo", {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  const data = (await res.json().catch(() => null)) as CupoPromoHalloweenRespuesta | null;
  if (!data || typeof data.disponibles !== "number") {
    return {
      ok: false,
      disponibles: 0,
      message: "No se pudo consultar el disponible de la promo Halloween.",
    };
  }
  if (data.ok) publicarDisponibles(data.disponibles);
  return data;
}

export function leerCupoPromoHalloween(token: string): Promise<CupoPromoHalloweenRespuesta> {
  return llamarCupo(token, { method: "GET", cache: "no-store" });
}

export function consumirCupoPromoHalloween(
  token: string,
  body: { ventaId: string; cantidad: number }
): Promise<CupoPromoHalloweenRespuesta> {
  return llamarCupo(token, { method: "POST", body: JSON.stringify({ accion: "consumir", ...body }) });
}

export function devolverCupoPromoHalloween(
  token: string,
  body: { ventaId: string; cantidad: number }
): Promise<CupoPromoHalloweenRespuesta> {
  return llamarCupo(token, { method: "POST", body: JSON.stringify({ accion: "devolver", ...body }) });
}
