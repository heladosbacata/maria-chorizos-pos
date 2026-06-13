"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Cake, Sparkles, User, ZoomIn } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import LigaCumpleMuroPanel from "@/components/LigaCumpleMuroPanel";
import {
  esCumpleanosHoyColombia,
  FRASES_CUMPLE_LIGA,
  ventanaCumpleanosActivaColombia,
} from "@/lib/liga-cumpleanos-colombia";
import { FRASES_LIGA_TURNO } from "@/lib/pos-liga-turno-frases";
import { ligaCumplePreviewActivo } from "@/lib/liga-cumple-preview";

export type LigaTurnoFila = {
  posicion: number;
  /** Nombre del punto de venta (etiqueta en ranking). */
  nombre: string;
  totalVenta: number;
  /** Id. del punto en WMS; sirve para saber si esta fila es el POS abierto. */
  puntoVenta?: string;
  /** Nombre del cajero en turno (WMS / posCajerosTurno). */
  cajeroNombre?: string;
  /** Foto del cajero en turno desde WMS (Firebase Storage). */
  cajeroFotoUrl?: string;
  /** Cumpleaños corto, p. ej. «15 may». */
  cajeroCumpleanosCorto?: string;
  /** Fecha de nacimiento ISO o texto (WMS / posCajerosTurno.ficha). */
  cajeroFechaNacimiento?: string;
  /** Id. del documento posCajerosTurno (para muro de cumpleaños). */
  cajeroTurnoId?: string;
  /** 0–100 según WMS (si viene 0–1 se convierte). */
  barPct?: number;
  abiertoHoraCorta?: string;
  uid?: string;
};

type MetaLiga = {
  miRank: number | null;
  miUid: string | null;
  gapAlPrimero: number | null;
  miTurnoAbierto: boolean | null;
};

type Props = {
  apiBaseUrl: string;
  /** Ruta relativa, ej. `/api/pos/turnos/liga`. Si no se pasa, usa `NEXT_PUBLIC_WMS_LIGA_PATH` o el default. */
  ligaPath?: string;
  /** Punto de venta actual; se envía como `puntoVenta` en query si el WMS lo requiere. */
  puntoVenta?: string | null;
  getToken: () => Promise<string | null>;
  /** Intervalo de poll al WMS (ms). Por defecto 45 s. */
  pollMs?: number;
  fraseIntervalMs?: number;
  /** Cajero logueado en este POS (para publicar en el muro de cumpleaños). */
  /** Incrementa en cada venta cobrada; fuerza refresh inmediato de la liga. */
  ventaCompletadaTick?: number;
  mensajeAutor?: {
    uid: string;
    nombre: string;
    puntoVenta: string;
  };
};

type CargaError = "none" | "not_found" | "other" | "network";

const metaVacio: MetaLiga = { miRank: null, miUid: null, gapAlPrimero: null, miTurnoAbierto: null };

const TOP_LIGA_SIZE = 6;
const TOP_PODIO_SIZE = 3;
const LIGA_POLL_MS = 45_000;
/** Orden visual del podio olímpico: plata · oro · bronce. */
const ORDEN_PODIO_VISUAL = [2, 1, 3] as const;

function stripTrailingSlash(s: string): string {
  return s.replace(/\/$/, "");
}

function etiquetaUid(uid: unknown): string {
  if (typeof uid !== "string" || !uid.trim()) return "";
  const u = uid.trim();
  if (u.length <= 10) return u;
  return `${u.slice(0, 4)}…${u.slice(-4)}`;
}

function normalizarBarPct(raw: unknown): number | undefined {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return undefined;
  if (raw < 0) return 0;
  if (raw > 0 && raw <= 1) return Math.round(raw * 100);
  return Math.min(100, Math.round(raw));
}

function pickNested(obj: Record<string, unknown>, key: string): unknown {
  const nested = [obj.data, obj.result, obj.payload, obj.liga, obj.turno, obj.body] as unknown[];
  for (const n of nested) {
    if (n && typeof n === "object") {
      const v = (n as Record<string, unknown>)[key];
      if (Array.isArray(v) && v.length > 0) return v;
    }
  }
  return undefined;
}

function extraerRankingPayload(data: unknown): unknown[] {
  if (!data || typeof data !== "object") return [];
  const o = data as Record<string, unknown>;
  const keys = [
    "ranking",
    "rankings",
    "tabla",
    "posiciones",
    "cajeros",
    "participantes",
    "integrantes",
    "clasificacion",
    "leaderboard",
    "rows",
    "entries",
    "items",
    "lista",
  ];
  const cands: unknown[] = [];
  for (const k of keys) {
    cands.push(o[k]);
    const nested = pickNested(o, k);
    if (nested !== undefined) cands.push(nested);
  }
  for (const c of cands) {
    if (Array.isArray(c) && c.length > 0) return c;
  }
  if (Array.isArray(data)) return data;
  return [];
}

function extraerMetaDesdeRespuesta(data: unknown): MetaLiga {
  if (!data || typeof data !== "object") return metaVacio;
  const o = data as Record<string, unknown>;
  const miRankRaw = o.miRank ?? o.mi_rank;
  const miUidRaw = o.miUid ?? o.mi_uid;
  const gapRaw = o.gapAlPrimero ?? o.gap_al_primero;
  const turnoRaw = o.miTurnoAbierto ?? o.mi_turno_abierto;

  const miRank =
    typeof miRankRaw === "number" && Number.isFinite(miRankRaw) ? Math.round(miRankRaw) : null;
  const miUid = typeof miUidRaw === "string" && miUidRaw.trim() ? miUidRaw.trim() : null;
  let gapAlPrimero: number | null = null;
  if (typeof gapRaw === "number" && Number.isFinite(gapRaw)) gapAlPrimero = gapRaw;
  else if (typeof gapRaw === "string") {
    const n = Number(gapRaw.replace(/\s/g, "").replace(",", "."));
    if (Number.isFinite(n)) gapAlPrimero = n;
  }
  const miTurnoAbierto = typeof turnoRaw === "boolean" ? turnoRaw : null;

  return { miRank, miUid, gapAlPrimero, miTurnoAbierto };
}

