"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FRASES_LIGA_TURNO } from "@/lib/pos-liga-turno-frases";
import { getWmsLigaPath } from "@/lib/wms-public-base";

export type LigaTurnoFila = {
  posicion: number;
  nombre: string;
  totalVenta: number;
  /** Id. del punto en WMS; sirve para saber si esta fila es el POS abierto. */
  puntoVenta?: string;
  /** 0–100 según WMS (si viene 0–1 se convierte). */
  barPct?: number;
  abiertoHoraCorta?: string;
  uid?: string;
};

type MetaLiga = {
  miRank: number | null;
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
  pollMs?: number;
  fraseIntervalMs?: number;
};

type CargaError = "none" | "not_found" | "other" | "network";

const metaVacio: MetaLiga = { miRank: null, gapAlPrimero: null, miTurnoAbierto: null };

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
  const gapRaw = o.gapAlPrimero ?? o.gap_al_primero;
  const turnoRaw = o.miTurnoAbierto ?? o.mi_turno_abierto;

  const miRank =
    typeof miRankRaw === "number" && Number.isFinite(miRankRaw) ? Math.round(miRankRaw) : null;
  let gapAlPrimero: number | null = null;
  if (typeof gapRaw === "number" && Number.isFinite(gapRaw)) gapAlPrimero = gapRaw;
  else if (typeof gapRaw === "string") {
    const n = Number(gapRaw.replace(/\s/g, "").replace(",", "."));
    if (Number.isFinite(n)) gapAlPrimero = n;
  }
  const miTurnoAbierto = typeof turnoRaw === "boolean" ? turnoRaw : null;

  return { miRank, gapAlPrimero, miTurnoAbierto };
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

