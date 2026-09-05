"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ymdColombia } from "@/lib/fecha-colombia";
import {
  INDICE_SATISFACCION_AREAS,
  ESTRELLAS_LABELS,
  MESES_CORTOS_ES,
  DIAS_GRACIA_MES_ANTERIOR,
  areasVacias,
  calcularIndice,
  colorIndice,
  contarAreasCompletas,
  diaDelMesDesdeYmd,
  labelMesYm,
  parseYm,
  totalAreas,
  validarParaGuardar,
  ymAnteriorDe,
  ymDeAnioMes,
  ymDesdeYmd,
  ymsEditablesIndice,
  type AreaCalificacion,
  type AreasCalificacionMap,
  type EstrellasSatisfaccion,
  type IndiceSatisfaccionAreaId,
  type IndiceSatisfaccionMes,
  requiereSeguimientoWms,
} from "@/lib/indice-satisfaccion-franquiciado";
import {
  aniosDisponiblesIndice,
  guardarIndiceSatisfaccionMes,
  leerIndiceSatisfaccionMes,
  listarMesesIndiceSatisfaccion,
} from "@/lib/indice-satisfaccion-franquiciado-storage";
import {
  cargarIndiceSatisfaccionAnioConSync,
  cargarIndiceSatisfaccionMesConSync,
  guardarIndiceSatisfaccionConSync,
} from "@/lib/pos-indice-satisfaccion-cloud";
import { auth } from "@/lib/firebase";

export interface IndiceSatisfaccionFranquiciadoPanelProps {
  puntoVenta: string | null;
  uid: string | null;
  onVolver?: () => void;
}

type ModoVista = "este-mes" | "avance";

async function tokenSesion(): Promise<string | null> {
  try {
    return (await auth?.currentUser?.getIdToken()) ?? null;
  } catch {
    return null;
  }
}

function StarButton({
  value,
  active,
  disabled,
  onSelect,
}: {
  value: EstrellasSatisfaccion;
  active: boolean;
  disabled?: boolean;
  onSelect: (v: EstrellasSatisfaccion) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelect(value)}
      aria-label={`${value} estrella${value === 1 ? "" : "s"} — ${ESTRELLAS_LABELS[value]}`}
      aria-pressed={active}
      className={`h-9 w-9 rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
        active
          ? "bg-amber-100 text-amber-500"
          : "bg-gray-50 text-gray-300 hover:bg-emerald-50 hover:text-emerald-400"
      }`}
    >
      <svg className="mx-auto h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
      </svg>
    </button>
  );
}

function IndiceBadge({ indice }: { indice: number | null }) {
  const tono = colorIndice(indice);
  const cls =
    tono === "verde"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : tono === "ambar"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : tono === "rojo"
          ? "border-red-200 bg-red-50 text-red-800"
          : "border-gray-200 bg-gray-50 text-gray-500";
  return (
    <div className={`inline-flex flex-col items-center rounded-xl border px-4 py-2 ${cls}`}>
      <span className="text-[10px] font-semibold uppercase tracking-wide opacity-80">Índice del mes</span>
      <span className="text-2xl font-bold tabular-nums">{indice != null ? indice.toFixed(1) : "—"}</span>
      <span className="text-[11px] opacity-80">de 5.0</span>
    </div>
  );
}

function IconoOjo({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
      />
    </svg>
  );
}

function BotonOjoSeguimientoWms({
  respondida,
  onClick,
}: {
  respondida: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={
        respondida
          ? "Ver respuesta de administración (WMS)"
          : "Seguimiento WMS: pendiente de respuesta de administración"
      }
      aria-label={
        respondida ? "Ver respuesta de administración" : "Ver seguimiento WMS pendiente"
      }
      className={`inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border transition-colors ${
        respondida
          ? "border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100"
          : "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
      }`}
    >
      <IconoOjo />
    </button>
  );
}