function nombreDesdeCajeroAnidado(r: Record<string, unknown>): string {
  const cajero = r.cajero;
  if (!cajero || typeof cajero !== "object") return "";
  const c = cajero as Record<string, unknown>;
  return (
    (typeof c.nombre === "string" && c.nombre.trim()) ||
    (typeof c.nombreDisplay === "string" && c.nombreDisplay.trim()) ||
    (typeof c.displayName === "string" && c.displayName.trim()) ||
    (typeof c.email === "string" && c.email.trim()) ||
    ""
  );
}

function cajeroFotoDesdeRecord(r: Record<string, unknown>): string | undefined {
  const keys = [
    "cajeroFotoUrl",
    "cajero_foto_url",
    "fotoUrl",
    "fotoURL",
    "photoURL",
    "photoUrl",
  ] as const;
  for (const k of keys) {
    const v = r[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  const cajero = r.cajero;
  if (cajero && typeof cajero === "object") {
    const c = cajero as Record<string, unknown>;
    const nested = c.ficha;
    if (nested && typeof nested === "object") {
      const ficha = nested as Record<string, unknown>;
      if (typeof ficha.fotoUrl === "string" && ficha.fotoUrl.trim()) return ficha.fotoUrl.trim();
    }
    if (typeof c.fotoUrl === "string" && c.fotoUrl.trim()) return c.fotoUrl.trim();
  }
  return undefined;
}

function cumpleanosDesdeRecord(r: Record<string, unknown>): string | undefined {
  const keys = ["cajeroCumpleanosCorto", "cajero_cumpleanos_corto", "cumpleanosCorto"] as const;
  for (const k of keys) {
    const v = r[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

function fechaNacimientoDesdeRecord(r: Record<string, unknown>): string | undefined {
  const keys = [
    "cajeroFechaNacimiento",
    "cajero_fecha_nacimiento",
    "fechaNacimiento",
    "fecha_nacimiento",
  ] as const;
  for (const k of keys) {
    const v = r[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  const cajero = r.cajero;
  if (cajero && typeof cajero === "object") {
    const c = cajero as Record<string, unknown>;
    const nested = c.ficha;
    if (nested && typeof nested === "object") {
      const ficha = nested as Record<string, unknown>;
      if (typeof ficha.fechaNacimiento === "string" && ficha.fechaNacimiento.trim()) {
        return ficha.fechaNacimiento.trim();
      }
    }
  }
  return undefined;
}

function cajeroTurnoIdDesdeRecord(r: Record<string, unknown>): string | undefined {
  const keys = ["cajeroTurnoId", "cajeroId", "cajero_id", "cajeroUid", "cajero_uid"] as const;
  for (const k of keys) {
    const v = r[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  const cajero = r.cajero;
  if (cajero && typeof cajero === "object") {
    const c = cajero as Record<string, unknown>;
    if (typeof c.id === "string" && c.id.trim()) return c.id.trim();
  }
  return undefined;
}

function filaEsCumpleFestivo(f: LigaTurnoFila, ventanaActiva: boolean): boolean {
  if (!ventanaActiva) return false;
  return esCumpleanosHoyColombia({
    fechaNacimiento: f.cajeroFechaNacimiento,
    cumpleCorto: f.cajeroCumpleanosCorto,
  });
}

function idCajeroParaMuro(f: LigaTurnoFila): string {
  return (f.cajeroTurnoId ?? f.uid ?? "").trim();
}

function esMiFilaRanking(f: LigaTurnoFila, pv: string | undefined, miUid: string | null): boolean {
  if (miUid && f.uid && f.uid === miUid) return true;
  return esFilaDelPuntoActual(f, pv);
}

function normalizarFila(raw: unknown, idx: number): LigaTurnoFila | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const punto =
    (typeof r.puntoVenta === "string" && r.puntoVenta.trim()) ||
    (typeof r.punto === "string" && r.punto.trim()) ||
    "";
  const cajeroNombre =
    (typeof r.cajeroNombre === "string" && r.cajeroNombre.trim()) ||
    (typeof r.nombreCajero === "string" && r.nombreCajero.trim()) ||
    nombreDesdeCajeroAnidado(r) ||
    undefined;
  const nombrePv =
    (typeof r.nombre === "string" && r.nombre.trim()) ||
    (typeof r.label === "string" && r.label.trim()) ||
    punto ||
    etiquetaUid(r.uid) ||
    cajeroNombre ||
    "";
  const posRaw = r.rank ?? r.posicion ?? r.pos ?? r.orden ?? r.puesto ?? (idx === 0 ? 1 : idx + 1);
  const pos = typeof posRaw === "number" && Number.isFinite(posRaw) ? Math.round(posRaw) : idx + 1;
  const totalRaw =
    r.totalVenta ??
    r.total ??
    r.ventaTotal ??
    r.monto ??
    r.valor ??
    r.totalVentas ??
    r.ventasHoy ??
    r.ventasTurno ??
    r.acumulado ??
    0;
  let total = 0;
  if (typeof totalRaw === "number" && Number.isFinite(totalRaw)) total = totalRaw;
  else if (typeof totalRaw === "string") {
    const n = Number(totalRaw.replace(/\s/g, "").replace(",", "."));
    if (Number.isFinite(n)) total = n;
  }
  if (!nombrePv || total < 0) return null;

  const uid = typeof r.uid === "string" ? r.uid : undefined;
  const cajeroFotoUrl = cajeroFotoDesdeRecord(r);
  const cajeroCumpleanosCorto = cumpleanosDesdeRecord(r);
  const cajeroFechaNacimiento = fechaNacimientoDesdeRecord(r);
  const cajeroTurnoId = cajeroTurnoIdDesdeRecord(r);
  const abiertoHoraCorta =
    typeof r.abiertoHoraCorta === "string" && r.abiertoHoraCorta.trim()
      ? r.abiertoHoraCorta.trim()
      : typeof r.abierto_hora_corta === "string" && r.abierto_hora_corta.trim()
        ? r.abierto_hora_corta.trim()
        : undefined;
  const barPct = normalizarBarPct(r.barPct ?? r.bar_pct);

  return {
    posicion: pos,
    nombre: nombrePv,
    totalVenta: total,
    puntoVenta: punto || undefined,
    ...(cajeroNombre ? { cajeroNombre } : {}),
    ...(cajeroFotoUrl ? { cajeroFotoUrl } : {}),
    ...(cajeroCumpleanosCorto ? { cajeroCumpleanosCorto } : {}),
    ...(cajeroFechaNacimiento ? { cajeroFechaNacimiento } : {}),
    ...(cajeroTurnoId ? { cajeroTurnoId } : {}),
    barPct,
    abiertoHoraCorta,
    uid,
  };
}

function esFilaDelPuntoActual(f: LigaTurnoFila, pv: string | undefined): boolean {
  if (!pv?.trim()) return false;
  const p = pv.trim().toLowerCase();
  const idFila = f.puntoVenta?.trim().toLowerCase();
  const nom = f.nombre.trim().toLowerCase();
  return idFila === p || nom === p;
}

type EstiloPodio = {
  marco: string;
  aroMedalla: string;
  textoMedalla: string;
  brillo: string;
  etiqueta?: string;
};

/** Estilos por puesto: 1 oro, 2 plata, 3 bronce; 4–6 perseguidores del podio. */
function estilosPodio(pos: number): EstiloPodio {
  if (pos === 1) {
    return {
      marco:
        "border-[#FFD700]/80 bg-gradient-to-br from-[#FFD700]/30 via-[#E8C547]/15 to-[#B8860B]/25 shadow-[0_0_28px_rgba(255,215,0,0.35)]",
      aroMedalla:
        "bg-gradient-to-br from-[#FFD700] via-[#E8C547] to-[#B8860B] shadow-[0_0_14px_rgba(255,215,0,0.55)]",
      textoMedalla: "text-[#1a140c]",
      brillo: "from-[#FFD700]/50 via-transparent to-transparent",
      etiqueta: "Líder del turno",
    };
  }
  if (pos === 2) {
    return {
      marco:
        "border-[#D4D4D8]/70 bg-gradient-to-br from-[#F4F4F5]/25 via-[#D4D4D8]/12 to-[#9CA3AF]/18 shadow-[0_0_18px_rgba(200,200,210,0.28)]",
      aroMedalla:
        "bg-gradient-to-br from-[#F4F4F5] via-[#D4D4D8] to-[#9CA3AF] shadow-[0_0_12px_rgba(200,200,210,0.4)]",
      textoMedalla: "text-[#1a140c]",
      brillo: "from-[#F4F4F5]/40 via-transparent to-transparent",
      etiqueta: "Subcampeón",
    };
  }
  if (pos === 3) {
    return {
      marco:
        "border-[#CD7F32]/70 bg-gradient-to-br from-[#CD7F32]/28 via-[#B87333]/12 to-[#6B4423]/22 shadow-[0_0_18px_rgba(205,127,50,0.3)]",
      aroMedalla:
        "bg-gradient-to-br from-[#CD7F32] via-[#B87333] to-[#6B4423] shadow-[0_0_12px_rgba(205,127,50,0.4)]",
      textoMedalla: "text-[#FFF8E8]",
      brillo: "from-[#CD7F32]/40 via-transparent to-transparent",
      etiqueta: "Bronce",
    };
  }
  if (pos === 4) {
    return {
      marco: "border-emerald-400/45 bg-gradient-to-br from-emerald-500/15 to-emerald-900/10 shadow-[0_0_12px_rgba(16,185,129,0.15)]",
      aroMedalla: "bg-gradient-to-br from-emerald-300 to-emerald-600 shadow-[0_0_8px_rgba(16,185,129,0.35)]",
      textoMedalla: "text-[#052e1a]",
      brillo: "from-emerald-400/25 via-transparent to-transparent",
      etiqueta: "Top 4",
    };
  }
  if (pos === 5) {
    return {
      marco: "border-sky-400/40 bg-gradient-to-br from-sky-500/12 to-sky-900/10 shadow-[0_0_10px_rgba(56,189,248,0.12)]",
      aroMedalla: "bg-gradient-to-br from-sky-300 to-sky-600 shadow-[0_0_8px_rgba(56,189,248,0.3)]",
      textoMedalla: "text-[#0c2340]",
      brillo: "from-sky-400/20 via-transparent to-transparent",
      etiqueta: "Top 5",
    };
  }
  if (pos === 6) {
    return {
      marco: "border-[#FFC81C]/35 bg-gradient-to-br from-[#FFC81C]/12 to-[#6B4423]/08 shadow-[0_0_10px_rgba(255,200,28,0.1)]",
      aroMedalla: "bg-gradient-to-br from-[#FFE08A] to-[#B8860B] shadow-[0_0_8px_rgba(255,200,28,0.25)]",
      textoMedalla: "text-[#1a140c]",
      brillo: "from-[#FFC81C]/20 via-transparent to-transparent",
      etiqueta: "Top 6",
    };
  }
  return {
    marco: "border-[#FFC81C]/45 bg-[#FFC81C]/10",
    aroMedalla: "bg-[#FFC81C]/90",
    textoMedalla: "text-[#1a140c]",
    brillo: "from-[#FFC81C]/25 via-transparent to-transparent",
  };
}

type VarianteFoto = "hero" | "podio" | "compact";

function tamanoFoto(variante: VarianteFoto): { foto: string; medalla: string } {
  if (variante === "hero") {
    return {
      foto: "h-[4.5rem] w-[4.5rem] sm:h-24 sm:w-24",
      medalla: "h-7 w-7 text-[11px] sm:h-8 sm:w-8 sm:text-xs",
    };
  }
  if (variante === "podio") {
    return {
      foto: "h-16 w-16 sm:h-[4.25rem] sm:w-[4.25rem]",
      medalla: "h-6 w-6 text-[10px] sm:h-7 sm:w-7 sm:text-[11px]",
    };
  }
  return {
    foto: "h-12 w-12 sm:h-14 sm:w-14",
    medalla: "h-6 w-6 text-[10px] sm:h-7 sm:w-7 sm:text-xs",
  };
}

function LigaTurnoBadgePuesto({
  posicion,
  variante = "podio",
  className = "",
}: {
  posicion: number;
  variante?: VarianteFoto;
  className?: string;
}) {
  const podio = estilosPodio(posicion);
  const tam =
    variante === "hero"
      ? "h-10 w-10 text-lg sm:h-11 sm:w-11 sm:text-xl"
      : variante === "podio"
        ? "h-9 w-9 text-base sm:h-10 sm:w-10"
        : "h-8 w-8 text-sm";

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full border-2 border-[#1a1610] font-black leading-none shadow-[0_2px_10px_rgba(0,0,0,0.35)] ${tam} ${podio.aroMedalla} ${podio.textoMedalla} ${className}`}
      aria-label={`Puesto ${posicion}`}
    >
      {posicion}
    </span>
  );
}

function ringMarcoCajero(posicion: number, esMiTurno: boolean): string {
  if (esMiTurno) {
    return "ring-[3px] ring-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.45)]";
  }
  if (posicion === 1) {
    return "ring-[3px] ring-[#FFD700] shadow-[0_0_22px_rgba(255,215,0,0.5)]";
  }
  return "ring-2 ring-[#FFE9B8]/35";
}

function tamanoFotoAmpliada(): { foto: string; medalla: string } {
  return {
    foto: "h-44 w-44 sm:h-52 sm:w-52",
    medalla: "h-9 w-9 text-sm sm:h-10 sm:w-10 sm:text-base",
  };
}

function LigaTurnoMarcoFoto({
  posicion,
  cajeroFotoUrl,
  cajeroNombre,
  variante = "podio",
  esMiTurno = false,
  esCumpleFestivo = false,
}: {
  posicion: number;
  cajeroFotoUrl?: string;
  cajeroNombre?: string;
  variante?: VarianteFoto;
  esMiTurno?: boolean;
  esCumpleFestivo?: boolean;
}) {
  const podio = estilosPodio(posicion);
  const { foto, medalla } = tamanoFoto(variante);
  const fotoSrc = cajeroFotoUrl?.trim() || "";
  const [fotoOk, setFotoOk] = useState(true);
  const [fotoAmpliada, setFotoAmpliada] = useState(false);

  useEffect(() => {
    setFotoOk(true);
    setFotoAmpliada(false);
  }, [fotoSrc]);

  useEffect(() => {
    if (!fotoAmpliada) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFotoAmpliada(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fotoAmpliada]);

  const mostrarFoto = Boolean(fotoSrc) && fotoOk;
  const nombreAlt = cajeroNombre?.trim() || "Cajero en turno";
  const ampliada = tamanoFotoAmpliada();
  const fotoTam = foto;
  const medallaTam = medalla;

  function toggleAmpliada(e: React.MouseEvent<HTMLButtonElement>) {
    if (!mostrarFoto) return;
    e.stopPropagation();
    setFotoAmpliada((v) => !v);
  }

  function renderMarcoPremium(ampliado: boolean) {
    const tam = ampliado ? ampliada.foto : fotoTam;
    return (
      <button
        type="button"
        disabled={!mostrarFoto}
        onClick={toggleAmpliada}
        aria-label={
          mostrarFoto
            ? ampliado
              ? `Reducir foto de ${nombreAlt}`
              : `Ampliar foto de ${nombreAlt}`
            : undefined
        }
        aria-pressed={ampliado}
        className={`group relative block rounded-full border-0 bg-transparent p-0 ${
          mostrarFoto ? "cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FFC81C]/80" : "cursor-default"
        } ${ampliado ? "cursor-zoom-out" : ""}`}
      >
        <div
          className={`relative z-[1] rounded-full bg-[#1a1610] p-0.5 ring-offset-2 ring-offset-[#1a1610] transition-shadow duration-300 ${
            esCumpleFestivo
              ? "ring-[3px] ring-pink-400 shadow-[0_0_24px_rgba(236,72,153,0.55)]"
              : ringMarcoCajero(posicion, esMiTurno)
          } ${ampliado ? "shadow-[0_0_40px_rgba(255,200,28,0.5)] ring-[4px] ring-[#FFD700]" : ""}`}
        >
          <div className={`relative overflow-hidden rounded-full bg-[#2a2318] ${tam}`}>
            {mostrarFoto ? (
              <motion.img
                key={ampliado ? "ampliada" : "normal"}
                src={fotoSrc}
                alt={nombreAlt}
                className="h-full w-full object-cover"
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={() => setFotoOk(false)}
                initial={{ scale: 0.92, opacity: 0.85 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 340, damping: 26 }}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#3d3428] to-[#1a1610] text-[#9A8B74]">
                <User className={variante === "hero" ? "h-8 w-8 sm:h-9 sm:w-9" : "h-6 w-6 sm:h-7 sm:w-7"} aria-hidden />
              </div>
            )}
            {mostrarFoto && !ampliado ? (
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-black/0 opacity-0 transition group-hover:bg-black/25 group-hover:opacity-100">
                <ZoomIn className="h-5 w-5 text-white drop-shadow-md sm:h-6 sm:w-6" aria-hidden />
              </span>
            ) : null}
          </div>
        </div>
      </button>
    );
  }

  function renderMedallaPuesto(ampliado: boolean) {
    const med = ampliado ? ampliada.medalla : medallaTam;
    return (
      <span
        className={`absolute -bottom-0.5 -right-0.5 z-50 flex ${med} items-center justify-center rounded-full border-2 border-[#1a1610] font-black shadow-md ${podio.aroMedalla} ${podio.textoMedalla}`}
        aria-label={`Puesto ${posicion}`}
      >
        {posicion}
      </span>
    );
  }

  const decoracionesFestivas = (
    <>
      {esCumpleFestivo ? (
        <>
          <span
            className="pointer-events-none absolute -inset-3 z-0 rounded-full bg-[conic-gradient(from_0deg,#ec4899,#fbbf24,#a855f7,#ec4899)] opacity-90 motion-safe:animate-liga-cumple-ring"
            aria-hidden
          />
          <span
            className="pointer-events-none absolute -inset-1.5 z-0 rounded-full bg-[#1a1610] motion-safe:animate-liga-cumple-glow"
            aria-hidden
          />
        </>
      ) : null}
      {posicion === 1 && (variante === "hero" || fotoAmpliada) && !esCumpleFestivo ? (
        <span
          className="pointer-events-none absolute -top-3 left-1/2 z-[2] -translate-x-1/2 text-base sm:text-lg"
          aria-hidden
        >
          👑
        </span>
      ) : null}
    </>
  );

  return (
    <>
      {fotoAmpliada ? (
        <button
          type="button"
          className="fixed inset-0 z-[35] cursor-zoom-out bg-black/55 backdrop-blur-[3px]"
          aria-label="Cerrar foto ampliada"
          onClick={() => setFotoAmpliada(false)}
        />
      ) : null}

      <div className={`relative mx-auto w-fit ${fotoAmpliada ? "invisible" : ""}`} aria-hidden={fotoAmpliada}>
        {decoracionesFestivas}
        {renderMarcoPremium(false)}
        {renderMedallaPuesto(false)}
      </div>

      {fotoAmpliada && mostrarFoto ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.88 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.92 }}
          transition={{ type: "spring", stiffness: 320, damping: 28 }}
          className="fixed left-1/2 top-1/2 z-40 w-max max-w-[92vw] -translate-x-1/2 -translate-y-1/2"
        >
          <div className="relative mx-auto w-fit">
            {decoracionesFestivas}
            {renderMarcoPremium(true)}
            {renderMedallaPuesto(true)}
          </div>
          <p className="mt-3 max-w-[16rem] truncate text-center text-sm font-bold text-[#FFF8E8] sm:max-w-xs sm:text-base">
            {nombreAlt}
          </p>
          <p className="mt-1 text-center text-[11px] text-[#C4B49A]">Tocá la foto o fuera para cerrar · Esc</p>
        </motion.div>
      ) : null}
    </>
  );
}

function LigaTurnoTextoCajero({
  fila,
  alineacion = "center",
  esCumpleFestivo = false,
  mostrarEtiquetaPuesto = true,
}: {
  fila: LigaTurnoFila;
  alineacion?: "center" | "left";
  esCumpleFestivo?: boolean;
  mostrarEtiquetaPuesto?: boolean;
}) {
  const nombrePv = fila.puntoVenta?.trim() || fila.nombre;
  const alinear = alineacion === "left" ? "text-left" : "text-center";
  const filaCumple =
    alineacion === "left" ? "flex items-center gap-1" : "flex items-center justify-center gap-1";

  return (
    <div className={`mt-2 w-full min-w-0 ${alinear}`}>
      {mostrarEtiquetaPuesto ? (
        <p className="text-[10px] font-black uppercase tracking-wider text-[#FFC81C] sm:text-[11px]">
          Puesto #{fila.posicion}
        </p>
      ) : null}
      {fila.cajeroNombre ? (
        <p className="line-clamp-2 text-[10px] font-bold leading-tight text-[#FFF8E8] sm:text-[11px]">
          {fila.cajeroNombre}
        </p>
      ) : null}
      {fila.cajeroCumpleanosCorto ? (
        <p
          className={`mt-0.5 ${filaCumple} text-[9px] sm:text-[10px] ${
            esCumpleFestivo ? "font-bold text-pink-200" : "text-[#E8DCC4]"
          }`}
        >
          <Cake className={`h-3 w-3 shrink-0 ${esCumpleFestivo ? "text-pink-300" : "text-[#FFC81C]"}`} aria-hidden />
          <span>{esCumpleFestivo ? "¡Hoy es su cumpleaños!" : fila.cajeroCumpleanosCorto}</span>
        </p>
      ) : null}
      <p className="mt-1.5 line-clamp-2 text-[11px] font-bold leading-snug text-[#FFE9B8] sm:text-xs sm:leading-snug">
        {nombrePv}
      </p>
    </div>
  );
}

function LigaTurnoTarjetaRanking({
  fila,
  title,
  variante = "podio",
  esMiTurno = false,
  esCumpleFestivo = false,
}: {
  fila: LigaTurnoFila;
  title?: string;
  variante?: VarianteFoto;
  esMiTurno?: boolean;
  esCumpleFestivo?: boolean;
}) {
  const podio = estilosPodio(fila.posicion);
  const elevacion =
    variante === "hero"
      ? "-translate-y-1 sm:-translate-y-2"
      : fila.posicion === 2
        ? "sm:-translate-y-0.5"
        : "";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay: (fila.posicion - 1) * 0.05 }}
      title={title}
      className={`relative flex min-w-0 flex-col items-center rounded-2xl border bg-black/25 px-2 py-2.5 sm:px-3 sm:py-3 ${podio.marco} ${elevacion} ${
        esCumpleFestivo
          ? "border-pink-400/60 shadow-[0_0_28px_rgba(236,72,153,0.28)]"
          : esMiTurno
            ? "ring-2 ring-emerald-400/80 ring-offset-2 ring-offset-[#1a1610]"
            : ""
      }`}
    >
      {esMiTurno ? (
        <span className="absolute -top-2 left-1/2 z-[1] -translate-x-1/2 whitespace-nowrap rounded-full border border-emerald-400/60 bg-emerald-500/20 px-2 py-0.5 text-[8px] font-bold uppercase tracking-wide text-emerald-100">
          Tu turno
        </span>
      ) : null}
      {podio.etiqueta && variante !== "compact" ? (
        <span className="mb-1.5 text-[8px] font-bold uppercase tracking-[0.14em] text-[#D4A574] sm:text-[9px]">
          {podio.etiqueta}
        </span>
      ) : null}
      <LigaTurnoBadgePuesto posicion={fila.posicion} variante={variante} className="mb-2" />
      <LigaTurnoMarcoFoto
        posicion={fila.posicion}
        cajeroFotoUrl={fila.cajeroFotoUrl}
        cajeroNombre={fila.cajeroNombre}
        variante={variante}
        esMiTurno={esMiTurno}
        esCumpleFestivo={esCumpleFestivo}
      />
      <LigaTurnoTextoCajero fila={fila} esCumpleFestivo={esCumpleFestivo} mostrarEtiquetaPuesto={false} />
    </motion.div>
  );
}

function LigaTurnoPanelTuPunto({
  fila,
  puesto,
  esCumpleFestivo = false,
}: {
  fila: LigaTurnoFila;
  puesto?: number | null;
  esCumpleFestivo?: boolean;
}) {
  return (
    <div
      className={`flex min-w-0 items-center gap-3 rounded-2xl border px-3 py-2.5 sm:px-4 ${
        esCumpleFestivo
          ? "border-pink-400/55 bg-gradient-to-r from-pink-500/15 to-amber-500/10"
          : "border-dashed border-emerald-400/55 bg-gradient-to-r from-emerald-500/10 to-[#B8860B]/08"
      }`}
      title="Tu punto (fuera del top 6)"
    >
      <LigaTurnoMarcoFoto
        posicion={puesto ?? fila.posicion}
        cajeroFotoUrl={fila.cajeroFotoUrl}
        cajeroNombre={fila.cajeroNombre}
        variante="compact"
        esMiTurno
        esCumpleFestivo={esCumpleFestivo}
      />
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <LigaTurnoBadgePuesto posicion={puesto ?? fila.posicion} variante="compact" />
          <span
            className={`text-[9px] font-bold uppercase tracking-[0.16em] ${
              esCumpleFestivo ? "text-pink-200" : "text-emerald-300/90"
            }`}
          >
            {esCumpleFestivo ? "¡Hoy es tu cumpleaños!" : "Tu punto en la liga"}
          </span>
        </div>
        <LigaTurnoTextoCajero
          fila={fila}
          alineacion="left"
          esCumpleFestivo={esCumpleFestivo}
          mostrarEtiquetaPuesto={false}
        />
      </div>
    </div>
  );
}

/**
 * Liga del turno + frases motivadoras.
 * Proxy POS: GET `/api/pos_turnos_liga` → WMS + fotos desde Firestore (`posCajerosTurno.ficha.fotoUrl`).
 * Respuesta: `ranking[]` con `rank`, `puntoVenta`, `cajeroNombre`, `cajeroFotoUrl`, `cajeroCumpleanosCorto`, `miUid`, `miRank`, etc.
 */
export default function PosLigaTurnoYMotivacion({
  apiBaseUrl: _apiBaseUrl,
  ligaPath: _ligaPathProp,
  puntoVenta,
  getToken,
  pollMs = LIGA_POLL_MS,
  fraseIntervalMs = 10_000,
  mensajeAutor,
  ventaCompletadaTick = 0,
}: Props) {
  const [filas, setFilas] = useState<LigaTurnoFila[]>([]);
  const [meta, setMeta] = useState<MetaLiga>(metaVacio);
  const [mensajeApi, setMensajeApi] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [ocultar, setOcultar] = useState(false);
  const [cargaError, setCargaError] = useState<CargaError>("none");
  const [fraseIdx, setFraseIdx] = useState(0);
  const [fraseCumpleIdx, setFraseCumpleIdx] = useState(0);
  const [ventanaCumpleActiva, setVentanaCumpleActiva] = useState(() => ventanaCumpleanosActivaColombia());
  const [cumplePreview, setCumplePreview] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setCumplePreview(ligaCumplePreviewActivo(window.location.search));
  }, []);

  const urlLiga = useMemo(() => {
    const origin =
      typeof window !== "undefined" && window.location.origin
        ? window.location.origin
        : "http://localhost:3040";
    const u = new URL("/api/pos_turnos_liga", origin);
    const pv = puntoVenta?.trim();
    if (pv) u.searchParams.set("puntoVenta", pv);
    return u.toString();
  }, [puntoVenta]);

  const cargar = useCallback(async () => {
    const token = await getToken();
    if (!token) {
      setCargando(false);
      return;
    }
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await fetch(urlLiga, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        cache: "no-store",
        signal: ac.signal,
      });
      if (res.status === 401 || res.status === 403) {
        setOcultar(true);
        setFilas([]);
        setMeta(metaVacio);
        setMensajeApi(null);
        setCargaError("none");
        return;
      }
      if (res.status === 404) {
        setFilas([]);
        setMeta(metaVacio);
        setMensajeApi(null);
        setCargaError("not_found");
        setOcultar(false);
        return;
      }
      if (!res.ok) {
        setFilas([]);
        setMeta(metaVacio);
        setMensajeApi(null);
        setCargaError("other");
        setOcultar(false);
        return;
      }
      const data: unknown = await res.json().catch(() => null);
      if (data && typeof data === "object") {
        const o = data as Record<string, unknown>;
        if (o.ok === false) {
          setFilas([]);
          setMeta(metaVacio);
          setMensajeApi(typeof o.message === "string" && o.message.trim() ? o.message.trim() : null);
          setCargaError("none");
          setOcultar(false);
          return;
        }
      }
      setMensajeApi(null);
      const rawList = extraerRankingPayload(data);
      const next: LigaTurnoFila[] = [];
      rawList.forEach((item, i) => {
        const row = normalizarFila(item, i);
        if (row) next.push(row);
      });
      next.sort((a, b) => a.posicion - b.posicion);
      setFilas(next);
      setMeta(extraerMetaDesdeRespuesta(data));
      setCargaError("none");
      setOcultar(false);
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      setFilas([]);
      setMeta(metaVacio);
      setMensajeApi(null);
      setCargaError("network");
      setOcultar(false);
    } finally {
      setCargando(false);
    }
  }, [getToken, urlLiga]);

  useEffect(() => {
    void cargar();
    const id = window.setInterval(() => void cargar(), pollMs);
    return () => {
      window.clearInterval(id);
      abortRef.current?.abort();
    };
  }, [cargar, pollMs]);

  useEffect(() => {
    if (!ventaCompletadaTick || ventaCompletadaTick <= 0) return;
    void cargar();
  }, [ventaCompletadaTick, cargar]);

  useEffect(() => {
    const n = FRASES_LIGA_TURNO.length;
    if (n <= 1) return;
    const id = window.setInterval(() => {
      setFraseIdx((i) => (i + 1) % n);
    }, fraseIntervalMs);
    return () => window.clearInterval(id);
  }, [fraseIntervalMs]);

  useEffect(() => {
    const tick = () => setVentanaCumpleActiva(ventanaCumpleanosActivaColombia());
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const n = FRASES_CUMPLE_LIGA.length;
    if (n <= 1 || (!ventanaCumpleActiva && !cumplePreview)) return;
    const id = window.setInterval(() => {
      setFraseCumpleIdx((i) => (i + 1) % n);
    }, 8_000);
    return () => window.clearInterval(id);
  }, [ventanaCumpleActiva, cumplePreview]);

  const ventanaCumpleEfectiva = ventanaCumpleActiva || cumplePreview;

  const filaPreviewCumpleanero = useMemo(() => {
    if (!cumplePreview || filas.length === 0) return undefined;
    return filas.find((f) => f.posicion === 1) ?? filas[0];
  }, [cumplePreview, filas]);

  function esCumpleFestivoFila(f: LigaTurnoFila): boolean {
    if (cumplePreview && filaPreviewCumpleanero && f.posicion === filaPreviewCumpleanero.posicion) {
      return true;
    }
    return filaEsCumpleFestivo(f, ventanaCumpleEfectiva);
  }

  const top6 = useMemo(() => filas.slice(0, TOP_LIGA_SIZE), [filas]);
  const podioFilas = useMemo(() => top6.slice(0, TOP_PODIO_SIZE), [top6]);
  const perseguidores = useMemo(() => top6.slice(TOP_PODIO_SIZE), [top6]);
  const podioVisual = useMemo(() => {
    const map = new Map(podioFilas.map((f) => [f.posicion, f]));
    const visual = ORDEN_PODIO_VISUAL.map((p) => map.get(p)).filter((f): f is LigaTurnoFila => Boolean(f));
    if (visual.length >= podioFilas.length) return visual;
    const vistos = new Set(visual.map((f) => f.posicion));
    return [...visual, ...podioFilas.filter((f) => !vistos.has(f.posicion))];
  }, [podioFilas]);

  const miFilaRanking = useMemo(() => {
    if (meta.miUid) {
      const porUid = filas.find((f) => f.uid === meta.miUid);
      if (porUid) return porUid;
    }
    const pv = puntoVenta?.trim();
    if (pv) {
      const porPunto = filas.find((f) => esFilaDelPuntoActual(f, pv));
      if (porPunto) return porPunto;
    }
    if (meta.miRank != null && meta.miRank > 0) {
      return filas.find((f) => f.posicion === meta.miRank);
    }
    return undefined;
  }, [filas, puntoVenta, meta.miRank, meta.miUid]);

  const muestroPanelTuPunto = Boolean(
    miFilaRanking != null && miFilaRanking.posicion > TOP_LIGA_SIZE && top6.length > 0
  );
  const estoyEnTop6 = Boolean(miFilaRanking && miFilaRanking.posicion <= TOP_LIGA_SIZE);
  const pvTrim = puntoVenta?.trim();

  const cumpleanerosFestivos = useMemo(() => {
    if (!ventanaCumpleEfectiva) return [];
    if (cumplePreview && filaPreviewCumpleanero) {
      return [filaPreviewCumpleanero];
    }
    const vistos = new Set<string>();
    const lista: LigaTurnoFila[] = [];
    for (const f of filas) {
      if (!filaEsCumpleFestivo(f, true)) continue;
      const id = idCajeroParaMuro(f);
      if (!id || vistos.has(id)) continue;
      vistos.add(id);
      lista.push(f);
    }
    return lista;
  }, [filas, ventanaCumpleEfectiva, cumplePreview, filaPreviewCumpleanero]);

  function tituloFila(f: LigaTurnoFila): string | undefined {
    return f.abiertoHoraCorta ? `Abierto ${f.abiertoHoraCorta}` : undefined;
  }

  function renderTarjeta(f: LigaTurnoFila, variante: VarianteFoto) {
    const esMiTurno = esMiFilaRanking(f, pvTrim, meta.miUid);
    const esCumpleFestivo = esCumpleFestivoFila(f);
    return (
      <LigaTurnoTarjetaRanking
        key={f.uid ? `${f.uid}-${f.posicion}` : `${f.posicion}-${f.nombre}`}
        fila={f}
        title={tituloFila(f)}
        variante={variante}
        esMiTurno={esMiTurno}
        esCumpleFestivo={esCumpleFestivo}
      />
    );
  }

  if (ocultar) return null;

  const frase = FRASES_LIGA_TURNO[fraseIdx % FRASES_LIGA_TURNO.length] ?? "";

  const lineaMiPuesto =
    meta.miRank != null
      ? [`Tu puesto: #${meta.miRank}`, meta.miTurnoAbierto === false ? "turno cerrado" : null]
          .filter(Boolean)
          .join(" · ")
      : null;

  return (
    <div className="mb-4 space-y-1.5">
      <p className="px-0.5 text-[11px] leading-snug text-gray-600">
        <span className="font-semibold text-gray-700">Aviso:</span> la liga del turno muestra el{" "}
        <strong>top 6 de puntos de venta a nivel nacional</strong>, ordenados por ventas{" "}
        <strong>en este mismo momento</strong> (datos en vivo sincronizados con el administrativo).
      </p>
      <section
        className="relative overflow-hidden rounded-2xl border border-[#FFE08A]/45 bg-gradient-to-br from-[#1f1a14] via-[#2a2318] to-[#14110d] px-3 py-3 shadow-[0_14px_40px_-16px_rgba(0,0,0,0.55)] sm:px-5 sm:py-4"
        aria-label="Liga del turno y mensaje motivacional"
      >
        <div
          className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-[radial-gradient(circle,rgba(255,200,28,0.18),transparent_70%)]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-20 -left-10 h-36 w-36 rounded-full bg-[radial-gradient(circle,rgba(255,215,0,0.1),transparent_70%)]"
          aria-hidden
        />

        <div className="relative flex flex-wrap items-center justify-between gap-2 border-b border-[#FFE9B8]/15 pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <Sparkles className="h-4 w-4 shrink-0 text-[#FFC81C]" aria-hidden />
            <span className="rounded-full border border-[#FFC81C]/50 bg-[#FFC81C]/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#FFF8E8]">
              Liga del turno
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[#9A8B74]">Top 6 nacional</span>
            {cargando && filas.length === 0 ? (
              <span className="text-[11px] text-[#C4B49A]">Sincronizando…</span>
            ) : null}
          </div>
          <AnimatePresence mode="wait">
            <motion.p
              key={fraseIdx}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.22 }}
              className="max-w-full text-[11px] italic leading-snug text-[#E8DCC4] sm:max-w-md sm:text-right"
            >
              {frase}
            </motion.p>
          </AnimatePresence>
        </div>

        <div className="relative mt-3 min-w-0">
          {cumplePreview ? (
            <p className="mb-3 rounded-xl border border-pink-400/40 bg-pink-500/10 px-3 py-2 text-center text-[11px] leading-snug text-pink-100">
              <strong>Vista previa cumpleaños</strong> (solo desarrollo). Simula festejo en el{" "}
              <strong>#1 del podio</strong> y el poster de mensajes. Quitá{" "}
              <code className="rounded bg-black/30 px-1 text-[10px]">ligaCumplePreview=1</code> de la URL para volver a
              lo normal.
            </p>
          ) : null}
          {top6.length === 0 && !cargando && cargaError === "not_found" ? (
            <p className="text-[11px] text-[#D4A574]">
              El WMS no respondió en esta ruta (404). Confirmá que el endpoint esté desplegado o configurá{" "}
              <span className="font-mono text-[10px] text-[#E8DCC4]">NEXT_PUBLIC_WMS_LIGA_PATH</span> con la ruta real.
            </p>
          ) : null}
          {top6.length === 0 && !cargando && (cargaError === "other" || cargaError === "network") ? (
            <p className="text-[11px] text-[#D4A574]">
              {cargaError === "network"
                ? "No pudimos conectar con el WMS para la liga. Revisá la red o la URL pública."
                : "El WMS devolvió un error al cargar la liga. Reintentando en unos segundos…"}
            </p>
          ) : null}
          {top6.length === 0 && !cargando && cargaError === "none" && mensajeApi ? (
            <p className="text-[11px] text-[#B8A88C]">{mensajeApi}</p>
          ) : null}
          {top6.length === 0 && !cargando && cargaError === "none" && !mensajeApi ? (
            <p className="text-[11px] text-[#B8A88C]">
              Aún no hay datos de ranking para este turno. Si hay turnos abiertos y ventas sincronizadas con el WMS, el
              ranking aparecerá aquí.
            </p>
          ) : null}

          {top6.length > 0 ? (
            <div className="flex min-w-0 flex-col gap-4">
              {podioVisual.length > 0 ? (
                <div>
                  <p className="mb-2 text-center text-[9px] font-bold uppercase tracking-[0.22em] text-[#D4A574]">
                    Podio del turno
                  </p>
                  <div className="grid grid-cols-3 items-end gap-2 sm:gap-4">
                    {podioVisual.map((f) => (
                      <div key={`podio-${f.posicion}`} className="min-w-0">
                        {renderTarjeta(f, f.posicion === 1 ? "hero" : "podio")}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {perseguidores.length > 0 ? (
                <div>
                  <p className="mb-2 text-center text-[9px] font-bold uppercase tracking-[0.22em] text-[#9A8B74]">
                    Persiguiendo el podio · puestos 4 a 6
                  </p>
                  <div className="grid grid-cols-3 gap-2 sm:gap-3">
                    {perseguidores.map((f) => (
                      <div key={`chaser-${f.posicion}`} className="min-w-0">
                        {renderTarjeta(f, "compact")}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="border-t border-[#FFE9B8]/10 pt-3">
                {lineaMiPuesto ? (
                  <p className="text-[11px] font-medium text-[#C4B49A]">
                    {lineaMiPuesto}
                    {estoyEnTop6 ? (
                      <span className="ml-1 text-[#FFC81C]">· ¡Estás en el top 6!</span>
                    ) : null}
                  </p>
                ) : (
                  <span className="text-[10px] text-[#9A8B74]">Ranking en vivo · actualiza cada ~45 s</span>
                )}
              </div>

              {muestroPanelTuPunto && miFilaRanking ? (
                <LigaTurnoPanelTuPunto
                  fila={miFilaRanking}
                  puesto={meta.miRank}
                  esCumpleFestivo={esCumpleFestivoFila(miFilaRanking)}
                />
              ) : null}

              {cumpleanerosFestivos.length > 0 && mensajeAutor?.uid ? (
                <div className="space-y-3 border-t border-pink-300/20 pt-3">
                  <div className="rounded-xl border border-pink-400/35 bg-gradient-to-r from-pink-500/15 via-amber-500/10 to-purple-500/15 px-3 py-2 text-center">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-pink-100">
                      Celebración nacional GEB
                    </p>
                    <AnimatePresence mode="wait">
                      <motion.p
                        key={fraseCumpleIdx}
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 1.02 }}
                        className="mt-1 text-sm font-semibold text-[#FFF8E8]"
                      >
                        {cumpleanerosFestivos.length === 1
                          ? `¡Hoy ${cumpleanerosFestivos[0]!.cajeroNombre ?? cumpleanerosFestivos[0]!.nombre} cumple años! Dejale tu mensaje en el poster.`
                          : `¡Hoy celebramos cumpleaños en la red! Dejales un mensaje en el poster.`}
                      </motion.p>
                    </AnimatePresence>
                  </div>
                  {cumpleanerosFestivos.map((c) => (
                    <LigaCumpleMuroPanel
                      key={idCajeroParaMuro(c)}
                      cumpleanero={c}
                      getToken={getToken}
                      autorUid={mensajeAutor.uid}
                      autorNombre={mensajeAutor.nombre}
                      autorPuntoVenta={mensajeAutor.puntoVenta}
                      fraseIdx={fraseCumpleIdx}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
