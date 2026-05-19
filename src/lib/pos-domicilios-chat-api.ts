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
    const res = await fetch(url, { method: "GET", cache: "no-store" });
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

const MAX_ADJUNTO_CHARS = 290_000;

export async function enviarMensajeChatDomicilio(payload: ChatDomicilioEnviarPayload): Promise<ChatDomicilioEnviarResponse> {
  const adj = payload.adjuntoDataUrl?.trim() ?? "";
  const textoTrim = payload.texto.trim();
  if (!payload.puntoVenta.trim() || !payload.pedidoId.trim()) {
    return { ok: false, message: "Mensaje inválido." };
  }
  if (!textoTrim && !adj) {
    return { ok: false, message: "Escribí un mensaje o adjuntá el comprobante." };
  }
  if (adj.length > MAX_ADJUNTO_CHARS) {
    return { ok: false, message: "La imagen es demasiado grande para enviarla por el chat." };
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
