"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, PauseCircle } from "lucide-react";
import { getWmsPublicBaseUrl } from "@/lib/wms-public-base";

type PausaCaja = {
  motivo: string;
  pausadoPor: string;
  pausadoEn: string | null;
  respuesta: string | null;
  respondidoEn: string | null;
};

type Props = {
  getIdToken: () => Promise<string | null>;
  /** Muestra la pantalla con datos fijos, sin consultar el turno real. */
  ejemplo?: PausaCaja;
};

function sonarAviso() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 740;
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
    osc.onended = () => void ctx.close();
  } catch {
    /* El navegador puede bloquear el audio hasta un gesto. */
  }
}

export default function PosTurnoPausadoPantalla({ getIdToken, ejemplo }: Props) {
  const [pausa, setPausa] = useState<PausaCaja | null>(ejemplo ?? null);
  const [respuesta, setRespuesta] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sonoRef = useRef(false);

  const consultar = useCallback(async () => {
    const token = await getIdToken();
    if (!token) return;
    try {
      const res = await fetch(`${getWmsPublicBaseUrl().replace(/\/$/, "")}/api/pos/turnos/pausa`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; pausa?: PausaCaja | null };
      if (!res.ok || !json.ok) return;
      setPausa(json.pausa ?? null);
      if (!json.pausa) {
        sonoRef.current = false;
        setRespuesta("");
        setError(null);
      }
    } catch {
      /* Si el WMS no responde, la caja sigue operando. El siguiente intento reintenta. */
    }
  }, [getIdToken]);

  useEffect(() => {
    if (ejemplo) return;
    void consultar();
    const id = window.setInterval(() => void consultar(), 4000);
    return () => window.clearInterval(id);
  }, [consultar, ejemplo]);

  useEffect(() => {
    if (!pausa) return;
    if (!ejemplo && !sonoRef.current) {
      sonoRef.current = true;
      sonarAviso();
    }
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previo;
    };
  }, [pausa, ejemplo]);

  async function enviar() {
    const texto = respuesta.trim();
    if (texto.length < 8) {
      setError("La respuesta es obligatoria. Escribe al menos 8 caracteres.");
      return;
    }
    if (ejemplo) {
      setPausa({ ...ejemplo, respuesta: texto, respondidoEn: "Ahora" });
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      const token = await getIdToken();
      if (!token) {
        setError("La sesión de la caja venció. Vuelve a entrar.");
        return;
      }
      const res = await fetch(`${getWmsPublicBaseUrl().replace(/\/$/, "")}/api/pos/turnos/pausa`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ respuesta: texto }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error || "No se pudo enviar la respuesta.");
        return;
      }
      await consultar();
    } catch {
      setError("Sin conexión con casa matriz. Intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  if (!pausa) return null;

  return (
    <div
      className="fixed inset-0 z-[240] flex items-center justify-center bg-slate-950 px-4 py-8 text-white"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="turno-pausado-titulo"
    >
      <div className="w-full max-w-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-300">Casa matriz</p>
        <div className="mt-3 flex items-center gap-3">
          <PauseCircle className="h-10 w-10 shrink-0 text-amber-300" aria-hidden />
          <h1 id="turno-pausado-titulo" className="text-3xl font-semibold tracking-tight">
            Turno pausado
          </h1>
        </div>
        <p className="mt-4 text-base leading-relaxed text-slate-200">
          El servicio de este punto de venta está suspendido de forma temporal. No se puede vender ni cobrar hasta que casa matriz reanude el turno.
        </p>
        <div className="mt-6 rounded-2xl border border-amber-300/40 bg-amber-300/10 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-200">Motivo de la suspensión</p>
          <p className="mt-2 whitespace-pre-wrap text-lg leading-relaxed text-white">{pausa.motivo}</p>
          {pausa.pausadoEn ? <p className="mt-3 text-xs text-amber-100/80">{pausa.pausadoEn}</p> : null}
        </div>

        {pausa.respuesta ? (
          <div className="mt-6 rounded-2xl border border-emerald-300/40 bg-emerald-400/10 p-5">
            <p className="text-sm font-medium text-emerald-100">Tu respuesta ya llegó a casa matriz.</p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-emerald-50">{pausa.respuesta}</p>
            <p className="mt-3 text-sm text-slate-300">El turno sigue pausado. Espera a que reanuden el servicio.</p>
          </div>
        ) : (
          <div className="mt-6">
            <label htmlFor="respuesta-pausa-turno" className="text-sm font-medium text-slate-100">
              Respuesta obligatoria para casa matriz
            </label>
            <textarea
              id="respuesta-pausa-turno"
              value={respuesta}
              onChange={(e) => setRespuesta(e.target.value)}
              rows={4}
              maxLength={500}
              placeholder="Confirma que leíste el motivo y describe lo que vas a hacer."
              className="mt-2 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-3 text-sm text-white placeholder:text-slate-400 focus:border-amber-300 focus:outline-none"
            />
            {error ? <p className="mt-2 text-sm text-rose-200">{error}</p> : null}
            <button
              type="button"
              onClick={() => void enviar()}
              disabled={enviando || respuesta.trim().length < 8}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-amber-400 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-amber-300 disabled:opacity-50"
            >
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Enviar respuesta
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