function ModalSeguimientoWms({
  areaLabel,
  cal,
  onCerrar,
}: {
  areaLabel: string;
  cal: AreaCalificacion;
  onCerrar: () => void;
}) {
  const respondida = cal.respuestaWms?.estado === "respondida" && Boolean(cal.respuestaWms.texto.trim());
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" role="dialog" aria-modal>
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Cerrar" onClick={onCerrar} />
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl">
        <div className="flex items-start gap-3 border-b border-amber-100 bg-amber-50 px-4 py-3">
          <span className="mt-0.5 text-amber-700">
            <IconoOjo className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wide text-amber-800">Seguimiento WMS</p>
            <h3 className="text-base font-bold text-gray-900">{areaLabel}</h3>
            <p className="text-xs text-gray-600">
              Calificación: {cal.estrellas}★ · Las notas de 3 o menos las revisa administración
            </p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            className="rounded-lg p-1 text-gray-500 hover:bg-white hover:text-gray-800"
            aria-label="Cerrar"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="space-y-3 px-4 py-4">
          {cal.observacion ? (
            <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Su observación</p>
              <p className="mt-1 text-sm text-gray-800">{cal.observacion}</p>
            </div>
          ) : null}

          {respondida ? (
            <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-800">Respuesta de administración</p>
              <p className="mt-1 text-sm text-sky-950">{cal.respuestaWms?.texto}</p>
              {cal.respuestaWms?.respondidoPorNombre || cal.respuestaWms?.respondidoAt ? (
                <p className="mt-2 text-xs text-sky-700">
                  {cal.respuestaWms.respondidoPorNombre
                    ? `${cal.respuestaWms.respondidoPorNombre} · `
                    : ""}
                  {cal.respuestaWms.respondidoAt
                    ? new Date(cal.respuestaWms.respondidoAt).toLocaleString("es-CO", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })
                    : ""}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50/80 px-3 py-3">
              <p className="text-sm font-semibold text-amber-950">Pendiente de respuesta</p>
              <p className="mt-1 text-sm leading-relaxed text-amber-900/90">
                Esta calificación quedó marcada para que un administrador la responda desde el WMS. La opción ya
                está habilitada en el POS; el enlace con WMS se completará en una próxima etapa.
              </p>
            </div>
          )}
        </div>
        <div className="border-t border-gray-100 px-4 py-3">
          <button
            type="button"
            onClick={onCerrar}
            className="w-full rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}

function AreaCard({
  areaId,
  label,
  pregunta,
  cal,
  disabled,
  highlightError,
  onChange,
  onVerSeguimientoWms,
}: {
  areaId: IndiceSatisfaccionAreaId;
  label: string;
  pregunta: string;
  cal: AreaCalificacion;
  disabled?: boolean;
  highlightError?: boolean;
  onChange: (next: AreaCalificacion) => void;
  onVerSeguimientoWms?: () => void;
}) {
  const necesitaObs = cal.estrellas >= 1 && cal.estrellas <= 3;
  const muestraOjo = requiereSeguimientoWms(cal.estrellas);
  const respondida = cal.respuestaWms?.estado === "respondida";
  return (
    <article
      id={`isf-area-${areaId}`}
      className={`rounded-xl border bg-white p-4 shadow-sm transition-colors ${
        highlightError ? "border-red-400 ring-1 ring-red-200" : "border-emerald-100"
      }`}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-gray-900">{label}</h3>
          <p className="mt-0.5 text-xs leading-snug text-gray-500">{pregunta}</p>
        </div>
        {muestraOjo && onVerSeguimientoWms ? (
          <BotonOjoSeguimientoWms respondida={Boolean(respondida && cal.respuestaWms?.texto)} onClick={onVerSeguimientoWms} />
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1">
        {([1, 2, 3, 4, 5] as EstrellasSatisfaccion[]).map((v) => (
          <StarButton
            key={v}
            value={v}
            active={cal.estrellas >= v && cal.estrellas > 0}
            disabled={disabled}
            onSelect={(estrellas) =>
              onChange({
                ...cal,
                estrellas,
                respuestaWms: requiereSeguimientoWms(estrellas)
                  ? cal.respuestaWms?.estado === "respondida"
                    ? cal.respuestaWms
                    : { texto: "", respondidoAt: null, respondidoPorNombre: "", estado: "pendiente" }
                  : null,
              })
            }
          />
        ))}
        {cal.estrellas > 0 ? (
          <span className="ml-2 text-xs font-medium text-emerald-700">{ESTRELLAS_LABELS[cal.estrellas]}</span>
        ) : (
          <span className="ml-2 text-xs text-gray-400">Sin calificar</span>
        )}
      </div>
      {muestraOjo ? (
        <p className="mt-2 text-[11px] font-medium text-amber-800">
          ≤3★ · Visible para respuesta de administración (WMS)
        </p>
      ) : null}
      <label className="mt-3 block">
        <span className="text-[11px] font-medium text-gray-600">
          Observación{necesitaObs ? " (obligatoria)" : " (opcional)"}
        </span>
        <textarea
          value={cal.observacion}
          disabled={disabled}
          rows={2}
          maxLength={800}
          placeholder={
            necesitaObs
              ? "Cuéntenos qué mejoraríamos en esta área…"
              : "Si quiere, deje un comentario breve…"
          }
          onChange={(e) => onChange({ ...cal, observacion: e.target.value })}
          className="mt-1 w-full resize-y rounded-lg border border-gray-200 bg-gray-50/80 px-3 py-2 text-sm text-gray-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 disabled:opacity-70"
        />
      </label>
    </article>
  );
}

export default function IndiceSatisfaccionFranquiciadoPanel({
  puntoVenta,
  onVolver,
}: IndiceSatisfaccionFranquiciadoPanelProps) {
  const pv = (puntoVenta ?? "").replace(/\u00a0/g, " ").trim();
  const hoyYmd = ymdColombia();
  const ymActual = ymDesdeYmd(hoyYmd);
  const anioActual = parseYm(ymActual)?.anio ?? new Date().getFullYear();
  const ymsEditables = useMemo(() => ymsEditablesIndice(hoyYmd), [hoyYmd]);
  const ymAnterior = ymAnteriorDe(ymActual);
  const enVentanaMesAnterior =
    ymsEditables.length > 1 && ymsEditables.includes(ymAnterior);
  const diaHoy = diaDelMesDesdeYmd(hoyYmd);

  const [modo, setModo] = useState<ModoVista>("este-mes");
  const [ymEdicion, setYmEdicion] = useState(() => ymsEditablesIndice(ymdColombia())[0] ?? ymDesdeYmd(ymdColombia()));
  const [areas, setAreas] = useState<AreasCalificacionMap>(() => areasVacias());
  const [registroGuardado, setRegistroGuardado] = useState<IndiceSatisfaccionMes | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [msgError, setMsgError] = useState<string | null>(null);
  const [errorAreaId, setErrorAreaId] = useState<IndiceSatisfaccionAreaId | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [avisoSync, setAvisoSync] = useState<string | null>(null);
  const [porYmCache, setPorYmCache] = useState<Record<string, IndiceSatisfaccionMes>>({});
  const [ymsTodos, setYmsTodos] = useState<string[]>([]);

  const [anioAvance, setAnioAvance] = useState(anioActual);
  const [mesAvance, setMesAvance] = useState(() => parseYm(ymActual)?.mes ?? 1);
  const [tick, setTick] = useState(0);
  const [seguimientoModal, setSeguimientoModal] = useState<{
    areaId: IndiceSatisfaccionAreaId;
    label: string;
    cal: AreaCalificacion;
  } | null>(null);

  useEffect(() => {
    if (!ymsEditables.includes(ymEdicion)) {
      setYmEdicion(ymsEditables[0] ?? ymActual);
    }
  }, [ymsEditables, ymEdicion, ymActual]);

  const aplicarRegistro = useCallback((reg: IndiceSatisfaccionMes) => {
    setAreas(reg.areas);
    setRegistroGuardado(reg.guardadoAt ? reg : null);
  }, []);

  const cargarMesEdicion = useCallback(async () => {
    if (!pv || !ymEdicion) {
      setAreas(areasVacias());
      setRegistroGuardado(null);
      return;
    }
    setSincronizando(true);
    try {
      const token = await tokenSesion();
      const r = await cargarIndiceSatisfaccionMesConSync({ token, puntoVenta: pv, ym: ymEdicion });
      aplicarRegistro(r.registro);
      if (r.fuente === "nube" || r.fuente === "ambos") {
        setAvisoSync("Histórico sincronizado con la nube.");
      } else if (r.message) {
        setAvisoSync(r.message);
      } else {
        setAvisoSync(token ? null : "Sin sesión: solo datos de este equipo.");
      }
    } finally {
      setSincronizando(false);
    }
  }, [aplicarRegistro, pv, ymEdicion]);

  useEffect(() => {
    void cargarMesEdicion();
  }, [cargarMesEdicion, tick]);

  const refrescarAnio = useCallback(async (anio: number) => {
    if (!pv) {
      setPorYmCache({});
      setYmsTodos([]);
      return;
    }
    setSincronizando(true);
    try {
      const token = await tokenSesion();
      const r = await cargarIndiceSatisfaccionAnioConSync({ token, puntoVenta: pv, anio });
      setPorYmCache(r.porYm);
      setYmsTodos([...new Set([...listarMesesIndiceSatisfaccion(pv), ...r.yms])].sort());
      if (r.message) setAvisoSync(r.message);
    } finally {
      setSincronizando(false);
    }
  }, [pv]);

  useEffect(() => {
    if (modo !== "avance") return;
    void refrescarAnio(anioAvance);
  }, [modo, anioAvance, refrescarAnio, tick]);

  const completas = contarAreasCompletas(areas);
  const total = totalAreas();
  const indicePreview = calcularIndice(areas);
  const yaGuardado = Boolean(registroGuardado?.guardadoAt);
  const esMesAnteriorEdicion = ymEdicion === ymAnterior && ymEdicion !== ymActual;

  const actualizarArea = useCallback((id: IndiceSatisfaccionAreaId, next: AreaCalificacion) => {
    setAreas((prev) => ({ ...prev, [id]: next }));
    setMsg(null);
    setMsgError(null);
    setErrorAreaId(null);
  }, []);

  const onGuardar = useCallback(async () => {
    if (!pv) {
      setMsgError("No hay punto de venta activo.");
      return;
    }
    if (!ymsEditables.includes(ymEdicion)) {
      setMsgError(
        `Solo puede calificar el mes en curso, o el mes anterior hasta el día ${DIAS_GRACIA_MES_ANTERIOR} del mes actual.`
      );
      return;
    }
    const err = validarParaGuardar(areas);
    if (err) {
      if (err.tipo === "incompleto") {
        setMsgError(`Faltan ${err.faltan.length} área(s) por calificar. Complete las ${total} para guardar el mes.`);
        setErrorAreaId(err.faltan[0] ?? null);
        const el = document.getElementById(`isf-area-${err.faltan[0]}`);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
      } else {
        setMsgError(err.mensaje);
        setErrorAreaId(err.areaId);
        document.getElementById(`isf-area-${err.areaId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }
    setGuardando(true);
    try {
      const token = await tokenSesion();
      const r = await guardarIndiceSatisfaccionConSync({
        token,
        puntoVenta: pv,
        ym: ymEdicion,
        areas,
        guardarLocal: guardarIndiceSatisfaccionMes,
      });
      setRegistroGuardado(r.registro);
      setAreas(r.registro.areas);
      if (r.fuente === "ambos") {
        setMsg(
          `Listo. Índice de ${labelMesYm(ymEdicion)}: ${r.registro.indice?.toFixed(1) ?? "—"} / 5 · guardado en este equipo y en la nube.`
        );
        setAvisoSync(null);
      } else {
        setMsg(
          `Listo. Índice de ${labelMesYm(ymEdicion)}: ${r.registro.indice?.toFixed(1) ?? "—"} / 5 · guardado en este equipo.`
        );
        if (r.message) setAvisoSync(r.message);
      }
      setMsgError(null);
      setTick((t) => t + 1);
    } finally {
      setGuardando(false);
    }
  }, [areas, pv, total, ymEdicion, ymsEditables]);

  const anios = useMemo(
    () => (pv ? aniosDisponiblesIndice(pv, anioActual, ymsTodos) : [anioActual]),
    [pv, anioActual, ymsTodos, tick]
  );

  const mesesConDato = useMemo(() => {
    if (!pv) return new Set<string>();
    return new Set([...listarMesesIndiceSatisfaccion(pv), ...ymsTodos, ...Object.keys(porYmCache)]);
  }, [pv, tick, ymsTodos, porYmCache]);

  const ymSeleccionadoAvance = ymDeAnioMes(anioAvance, mesAvance);
  const registroAvance = useMemo(() => {
    if (!pv) return registroMesVacioSafe(ymSeleccionadoAvance);
    return (
      porYmCache[ymSeleccionadoAvance] ??
      leerIndiceSatisfaccionMes(pv, ymSeleccionadoAvance)
    );
  }, [pv, ymSeleccionadoAvance, porYmCache, tick]);

  const serieAnio = useMemo(() => {
    const out: { mes: number; ym: string; indice: number | null }[] = [];
    for (let m = 1; m <= 12; m++) {
      const ym = ymDeAnioMes(anioAvance, m);
      if (!pv || !mesesConDato.has(ym)) {
        out.push({ mes: m, ym, indice: null });
        continue;
      }
      const r = porYmCache[ym] ?? leerIndiceSatisfaccionMes(pv, ym);
      out.push({ mes: m, ym, indice: r.indice });
    }
    return out;
  }, [anioAvance, mesesConDato, pv, porYmCache, tick]);

  const mejorYPeor = useMemo(() => {
    if (!registroAvance.guardadoAt) return null;
    let mejor: { id: IndiceSatisfaccionAreaId; label: string; e: number } | null = null;
    let peor: { id: IndiceSatisfaccionAreaId; label: string; e: number } | null = null;
    for (const a of INDICE_SATISFACCION_AREAS) {
      const e = registroAvance.areas[a.id]?.estrellas ?? 0;
      if (e < 1) continue;
      if (!mejor || e > mejor.e) mejor = { id: a.id, label: a.label, e };
      if (!peor || e < peor.e) peor = { id: a.id, label: a.label, e };
    }
    return { mejor, peor };
  }, [registroAvance]);

  const indiceAnterior = useMemo(() => {
    const p = parseYm(ymSeleccionadoAvance);
    if (!p || !pv) return null;
    let mes = p.mes - 1;
    let anio = p.anio;
    if (mes < 1) {
      mes = 12;
      anio -= 1;
    }
    const prevYm = ymDeAnioMes(anio, mes);
    if (!mesesConDato.has(prevYm)) return null;
    const r = porYmCache[prevYm] ?? leerIndiceSatisfaccionMes(pv, prevYm);
    return r.indice;
  }, [ymSeleccionadoAvance, pv, mesesConDato, porYmCache, tick]);

  return (
    <div className="mx-auto max-w-3xl">
      {onVolver ? (
        <button
          type="button"
          onClick={onVolver}
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Volver
        </button>
      ) : null}

      <header className="overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-500 to-teal-600 px-5 py-4 text-white shadow-sm">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-100">Espacio franquiciado</p>
        <h2 className="mt-1 text-xl font-bold leading-tight sm:text-2xl">
          Índice de satisfacción al Franquiciado
        </h2>
        <p className="mt-1 text-sm text-white/90">
          {pv ? (
            <>
              Punto: <strong className="font-semibold">{pv}</strong>
              {enVentanaMesAnterior
                ? ` · Puede calificar ${labelMesYm(ymAnterior)} hasta el día ${DIAS_GRACIA_MES_ANTERIOR}`
                : ` · Check-in de ${labelMesYm(ymActual)}`}
            </>
          ) : (
            "Active un punto de venta para registrar su satisfacción."
          )}
        </p>
      </header>

      <div className="mt-4 flex gap-2 rounded-xl border border-gray-200 bg-gray-50 p-1">
        <button
          type="button"
          onClick={() => setModo("este-mes")}
          className={`flex-1 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${
            modo === "este-mes" ? "bg-white text-emerald-800 shadow-sm" : "text-gray-600 hover:text-gray-900"
          }`}
        >
          Este mes
        </button>
        <button
          type="button"
          onClick={() => setModo("avance")}
          className={`flex-1 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${
            modo === "avance" ? "bg-white text-emerald-800 shadow-sm" : "text-gray-600 hover:text-gray-900"
          }`}
        >
          Mi avance
        </button>
      </div>

      {(sincronizando || avisoSync) && (
        <p className="mt-3 text-xs text-gray-500">
          {sincronizando ? "Sincronizando con la nube…" : avisoSync}
        </p>
      )}

      {modo === "este-mes" ? (
        <div className="mt-5 space-y-4">
          {ymsEditables.length > 1 ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Mes a calificar</p>
              <div className="flex flex-wrap gap-2">
                {ymsEditables.map((ym) => {
                  const esAnt = ym === ymAnterior && ym !== ymActual;
                  const activo = ymEdicion === ym;
                  return (
                    <button
                      key={ym}
                      type="button"
                      onClick={() => {
                        setYmEdicion(ym);
                        setMsg(null);
                        setMsgError(null);
                        setErrorAreaId(null);
                      }}
                      className={`rounded-xl px-3 py-2 text-left text-sm font-semibold transition-colors ${
                        activo
                          ? "bg-emerald-600 text-white shadow-sm"
                          : "border border-emerald-200 bg-white text-emerald-900 hover:bg-emerald-50"
                      }`}
                    >
                      <span className="block">{labelMesYm(ym)}</span>
                      <span className={`block text-[11px] font-medium ${activo ? "text-emerald-100" : "text-gray-500"}`}>
                        {esAnt
                          ? `Mes anterior · disponible hasta el día ${DIAS_GRACIA_MES_ANTERIOR}`
                          : "Mes en curso"}
                      </span>
                    </button>
                  );
                })}
              </div>
              {esMesAnteriorEdicion ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                  Está calificando el <strong>mes anterior</strong>. Hoy es día {diaHoy}; esta opción cierra el día{" "}
                  {DIAS_GRACIA_MES_ANTERIOR}.
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-100 bg-emerald-50/60 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-gray-900">{labelMesYm(ymEdicion)}</p>
              <p className="text-xs text-gray-600">
                Completó {completas} de {total} áreas
                {yaGuardado ? " · Ya tiene registro guardado (puede actualizarlo)" : ""}
              </p>
              <div className="mt-2 h-2 w-48 max-w-full overflow-hidden rounded-full bg-white">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${Math.round((completas / total) * 100)}%` }}
                />
              </div>
            </div>
            <IndiceBadge indice={yaGuardado ? registroGuardado?.indice ?? indicePreview : indicePreview} />
          </div>

          {!pv ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              No hay punto de venta activo en esta sesión.
            </p>
          ) : (
            <div className="space-y-3">
              {INDICE_SATISFACCION_AREAS.map((a) => (
                <AreaCard
                  key={a.id}
                  areaId={a.id}
                  label={a.label}
                  pregunta={a.pregunta}
                  cal={areas[a.id]}
                  highlightError={errorAreaId === a.id}
                  onChange={(next) => actualizarArea(a.id, next)}
                  onVerSeguimientoWms={() =>
                    setSeguimientoModal({ areaId: a.id, label: a.label, cal: areas[a.id] })
                  }
                />
              ))}
            </div>
          )}

          {msgError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
              {msgError}
            </p>
          ) : null}
          {msg ? (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              {msg}
            </p>
          ) : null}

          <div className="sticky bottom-2 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200 bg-white/95 p-3 shadow-lg backdrop-blur">
            <button
              type="button"
              disabled={!pv || guardando}
              onClick={() => void onGuardar()}
              className="inline-flex flex-1 items-center justify-center rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none sm:min-w-[12rem]"
            >
              {guardando ? "Guardando…" : yaGuardado ? "Actualizar mes" : "Guardar mes"}
            </button>
            <div
              role="note"
              className="flex w-full flex-1 items-start gap-3 rounded-xl border-2 border-red-400 bg-red-50 px-4 py-3 text-red-900 shadow-sm sm:min-w-[16rem]"
            >
              <span className="flex-shrink-0 text-red-600" aria-hidden>
                <svg className="h-9 w-9" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v3.75m0 3.75h.008v.008H12V16.5zm-7.794 3.75h15.588c1.54 0 2.502-1.667 1.732-3L13.732 4.75c-.77-1.333-2.694-1.333-3.464 0L2.474 17.25c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </span>
              <p className="min-w-0 text-sm font-semibold leading-snug sm:text-base">
                <span className="block text-[11px] font-bold uppercase tracking-wide text-red-700">Advertencia</span>
                Si pone 1 a 3 estrellas, la observación es obligatoria. Se guarda en este equipo y se sincroniza a la
                nube para no perder el histórico.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-5 space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Año</span>
            {anios.map((y) => (
              <button
                key={y}
                type="button"
                onClick={() => setAnioAvance(y)}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                  anioAvance === y
                    ? "bg-emerald-600 text-white"
                    : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                }`}
              >
                {y}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {MESES_CORTOS_ES.map((nombre, i) => {
              const mes = i + 1;
              const ym = ymDeAnioMes(anioAvance, mes);
              const tiene = mesesConDato.has(ym);
              const activo = mesAvance === mes;
              return (
                <button
                  key={ym}
                  type="button"
                  onClick={() => setMesAvance(mes)}
                  className={`min-w-[3rem] rounded-lg px-2 py-2 text-center text-xs font-semibold transition-colors ${
                    activo
                      ? "bg-emerald-600 text-white shadow-sm"
                      : tiene
                        ? "border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                        : "border border-gray-100 bg-gray-50 text-gray-400 hover:bg-gray-100"
                  }`}
                  title={tiene ? `Índice guardado · ${labelMesYm(ym)}` : `Sin registro · ${labelMesYm(ym)}`}
                >
                  {nombre}
                </button>
              );
            })}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Tendencia {anioAvance}</p>
            <div className="mt-3 flex h-28 items-end gap-1.5">
              {serieAnio.map((s) => {
                const h = s.indice != null ? Math.max(8, (s.indice / 5) * 100) : 4;
                const tono = colorIndice(s.indice);
                const bar =
                  tono === "verde"
                    ? "bg-emerald-500"
                    : tono === "ambar"
                      ? "bg-amber-400"
                      : tono === "rojo"
                        ? "bg-red-400"
                        : "bg-gray-200";
                return (
                  <button
                    key={s.ym}
                    type="button"
                    onClick={() => setMesAvance(s.mes)}
                    className="flex min-w-0 flex-1 flex-col items-center gap-1"
                    title={s.indice != null ? `${labelMesYm(s.ym)}: ${s.indice.toFixed(1)}` : labelMesYm(s.ym)}
                  >
                    <div className="flex h-24 w-full items-end justify-center">
                      <div className={`w-full max-w-[1.25rem] rounded-t-md ${bar}`} style={{ height: `${h}%` }} />
                    </div>
                    <span className="text-[9px] font-medium text-gray-500">{MESES_CORTOS_ES[s.mes - 1]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-emerald-100 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-gray-900">{labelMesYm(ymSeleccionadoAvance)}</h3>
                {registroAvance.guardadoAt ? (
                  <p className="text-xs text-gray-500">
                    Guardado el{" "}
                    {new Date(registroAvance.guardadoAt).toLocaleString("es-CO", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                ) : (
                  <p className="text-sm text-gray-500">Sin registro en este mes.</p>
                )}
                {registroAvance.indice != null && indiceAnterior != null ? (
                  <p className="mt-1 text-sm text-gray-700">
                    vs mes anterior:{" "}
                    <strong
                      className={
                        registroAvance.indice >= indiceAnterior ? "text-emerald-700" : "text-amber-700"
                      }
                    >
                      {registroAvance.indice >= indiceAnterior ? "subió" : "bajó"}{" "}
                      {Math.abs(registroAvance.indice - indiceAnterior).toFixed(1)}
                    </strong>
                  </p>
                ) : null}
              </div>
              <IndiceBadge indice={registroAvance.indice} />
            </div>

            {mejorYPeor?.mejor && mejorYPeor?.peor ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <p className="rounded-lg border border-emerald-100 bg-emerald-50/80 px-3 py-2 text-xs text-emerald-900">
                  Mejor área: <strong>{mejorYPeor.mejor.label}</strong> ({mejorYPeor.mejor.e}★)
                </p>
                <p className="rounded-lg border border-amber-100 bg-amber-50/80 px-3 py-2 text-xs text-amber-950">
                  Área a mejorar: <strong>{mejorYPeor.peor.label}</strong> ({mejorYPeor.peor.e}★)
                </p>
              </div>
            ) : null}

            {registroAvance.guardadoAt ? (
              <ul className="mt-4 space-y-2">
                {INDICE_SATISFACCION_AREAS.map((a) => {
                  const cal = registroAvance.areas[a.id];
                  const conOjo = requiereSeguimientoWms(cal.estrellas);
                  return (
                    <li
                      key={a.id}
                      className="flex flex-col gap-2 rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2 sm:flex-row sm:items-start sm:justify-between"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900">{a.label}</p>
                        {cal.observacion ? (
                          <p className="mt-0.5 text-xs text-gray-600">{cal.observacion}</p>
                        ) : null}
                        {conOjo ? (
                          <p className="mt-1 text-[11px] font-medium text-amber-800">
                            {cal.respuestaWms?.estado === "respondida"
                              ? "Administración ya respondió (WMS)"
                              : "Pendiente de respuesta WMS"}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-2">
                        {conOjo ? (
                          <BotonOjoSeguimientoWms
                            respondida={
                              cal.respuestaWms?.estado === "respondida" && Boolean(cal.respuestaWms.texto.trim())
                            }
                            onClick={() =>
                              setSeguimientoModal({ areaId: a.id, label: a.label, cal })
                            }
                          />
                        ) : null}
                        <p className="text-sm font-semibold tabular-nums text-amber-600">
                          {cal.estrellas > 0 ? `${"★".repeat(cal.estrellas)}${"☆".repeat(5 - cal.estrellas)}` : "—"}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : ymsEditables.includes(ymSeleccionadoAvance) ? (
              <button
                type="button"
                onClick={() => {
                  setYmEdicion(ymSeleccionadoAvance);
                  setModo("este-mes");
                }}
                className="mt-4 text-sm font-semibold text-emerald-700 hover:underline"
              >
                Ir a calificar {labelMesYm(ymSeleccionadoAvance)} →
              </button>
            ) : null}
          </div>
        </div>
      )}

      {seguimientoModal ? (
        <ModalSeguimientoWms
          areaLabel={seguimientoModal.label}
          cal={seguimientoModal.cal}
          onCerrar={() => setSeguimientoModal(null)}
        />
      ) : null}
    </div>
  );
}

function registroMesVacioSafe(ym: string): IndiceSatisfaccionMes {
  return {
    ym,
    areas: areasVacias(),
    guardadoAt: null,
    indice: null,
    seguimientoWmsAreaIds: [],
  };
}
