export type MensajeCumpleMuro = {
  id: string;
  texto: string;
  autorUid: string;
  autorNombre: string;
  autorPuntoVenta: string;
  createdAtIso: string;
};

export type MuroCumpleRespuesta = {
  ok: boolean;
  mensajes?: MensajeCumpleMuro[];
  message?: string;
  ventanaActiva?: boolean;
};

export async function fetchMuroCumpleCajero(
  cajeroId: string,
  token: string,
  fecha?: string
): Promise<MuroCumpleRespuesta> {
  const q = new URLSearchParams({ cajeroId: cajeroId.trim() });
  if (fecha?.trim()) q.set("fecha", fecha.trim());
  const res = await fetch(`/api/pos_cajeros_cumple_muro?${q.toString()}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
  });
  return (await res.json().catch(() => ({ ok: false, message: "Respuesta inválida" }))) as MuroCumpleRespuesta;
}

export async function enviarMensajeCumpleCajero(
  payload: {
    cajeroId: string;
    cajeroNombre: string;
    texto: string;
    autorNombre: string;
    autorPuntoVenta: string;
  },
  token: string
): Promise<MuroCumpleRespuesta> {
  const res = await fetch("/api/pos_cajeros_cumple_muro", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify(payload),
  });
  return (await res.json().catch(() => ({ ok: false, message: "Respuesta inválida" }))) as MuroCumpleRespuesta;
}
