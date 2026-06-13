"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Cake, Gift, PartyPopper, Send } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { LigaTurnoFila } from "@/components/PosLigaTurnoYMotivacion";
import LigaCumpleMarcoHero from "@/components/LigaCumpleMarcoHero";
import { FRASES_CUMPLE_LIGA } from "@/lib/liga-cumpleanos-colombia";
import {
  enviarMensajeCumpleCajero,
  fetchMuroCumpleCajero,
  type MensajeCumpleMuro,
} from "@/lib/liga-cumple-muro-client";

type Props = {
  cumpleanero: LigaTurnoFila;
  getToken: () => Promise<string | null>;
  autorUid: string;
  autorNombre: string;
  autorPuntoVenta: string;
  fraseIdx: number;
};

const NOTA_ROTaciones = [-2, 1.5, -1, 2, -2.5, 1];

export default function LigaCumpleMuroPanel({
  cumpleanero,
  getToken,
  autorUid,
  autorNombre,
  autorPuntoVenta,
  fraseIdx,
}: Props) {
  const cajeroId = cumpleanero.cajeroTurnoId ?? cumpleanero.uid ?? "";
  const [mensajes, setMensajes] = useState<MensajeCumpleMuro[]>([]);
  const [texto, setTexto] = useState("");
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const frase = FRASES_CUMPLE_LIGA[fraseIdx % FRASES_CUMPLE_LIGA.length] ?? FRASES_CUMPLE_LIGA[0];

  const cargar = useCallback(async () => {
    if (!cajeroId) {
      setCargando(false);
      return;
    }
    const token = await getToken();
    if (!token) {
      setCargando(false);
      return;
    }
    const res = await fetchMuroCumpleCajero(cajeroId, token);
    if (res.ok && Array.isArray(res.mensajes)) {
      setMensajes(res.mensajes);
      setError(null);
    } else if (!res.ok) {
      setError(res.message ?? "No se pudo cargar el muro.");
    }
    setCargando(false);
  }, [cajeroId, getToken]);

  useEffect(() => {
    setCargando(true);
    void cargar();
    const id = window.setInterval(() => void cargar(), 30_000);
    return () => window.clearInterval(id);
  }, [cargar]);

  const yaDejeMensaje = useMemo(
    () => mensajes.some((m) => m.autorUid === autorUid),
    [mensajes, autorUid]
  );

  async function publicar() {
    setError(null);
    setOkMsg(null);
    const t = texto.trim();
    if (!t || !cajeroId) return;
    setEnviando(true);
    try {
      const token = await getToken();
      if (!token) {
        setError("Sesión expirada. Volvé a iniciar sesión.");
        return;
      }
      const res = await enviarMensajeCumpleCajero(
        {
          cajeroId,
          cajeroNombre: cumpleanero.cajeroNombre ?? cumpleanero.nombre,
          texto: t,
          autorNombre,
          autorPuntoVenta,
        },
        token
      );
      if (!res.ok) {
        setError(res.message ?? "No se pudo enviar el mensaje.");
        return;
      }
      setTexto("");
      setOkMsg("¡Tu mensaje ya está en el poster nacional! 🎉");
      await cargar();
    } finally {
      setEnviando(false);
    }
  }

  if (!cajeroId) return null;

  const nombreFestivo = cumpleanero.cajeroNombre ?? cumpleanero.nombre;
  const nombrePv = cumpleanero.puntoVenta?.trim() || cumpleanero.nombre;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="overflow-hidden rounded-2xl border border-pink-400/40 bg-gradient-to-br from-pink-950/40 via-[#2a2318] to-purple-950/30 p-3 shadow-[0_0_32px_rgba(236,72,153,0.15)] sm:p-4"
    >
      <div className="overflow-hidden rounded-2xl border border-pink-300/25 bg-gradient-to-b from-pink-500/10 via-[#1a1610]/80 to-purple-900/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
        <LigaCumpleMarcoHero
          fotoUrl={cumpleanero.cajeroFotoUrl}
          nombre={nombreFestivo}
          cumpleCorto={cumpleanero.cajeroCumpleanosCorto}
          puntoVenta={nombrePv}
          posicion={cumpleanero.posicion}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-2 border-b border-pink-300/20 pb-3">
        <div className="flex items-start gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-pink-500/20 text-pink-200">
            <PartyPopper className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-pink-200/90">
              ¡Feliz cumpleaños!
            </p>
            <AnimatePresence mode="wait">
              <motion.p
                key={fraseIdx}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="mt-0.5 text-sm font-semibold text-[#FFF8E8]"
              >
                {nombreFestivo} · {frase}
              </motion.p>
            </AnimatePresence>
            <p className="mt-1 text-[10px] text-pink-100/70">
              Dejá un mensaje desde tu punto de venta (6:00 a 23:59, hora Colombia).
            </p>
          </div>
        </div>
        <Gift className="h-6 w-6 shrink-0 text-yellow-300/80 motion-safe:animate-bounce" aria-hidden />
      </div>

      <div className="mt-3 min-h-[7rem] rounded-xl border border-dashed border-pink-300/25 bg-[#1a1610]/60 p-2 sm:p-3">
        <p className="mb-2 text-center text-[9px] font-bold uppercase tracking-[0.2em] text-pink-200/80">
          Poster de felicitaciones · red nacional
        </p>
        {cargando && mensajes.length === 0 ? (
          <p className="py-6 text-center text-xs text-pink-100/60">Cargando mensajes…</p>
        ) : mensajes.length === 0 ? (
          <p className="py-6 text-center text-xs text-pink-100/60">
            Sé el primero en escribirle un mensaje especial hoy.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {mensajes.map((m, i) => (
              <div
                key={m.id}
                className="rounded-md border border-yellow-200/30 bg-gradient-to-br from-yellow-100/95 to-amber-50/90 p-2 shadow-md"
                style={{ transform: `rotate(${NOTA_ROTaciones[i % NOTA_ROTaciones.length]}deg)` }}
              >
                <p className="line-clamp-4 text-[11px] font-medium leading-snug text-amber-950">{m.texto}</p>
                <p className="mt-1.5 truncate text-[9px] font-semibold text-amber-900/80">{m.autorNombre}</p>
                <p className="truncate text-[8px] text-amber-800/70">{m.autorPuntoVenta}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="min-w-0 flex-1">
          <span className="mb-1 flex items-center gap-1 text-[10px] font-semibold text-pink-100/90">
            <Cake className="h-3.5 w-3.5 text-pink-300" aria-hidden />
            Tu mensaje para {nombreFestivo.split(" ")[0]}
          </span>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value.slice(0, 240))}
            rows={2}
            maxLength={240}
            disabled={enviando}
            placeholder="Ej: ¡Feliz cumple! Gracias por tu energía en el equipo…"
            className="w-full resize-none rounded-xl border border-pink-300/30 bg-black/30 px-3 py-2 text-sm text-[#FFF8E8] placeholder:text-pink-100/40 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-400/30 disabled:opacity-50"
          />
        </label>
        <button
          type="button"
          onClick={() => void publicar()}
          disabled={enviando || !texto.trim()}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-pink-500 to-amber-500 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-pink-500/25 hover:from-pink-400 hover:to-amber-400 disabled:opacity-50"
        >
          <Send className="h-4 w-4" aria-hidden />
          {enviando ? "Enviando…" : yaDejeMensaje ? "Actualizar mensaje" : "Publicar en el poster"}
        </button>
      </div>

      {error ? <p className="mt-2 text-xs text-red-300">{error}</p> : null}
      {okMsg ? <p className="mt-2 text-xs text-emerald-300">{okMsg}</p> : null}
    </motion.div>
  );
}
