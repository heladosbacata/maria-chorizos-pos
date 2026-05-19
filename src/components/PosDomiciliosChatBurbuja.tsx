"use client";

import type { MensajeChatDomicilio } from "@/types/pos-domicilios-chat";
import { etiquetaRespuestaRapidaDomicilio } from "@/types/pos-domicilios-chat";

type Props = {
  mensaje: MensajeChatDomicilio;
  /** Burbuja alineada a la derecha (cliente en landing, POS en caja). */
  esPropio: boolean;
  horaFormateada: string;
};

export function PosDomiciliosChatBurbuja({ mensaje: m, esPropio, horaFormateada }: Props) {
  const esFotoChat = m.tipoMensaje === "imagen";
  const esComprobante = m.tipoMensaje === "comprobante" || (Boolean(m.adjuntoDataUrl) && !esFotoChat);
  const etiquetaRapida = m.respuestaRapidaId ? etiquetaRespuestaRapidaDomicilio(m.respuestaRapidaId) : "";

  return (
    <article
      className={`max-w-[85%] rounded-xl px-3 py-2 text-xs shadow-sm ${
        esPropio ? "ml-auto bg-cyan-600 text-white" : "bg-white text-slate-800"
      }`}
    >
      <p className={`font-semibold ${esPropio ? "text-cyan-50" : "text-slate-700"}`}>{m.autorLabel}</p>
      <div className="mt-1 flex flex-wrap gap-1">
        {etiquetaRapida ? (
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
              esPropio ? "bg-white/20 text-cyan-50" : "bg-violet-100 text-violet-800"
            }`}
          >
            {etiquetaRapida}
          </span>
        ) : null}
        {esFotoChat ? (
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
              esPropio ? "bg-violet-300/25 text-violet-100" : "bg-violet-100 text-violet-900"
            }`}
          >
            Foto
          </span>
        ) : null}
        {esComprobante ? (
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
              esPropio ? "bg-amber-300/25 text-amber-100" : "bg-amber-100 text-amber-900"
            }`}
          >
            Comprobante
          </span>
        ) : null}
      </div>
      {m.adjuntoDataUrl ? (
        <a
          href={m.adjuntoDataUrl}
          download={m.adjuntoNombre?.trim() || "comprobante.jpg"}
          target="_blank"
          rel="noreferrer"
          className={`mt-2 block overflow-hidden rounded-lg border ${
            esPropio ? "border-cyan-400/40 bg-cyan-800/30" : "border-slate-200 bg-slate-100"
          }`}
        >
          <img
            src={m.adjuntoDataUrl}
            alt={m.adjuntoNombre ? `Adjunto: ${m.adjuntoNombre}` : esFotoChat ? "Foto del chat" : "Comprobante de pago"}
            className="max-h-52 w-full object-contain"
          />
        </a>
      ) : null}
      <p className={`mt-1 whitespace-pre-wrap ${esPropio && m.adjuntoDataUrl ? "text-cyan-50" : ""}`}>{m.texto}</p>
      <p className={`mt-1 text-[10px] ${esPropio ? "text-cyan-100" : "text-slate-500"}`}>{horaFormateada}</p>
    </article>
  );
}