function normalizarFila(raw: unknown, idx: number): LigaTurnoFila | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const punto =
    (typeof r.puntoVenta === "string" && r.puntoVenta.trim()) ||
    (typeof r.punto === "string" && r.punto.trim()) ||
    "";
  const nombre =
    (typeof r.nombre === "string" && r.nombre.trim()) ||
    (typeof r.nombreCajero === "string" && r.nombreCajero.trim()) ||
    (typeof r.cajeroNombre === "string" && r.cajeroNombre.trim()) ||
    (typeof r.label === "string" && r.label.trim()) ||
    (typeof r.email === "string" && r.email.trim()) ||
    nombreDesdeCajeroAnidado(r) ||
    punto ||
    etiquetaUid(r.uid) ||
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
  if (!nombre || total < 0) return null;

  const uid = typeof r.uid === "string" ? r.uid : undefined;
  const abiertoHoraCorta =
    typeof r.abiertoHoraCorta === "string" && r.abiertoHoraCorta.trim()
      ? r.abiertoHoraCorta.trim()
      : typeof r.abierto_hora_corta === "string" && r.abierto_hora_corta.trim()
        ? r.abierto_hora_corta.trim()
        : undefined;
  const barPct = normalizarBarPct(r.barPct ?? r.bar_pct);

  return {
    posicion: pos,
    nombre,
    totalVenta: total,
    puntoVenta: punto || undefined,
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

/** Estilos de medalla: 1 oro, 2 plata, 3 bronce. */
function estilosMedalla(pos: number): { aro: string; texto: string } {
  if (pos === 1) {
    return {
      aro: "bg-gradient-to-br from-[#FFD700] via-[#E8C547] to-[#B8860B] shadow-[0_0_10px_rgba(255,215,0,0.35)]",
      texto: "text-[#1a140c]",
    };
  }
  if (pos === 2) {
    return {
      aro: "bg-gradient-to-br from-[#F4F4F5] via-[#D4D4D8] to-[#9CA3AF] shadow-[0_0_8px_rgba(200,200,210,0.25)]",
      texto: "text-[#1a140c]",
    };
  }
  if (pos === 3) {
    return {
      aro: "bg-gradient-to-br from-[#CD7F32] via-[#B87333] to-[#6B4423] shadow-[0_0_8px_rgba(205,127,50,0.3)]",
      texto: "text-[#FFF8E8]",
    };
  }
  return {
    aro: "bg-[#FFC81C]/90",
    texto: "text-[#1a140c]",
  };
}

/**
 * Liga del turno + frases motivadoras.
 * Contrato WMS: GET `{apiBaseUrl}{ligaPath}` con `Authorization: Bearer <Firebase ID token>`.
 * Respuesta típica: `ok`, `ranking[]` (`rank`, `uid`, `puntoVenta`, `totalVenta`, `abiertoHoraCorta`, `barPct`), `miRank`, `gapAlPrimero`, `miTurnoAbierto`.
 */
export default function PosLigaTurnoYMotivacion({
  apiBaseUrl,
  ligaPath: ligaPathProp,
  puntoVenta,
  getToken,
  pollMs = 20_000,
  fraseIntervalMs = 10_000,
}: Props) {
  const base = useMemo(() => stripTrailingSlash(apiBaseUrl.trim()), [apiBaseUrl]);
  const ligaPath = ligaPathProp ?? getWmsLigaPath();
  const [filas, setFilas] = useState<LigaTurnoFila[]>([]);
  const [meta, setMeta] = useState<MetaLiga>(metaVacio);
  const [mensajeApi, setMensajeApi] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [ocultar, setOcultar] = useState(false);
  const [cargaError, setCargaError] = useState<CargaError>("none");
  const [fraseIdx, setFraseIdx] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const urlLiga = useMemo(() => {
    const path = ligaPath.startsWith("/") ? ligaPath : `/${ligaPath}`;
    const u = new URL(path, `${base}/`);
    const pv = puntoVenta?.trim();
    if (pv) u.searchParams.set("puntoVenta", pv);
    return u.toString();
  }, [base, ligaPath, puntoVenta]);

  const cargar = useCallback(async () => {
    if (!base) return;
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
  }, [base, getToken, urlLiga]);

  useEffect(() => {
    void cargar();
    const id = window.setInterval(() => void cargar(), pollMs);
    return () => {
      window.clearInterval(id);
      abortRef.current?.abort();
    };
  }, [cargar, pollMs]);

  useEffect(() => {
    const n = FRASES_LIGA_TURNO.length;
    if (n <= 1) return;
    const id = window.setInterval(() => {
      setFraseIdx((i) => (i + 1) % n);
    }, fraseIntervalMs);
    return () => window.clearInterval(id);
  }, [fraseIntervalMs]);

  const top3 = useMemo(() => filas.slice(0, 3), [filas]);
  const miFilaRanking = useMemo(() => {
    const pv = puntoVenta?.trim();
    if (pv) {
      const porPunto = filas.find((f) => esFilaDelPuntoActual(f, pv));
      if (porPunto) return porPunto;
    }
    if (meta.miRank != null && meta.miRank > 0) {
      return filas.find((f) => f.posicion === meta.miRank);
    }
    return undefined;
  }, [filas, puntoVenta, meta.miRank]);

  const muestroChipFueraTop3 = Boolean(
    miFilaRanking != null && miFilaRanking.posicion > 3 && top3.length > 0
  );
  /** Anclar el chip propio al 3.er lugar; si hay menos de 3 en la lista, al último puesto mostrado. */
  const indiceAnclajeChip = top3.length >= 3 ? 2 : Math.max(0, top3.length - 1);

  if (ocultar) return null;

  const frase = FRASES_LIGA_TURNO[fraseIdx % FRASES_LIGA_TURNO.length] ?? "";

  const lineaMiPuesto =
    meta.miRank != null
      ? [`Tu puesto: #${meta.miRank}`, meta.miTurnoAbierto === false ? "turno cerrado" : null]
          .filter(Boolean)
          .join(" · ")
      : null;

  return (
    <section
      className="mb-4 overflow-hidden rounded-xl border border-[#FFE08A]/40 bg-gradient-to-r from-[#1f1a14] via-[#2a2318] to-[#1a1610] px-3 py-2.5 shadow-[0_10px_28px_-12px_rgba(0,0,0,0.45)] sm:px-4"
      aria-label="Liga del turno y mensaje motivacional"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex shrink-0 items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-[#FFC81C]" aria-hidden />
          <span className="rounded-full border border-[#FFC81C]/50 bg-[#FFC81C]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#FFF8E8]">
            Liga del turno
          </span>
          {cargando && filas.length === 0 ? (
            <span className="text-[11px] text-[#C4B49A]">Sincronizando…</span>
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          {top3.length === 0 && !cargando && cargaError === "not_found" ? (
            <p className="text-[11px] text-[#D4A574]">
              El WMS no respondió en esta ruta (404). Confirmá que el endpoint esté desplegado o configurá{" "}
              <span className="font-mono text-[10px] text-[#E8DCC4]">NEXT_PUBLIC_WMS_LIGA_PATH</span> con la ruta
              real. El monitor de ventas puede estar bien aunque este servicio aún no exista en producción.
            </p>
          ) : null}
          {top3.length === 0 && !cargando && (cargaError === "other" || cargaError === "network") ? (
            <p className="text-[11px] text-[#D4A574]">
              {cargaError === "network"
                ? "No pudimos conectar con el WMS para la liga. Revisá la red o la URL pública."
                : "El WMS devolvió un error al cargar la liga. Reintentando en unos segundos…"}
            </p>
          ) : null}
          {top3.length === 0 && !cargando && cargaError === "none" && mensajeApi ? (
            <p className="text-[11px] text-[#B8A88C]">{mensajeApi}</p>
          ) : null}
          {top3.length === 0 && !cargando && cargaError === "none" && !mensajeApi ? (
            <p className="text-[11px] text-[#B8A88C]">
              Aún no hay datos de ranking para este turno. Si hay turnos abiertos y ventas sincronizadas con el WMS,
              el ranking aparecerá aquí.
            </p>
          ) : null}
          {top3.length > 0 ? (
            <div className="flex min-w-0 flex-col gap-1">
              <ul className="grid min-w-0 grid-cols-3 gap-2">
                {top3.map((f, i) => {
                  const pegarMiAqui = muestroChipFueraTop3 && i === indiceAnclajeChip;
                  const title = [f.abiertoHoraCorta ? `Abierto ${f.abiertoHoraCorta}` : null]
                    .filter(Boolean)
                    .join(" ");
                  const med = estilosMedalla(f.posicion);
                  return (
                    <li
                      key={f.uid ? `${f.uid}-${f.posicion}` : `${f.posicion}-${f.nombre}`}
                      className="flex min-w-0 items-stretch gap-1.5"
                    >
                      <div
                        title={title || undefined}
                        className="flex min-w-0 flex-1 flex-col justify-center gap-1 rounded-lg border border-[#FFE9B8]/20 bg-black/25 px-2 py-1.5"
                      >
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span
                            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-black ${med.aro} ${med.texto}`}
                          >
                            {f.posicion}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[11px] font-semibold leading-tight text-[#FFF8E8]">
                            {f.nombre}
                          </span>
                        </div>
                      </div>
                      {pegarMiAqui && miFilaRanking ? (
                        <div
                          className="flex min-w-0 max-w-[5.5rem] shrink-0 flex-col justify-center rounded-lg border border-dashed border-[#FFC81C]/45 bg-[#FFC81C]/08 px-1.5 py-1 sm:max-w-[7rem]"
                          title="Tu punto (fuera del top 3)"
                        >
                          <span className="text-[8px] font-bold uppercase tracking-wide text-[#D4A574]">
                            Tu punto
                          </span>
                          <span className="line-clamp-2 text-[10px] font-semibold leading-tight text-[#FFF8E8]">
                            {miFilaRanking.nombre}
                          </span>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
              {lineaMiPuesto ? (
                <p className="text-[10px] text-[#9A8B74]">{lineaMiPuesto}</p>
              ) : null}
            </div>
          ) : null}
        </div>

        <AnimatePresence mode="wait">
          <motion.p
            key={fraseIdx}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.22 }}
            className="max-w-full shrink-0 border-t border-[#3d3428] pt-2 text-[11px] italic leading-snug text-[#E8DCC4] sm:max-w-[min(100%,18rem)] sm:border-t-0 sm:pt-0 sm:text-left"
          >
            {frase}
          </motion.p>
        </AnimatePresence>
      </div>
    </section>
  );
}
