import type {
  ChatDomicilioEnviarPayload,
  ChatDomicilioEnviarResponse,
  ChatDomicilioListadoResponse,
  MensajeChatDomicilio,
} from "@/types/pos-domicilios-chat";

async function parseJsonSafe(res: Response): Promise<unknown> {
  return res.json().catch(() => ({}));
}

export async function listarMensajesChatDomicilio(
  puntoVenta: string,
  pedidoId: string
): Promise<ChatDomicilioListadoResponse> {
  const pv = puntoVenta.trim();
  const pid = pedidoId.trim();
  if (!pv || !pid) return { ok: false, data: [], message: "puntoVenta y pedidoId son obligatorios." };
  try {
    const url = `/api/pos_domicilios_chat?${new URLSearchParams({ puntoVenta: pv, pedidoId: pid }).toString()}`;
    const res = await fetch(url, { method: "GET" });
    const json = await parseJsonSafe(res);
    const data =
      json && typeof json === "object" && "data" in json && Array.isArray((json as { data: unknown }).data)
        ? ((json as { data: MensajeChatDomicilio[] }).data ?? [])
        : [];
    if (!res.ok) return { ok: false, data: [], message: "No fue posible cargar el chat." };
    return { ok: true, data };
  } catch {
    return { ok: false, data: [], message: "No fue posible cargar el chat." };
  }
}

export async function enviarMensajeChatDomicilio(payload: ChatDomicilioEnviarPayload): Promise<ChatDomicilioEnviarResponse> {
  if (!payload.puntoVenta.trim() || !payload.pedidoId.trim() || !payload.texto.trim()) {
    return { ok: false, message: "Mensaje inválido." };
  }
  try {
    const res = await fetch("/api/pos_domicilios_chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await parseJsonSafe(res);
    if (!res.ok || (json && typeof json === "object" && "ok" in json && (json as { ok?: boolean }).ok === false)) {
      return {
        ok: false,
        message:
          json && typeof json === "object" && typeof (json as { message?: unknown }).message === "string"
            ? (json as { message: string }).message
            : "No fue posible enviar el mensaje.",
      };
    }
    return {
      ok: true,
      mensaje:
        json && typeof json === "object" && "mensaje" in json
          ? ((json as { mensaje?: MensajeChatDomicilio }).mensaje ?? undefined)
          : undefined,
      message:
        json && typeof json === "object" && typeof (json as { message?: unknown }).message === "string"
          ? (json as { message: string }).message
          : undefined,
    };
  } catch {
    return { ok: false, message: "No fue posible enviar el mensaje." };
  }
}
