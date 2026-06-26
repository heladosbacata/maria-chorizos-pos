"use client";

import { useEffect, useMemo, useState } from "react";
import { useMetasRetosCaja } from "@/components/MetasRetosCajaProvider";
import { emailDesdeFichaFranquiciado, getFranquiciadoPorPuntoVenta } from "@/lib/franquiciado-pos";
import { avanceUnidadesReto, etiquetaRangoPeriodo } from "@/lib/metas-retos-avance-ventas";
import { formatPesosCop } from "@/lib/pesos-cop-input";
import type { MetaRetoActiva } from "@/lib/wms-metas-retos-activas";

const CC_RECONOCIMIENTO_BONO = "servicioalcliente@grupobacata.com";
const STORAGE_PREFIX = "pos_meta_bono_celebrada_v1";

type MetaCumplida = {
  reto: MetaRetoActiva;
  avance: number;
  meta: number;
  periodo: string;
  storageKey: string;
};

type Props = {
  puntoVenta: string | null | undefined;
  emailSesion?: string | null;
  getIdToken: () => Promise<string | null>;
};

function cadenciaLabel(c: MetaRetoActiva["cadencia"]): string {
  if (c === "semanal") return "semanal";
  if (c === "mensual") return "mensual";
  return "diaria";
}

function emailValidoSimple(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

function storageKeyMeta(puntoVenta: string, reto: MetaRetoActiva, periodo: string): string {
  const pv = puntoVenta.trim().toLowerCase() || "sin-pv";
  return `${STORAGE_PREFIX}:${pv}:${reto.id}:${periodo}`;
}

function yaCelebrada(key: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function marcarCelebrada(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    /* ignore */
  }
}

function textoCorreoReconocimiento(input: {
  puntoVenta: string;
  meta: MetaCumplida;
}): string {
  const { puntoVenta, meta } = input;
  const { reto } = meta;
  const bonoReconocido = reto.bonoDetalle?.trim() || `$${formatPesosCop(reto.bonoCOP, false)} COP`;
  return [
    "¡Felicitaciones!",
    "",
    `El punto de venta ${puntoVenta} alcanzó la meta ${cadenciaLabel(reto.cadencia)} programada y ganó la bonificación asociada.`,
    "",
    "Detalle del cumplimiento:",
    `- Producto/reto: ${reto.descripcionProducto || "Producto del reto"}`,
    reto.skuBarcode ? `- SKU: ${reto.skuBarcode}` : "",
    `- Periodo: ${meta.periodo}`,
    `- Meta: ${meta.meta} unidades`,
    `- Avance registrado: ${meta.avance} unidades`,
    `- Bono reconocido: ${bonoReconocido}`,
    reto.descripcionReto?.trim() ? `- Mensaje del reto: ${reto.descripcionReto.trim()}` : "",
    "",
    "Solicitamos reconocer este bono según las políticas comerciales vigentes de Grupo Bacatá.",
    "",
    "Este mensaje fue generado desde el POS María Chorizos al detectar el cumplimiento de la meta.",
  ]
    .filter(Boolean)
    .join("\n");
}

function etiquetaBono(reto: MetaRetoActiva): string {
  return reto.bonoDetalle?.trim() || `$${formatPesosCop(reto.bonoCOP, false)} COP`;
}

export default function PosMetaCumplidaCelebracion({ puntoVenta, emailSesion, getIdToken }: Props) {
  const { retos, ventas, ymdRef, cargando } = useMetasRetosCaja();
  const pv = puntoVenta?.trim() || "";
  const [metaActiva, setMetaActiva] = useState<MetaCumplida | null>(null);
  const [emailPara, setEmailPara] = useState(emailSesion?.trim() || "");
  const [buscandoEmail, setBuscandoEmail] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const metasCumplidas = useMemo(() => {
    if (!pv) return [];
    return retos
      .map((reto): MetaCumplida | null => {
        const meta = Math.max(0, Number(reto.metaUnidades) || 0);
        if (meta <= 0) return null;
        const { avance, rango } = avanceUnidadesReto(reto, ventas, ymdRef);
        if (avance < meta) return null;
        const periodo = rango ? etiquetaRangoPeriodo(rango.desde, rango.hasta) : ymdRef;
        return {
          reto,
          avance,
          meta,
          periodo,
          storageKey: storageKeyMeta(pv, reto, periodo),
        };
      })
      .filter(Boolean) as MetaCumplida[];
  }, [pv, retos, ventas, ymdRef]);

  useEffect(() => {
    if (cargando || metaActiva || metasCumplidas.length === 0) return;
    const pendiente = metasCumplidas.find((m) => !yaCelebrada(m.storageKey));
    if (!pendiente) return;
    setMetaActiva(pendiente);
    setMensaje(null);
    setError(null);
    setEmailPara((prev) => prev.trim() || emailSesion?.trim() || "");
  }, [cargando, emailSesion, metaActiva, metasCumplidas]);

  useEffect(() => {
    if (!metaActiva || !pv) return;
    let cancelled = false;
    setBuscandoEmail(true);
    void (async () => {
      try {
        const token = await getIdToken();
        const r = await getFranquiciadoPorPuntoVenta(pv, token);
        if (cancelled) return;
        const emailFicha = emailDesdeFichaFranquiciado(r.franquiciado ?? null);
        if (emailFicha) setEmailPara(emailFicha);
        else if (emailSesion?.trim()) setEmailPara(emailSesion.trim());
      } finally {
        if (!cancelled) setBuscandoEmail(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [emailSesion, getIdToken, metaActiva, pv]);

  if (!metaActiva || !pv) return null;

  const cerrar = () => {
    marcarCelebrada(metaActiva.storageKey);
    setMetaActiva(null);
  };

  const enviarCorreo = async () => {
    const to = emailPara.trim();
    if (!emailValidoSimple(to)) {
      setError("Ingresa un correo válido del franquiciado.");
      return;
    }
    setEnviando(true);
    setError(null);
    setMensaje(null);
    try {
      const token = await getIdToken();
      if (!token) {
        setError("No hay sesión válida para enviar el correo.");
        return;
      }
      const subject = `Meta cumplida y bono ganado - ${pv}`;
      const text = textoCorreoReconocimiento({ puntoVenta: pv, meta: metaActiva });
      const res = await fetch("/api/pos_turno_informe_correo", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          to,
          cc: CC_RECONOCIMIENTO_BONO,
          subject,
          text,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (!res.ok || data.ok === false) {
        setError(data.message || `No se pudo enviar el correo (${res.status}).`);
        return;
      }
      marcarCelebrada(metaActiva.storageKey);
      setMensaje("Correo enviado. El cumplimiento quedó reportado para reconocimiento del bono.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo enviar el correo.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[230] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-md">
      <style>{`
        @keyframes meta-float-3d {
          0%, 100% { transform: translate3d(0, 0, 0) rotateX(0deg) rotateY(0deg); }
          50% { transform: translate3d(0, -10px, 35px) rotateX(7deg) rotateY(-7deg); }
        }
        @keyframes meta-confetti-pop {
          0% { transform: translate3d(0, 0, 0) rotate(0deg) scale(0.6); opacity: 0; }
          12% { opacity: 1; }
          100% { transform: translate3d(var(--mx), var(--my), 90px) rotate(var(--mr)) scale(1); opacity: 0; }
        }
      `}</style>
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        {Array.from({ length: 34 }).map((_, i) => (
          <span
            key={i}
            className="absolute left-1/2 top-1/2 h-2.5 w-2.5 rounded-sm bg-yellow-300 shadow-lg"
            style={{
              ["--mx" as string]: `${Math.cos(i * 0.75) * (130 + (i % 6) * 28)}px`,
              ["--my" as string]: `${Math.sin(i * 0.75) * (95 + (i % 7) * 22)}px`,
              ["--mr" as string]: `${120 + i * 37}deg`,
              animation: `meta-confetti-pop ${1.8 + (i % 5) * 0.16}s ease-out ${i * 0.035}s infinite`,
              backgroundColor: ["#FFC81C", "#22c55e", "#ef4444", "#38bdf8", "#f97316"][i % 5],
            }}
          />
        ))}
      </div>

      <section className="relative w-full max-w-xl overflow-hidden rounded-[2rem] border border-amber-200/70 bg-gradient-to-br from-amber-50 via-white to-orange-50 p-6 text-center shadow-[0_35px_110px_-28px_rgba(0,0,0,0.75)]">
        <div className="pointer-events-none absolute -left-20 -top-20 h-48 w-48 rounded-full bg-yellow-300/40 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -right-16 h-56 w-56 rounded-full bg-emerald-300/30 blur-3xl" />

        <div
          className="relative mx-auto flex h-28 w-28 items-center justify-center rounded-[2rem] bg-gradient-to-br from-yellow-300 via-amber-400 to-orange-500 text-6xl shadow-[0_24px_50px_-18px_rgba(217,119,6,0.8)]"
          style={{ animation: "meta-float-3d 2.4s ease-in-out infinite", transformStyle: "preserve-3d" }}
          aria-hidden
        >
          🏆
        </div>

        <p className="relative mt-5 text-xs font-black uppercase tracking-[0.28em] text-amber-700">
          Meta alcanzada
        </p>
        <h2 className="relative mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
          ¡Ganaste la bonificación!
        </h2>
        <p className="relative mt-3 text-sm leading-relaxed text-slate-700">
          <strong>{pv}</strong> cumplió el reto <strong>{metaActiva.reto.descripcionProducto || "programado"}</strong>.
          El bono a reconocer es{" "}
          <strong className="text-emerald-700">{etiquetaBono(metaActiva.reto)}</strong>.
        </p>

        <div className="relative mt-5 grid gap-3 rounded-2xl border border-amber-200 bg-white/75 p-4 text-left text-sm shadow-inner">
          <div className="flex justify-between gap-3">
            <span className="text-slate-500">Avance</span>
            <strong className="text-slate-900">{metaActiva.avance} / {metaActiva.meta} unidades</strong>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-slate-500">Periodo</span>
            <strong className="text-right font-mono text-slate-900">{metaActiva.periodo}</strong>
          </div>
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Correo franquiciado</span>
            <input
              type="email"
              value={emailPara}
              onChange={(e) => setEmailPara(e.target.value)}
              placeholder={buscandoEmail ? "Buscando correo..." : "franquiciado@correo.com"}
              className="mt-1 w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
            />
          </label>
          <p className="text-xs text-slate-500">
            Se enviará copia automática a <strong>{CC_RECONOCIMIENTO_BONO}</strong>.
          </p>
        </div>

        {error ? <p className="relative mt-3 text-sm font-semibold text-red-700">{error}</p> : null}
        {mensaje ? <p className="relative mt-3 text-sm font-semibold text-emerald-700">{mensaje}</p> : null}

        <div className="relative mt-6 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={enviarCorreo}
            disabled={enviando}
            className="rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-3 text-sm font-black uppercase tracking-wide text-white shadow-lg shadow-emerald-500/25 hover:brightness-110 disabled:opacity-60"
          >
            {enviando ? "Enviando..." : "Enviar reconocimiento del bono"}
          </button>
          <button
            type="button"
            onClick={cerrar}
            className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            Cerrar
          </button>
        </div>
      </section>
    </div>
  );
}
