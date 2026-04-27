"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  wmsCajaMensajesListar,
  wmsCajaMensajesMarcarLeido,
  wmsCajaMensajesResponder,
  type PosCajaMensajeCliente,
} from "@/lib/wms-caja-mensajes-client";

function formatHora(ms: number): string {
  if (!ms) return "—";
  try {
    return new Intl.DateTimeFormat("es-CO", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(ms));
  } catch {
    return "—";
  }
}

function IconSend({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
    </svg>
  );
}

function Spinner({ className }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className ?? ""}`} fill="none" viewBox="0 0 24 24" aria-hidden>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

type Props = {
  getIdToken: () => Promise<string | null>;
  className?: string;
};

/**
 * Hilo caja ↔ administración embebido (misma API que la campana del menú).
 */
export default function PosCajaMensajesInline({ getIdToken, className = "" }: Props) {
  const [mensajes, setMensajes] = useState<PosCajaMensajeCliente[]>([]);
  const [cargando, setCargando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const listaRef = useRef<HTMLDivElement>(null);

  const cargarHilo = useCallback(async () => {
    const token = await getIdToken();
    if (!token) return;
    setCargando(true);
    setError(null);
    try {
      const r = await wmsCajaMensajesListar(token);
      if (r.ok) setMensajes(r.mensajes);
      else setError(r.error);
    } finally {
      setCargando(false);
    }
  }, [getIdToken]);

  useEffect(() => {
    void (async () => {
      const token = await getIdToken();
      if (token) await wmsCajaMensajesMarcarLeido(token);
    })();
    void cargarHilo();
    const id = setInterval(() => void cargarHilo(), 6000);
    return () => clearInterval(id);
  }, [getIdToken, cargarHilo]);

  useEffect(() => {
    if (!listaRef.current) return;
    listaRef.current.scrollTop = listaRef.current.scrollHeight;
  }, [mensajes]);

  const enviar = async () => {
    const t = texto.trim();
    if (!t) return;
    setEnviando(true);
    setError(null);
    try {
      const token = await getIdToken();
      if (!token) {
        setError("Sesión inválida.");
        return;
      }
      const r = await wmsCajaMensajesResponder(token, t);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setTexto("");
      await cargarHilo();
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div
      className={`rounded-xl border border-[#FFE08A]/35 bg-black/35 shadow-inner backdrop-blur-sm ${className}`}
      role="region"
      aria-label="Chat con administración"
    >
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#FFE9A8]/95">Chat administración</p>
      </div>

      <div
        ref={listaRef}
        className="max-h-[min(28vh,200px)] space-y-2 overflow-y-auto px-2 py-2 sm:max-h-[min(32vh,240px)]"
      >
        {cargando && mensajes.length === 0 ? (
          <div className="flex justify-center py-8 text-[#FFE9A8]/70">
            <Spinner className="h-7 w-7" />
          </div>
        ) : mensajes.length === 0 ? (
          <p className="px-1 py-3 text-center text-[11px] leading-snug text-[#F5E6C8]/55">
            Sin mensajes aún. El monitor puede escribirte desde el WMS; tus respuestas aparecen aquí.
          </p>
        ) : (
          mensajes.map((m) => {
            const deAdmin = m.direction === "admin_to_pos";
            return (
              <div key={m.id} className={`flex ${deAdmin ? "justify-start" : "justify-end"}`}>
                <div
                  className={`max-w-[94%] rounded-xl px-2.5 py-2 text-xs leading-snug shadow-sm ${
                    deAdmin
                      ? "rounded-tl-sm border border-amber-400/30 bg-gradient-to-br from-amber-50/95 to-amber-100/90 text-gray-900"
                      : "rounded-tr-sm bg-gradient-to-br from-emerald-700 to-teal-800 text-white"
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{m.text}</p>
                  <p
                    className={`mt-1 text-[9px] font-semibold uppercase tracking-wide ${
                      deAdmin ? "text-amber-900/50" : "text-emerald-100/75"
                    }`}
                  >
                    {deAdmin ? "Administración" : "Vos"} · {formatHora(m.createdAtMs)}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {error ? (
        <p className="px-2 pb-1 text-center text-[10px] text-red-300/95" role="alert">
          {error}
        </p>
      ) : null}

      <div className="border-t border-white/10 bg-black/20 p-2">
        <div className="flex gap-1.5 rounded-xl border border-amber-500/25 bg-white/[0.07] p-1 focus-within:border-[#FFC81C]/45">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Escribir al administrativo…"
            rows={2}
            className="min-h-[40px] flex-1 resize-none bg-transparent px-2 py-1.5 text-xs text-white placeholder:text-[#F5E6C8]/35 focus:outline-none"
            disabled={enviando}
            maxLength={4000}
          />
          <button
            type="button"
            disabled={enviando || !texto.trim()}
            onClick={() => void enviar()}
            className="flex h-9 w-9 shrink-0 items-center justify-center self-end rounded-lg bg-gradient-to-br from-[#FFC81C] to-amber-600 text-gray-900 shadow-md transition hover:brightness-105 disabled:opacity-40"
            aria-label="Enviar"
          >
            {enviando ? <Spinner className="h-4 w-4" /> : <IconSend className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
