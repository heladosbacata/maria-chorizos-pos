"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PlanMillasClienteResumen } from "@/lib/plan-millas-validar-resumen";
import { consultarDocumentoPlanMillasWms } from "@/lib/wms-fidelizacion-consulta-documento";
import {
  CLUB_MILLAS_PORTAL_URL,
  listarPremiosClubMillasWms,
  type PremioClubMillas,
} from "@/lib/wms-club-millas-premios";

function formatPuntos(n: number): string {
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(n);
}

function TarjetaPremio({
  premio,
  puntosCliente,
  registrado,
}: {
  premio: PremioClubMillas;
  puntosCliente: number | undefined;
  registrado: boolean;
}) {
  const puede =
    registrado && typeof puntosCliente === "number" && puntosCliente >= premio.puntosNecesarios;
  const faltan =
    registrado && typeof puntosCliente === "number" && puntosCliente < premio.puntosNecesarios
      ? premio.puntosNecesarios - puntosCliente
      : null;

  return (
    <article
      className={`group relative flex flex-col overflow-hidden rounded-2xl border shadow-lg transition-all ${
        puede
          ? "border-emerald-400/60 bg-gradient-to-b from-slate-900 via-slate-900 to-emerald-950/40 ring-2 ring-emerald-400/30"
          : "border-white/10 bg-gradient-to-b from-slate-900/95 to-slate-950"
      }`}
    >
      {puede ? (
        <span className="absolute right-3 top-3 z-10 rounded-full bg-emerald-500 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-900 shadow">
          Puede reclamar
        </span>
      ) : null}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-slate-800">
        {premio.imagenUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- URL externa Firebase Storage
          <img
            src={premio.imagenUrl}
            alt={premio.titulo}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-amber-500/20 to-emerald-600/20 text-4xl">
            🎁
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 pb-3 pt-8">
          <span className="inline-flex rounded-lg bg-brand-yellow px-2 py-0.5 text-xs font-extrabold tabular-nums text-slate-900">
            {formatPuntos(premio.puntosNecesarios)} pts
          </span>
        </div>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h4 className="text-base font-bold leading-snug text-white">{premio.titulo}</h4>
        <p className="mt-2 line-clamp-3 flex-1 text-xs leading-relaxed text-slate-400">{premio.descripcion}</p>
        {faltan != null ? (
          <p className="mt-3 text-[11px] font-medium text-amber-300/95">
            Le faltan <span className="font-bold tabular-nums">{formatPuntos(faltan)}</span> puntos
          </p>
        ) : !registrado ? (
          <p className="mt-3 text-[11px] text-slate-500">Consultá un cliente afiliado para ver si puede reclamar.</p>
        ) : null}
      </div>
    </article>
  );
}

export default function PlanMillasPosModule() {
  const [documento, setDocumento] = useState("");
  const [consultando, setConsultando] = useState(false);
  const [errorConsulta, setErrorConsulta] = useState<string | null>(null);
  const [noRegistrado, setNoRegistrado] = useState(false);
  const [cliente, setCliente] = useState<PlanMillasClienteResumen | null>(null);
  const [registrado, setRegistrado] = useState(false);

  const [premios, setPremios] = useState<PremioClubMillas[]>([]);
  const [cargandoPremios, setCargandoPremios] = useState(true);
  const [errorPremios, setErrorPremios] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setCargandoPremios(true);
      setErrorPremios(null);
      const r = await listarPremiosClubMillasWms();
      if (cancelled) return;
      if (r.ok) setPremios(r.premios);
      else setErrorPremios(r.message);
      setCargandoPremios(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const consultar = useCallback(async () => {
    setErrorConsulta(null);
    setNoRegistrado(false);
    setCliente(null);
    setRegistrado(false);
    setConsultando(true);
    try {
      const r = await consultarDocumentoPlanMillasWms(documento);
      if (!r.ok) {
        setErrorConsulta(r.message);
        return;
      }
      if (!r.registrado) {
        setNoRegistrado(true);
        return;
      }
      setRegistrado(true);
      setCliente(r.clientePlanMillas ?? { documento: documento.replace(/\D/g, "").trim() || documento.trim() });
    } finally {
      setConsultando(false);
    }
  }, [documento]);

  const puntosCliente = cliente?.millas;
  const premiosReclamables = useMemo(() => {
    if (!registrado || typeof puntosCliente !== "number") return 0;
    return premios.filter((p) => puntosCliente >= p.puntosNecesarios).length;
  }, [premios, puntosCliente, registrado]);

  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-12">
      <header className="relative overflow-hidden rounded-3xl border border-emerald-500/25 bg-gradient-to-br from-slate-900 via-[#0f1419] to-emerald-950/50 p-6 shadow-xl md:p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-emerald-500/15 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-20 left-0 h-48 w-48 rounded-full bg-brand-yellow/10 blur-3xl" aria-hidden />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-emerald-400/90">María Chorizos</p>
            <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-white md:text-3xl">Plan de millas</h2>
            <p className="mt-2 max-w-xl text-sm text-slate-300">
              Consultá puntos acumulados por cédula y mostrá al cliente los premios que puede reclamar en el{" "}
              <a
                href={CLUB_MILLAS_PORTAL_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-brand-yellow underline-offset-2 hover:underline"
              >
                Club de millas
              </a>
              .
            </p>
          </div>
          <a
            href={CLUB_MILLAS_PORTAL_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded-xl border border-emerald-400/40 bg-emerald-500/15 px-4 py-2.5 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/25"
          >
            Abrir portal del club ↗
          </a>
        </div>
      </header>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm md:p-6">
        <h3 className="text-sm font-bold uppercase tracking-wide text-gray-500">Consulta de cliente</h3>
        <p className="mt-1 text-sm text-gray-600">Ingresá el número de cédula o documento del socio.</p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="min-w-0 flex-1">
            <span className="text-xs font-medium text-gray-700">Número de documento</span>
            <input
              type="text"
              inputMode="numeric"
              value={documento}
              onChange={(e) => setDocumento(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void consultar();
              }}
              placeholder="Ej. 1234567890"
              className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              disabled={consultando}
            />
          </label>
          <button
            type="button"
            onClick={() => void consultar()}
            disabled={consultando || documento.trim().length < 3}
            className="rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 px-6 py-3 text-sm font-bold text-white shadow-md hover:from-emerald-700 hover:to-emerald-600 disabled:opacity-50"
          >
            {consultando ? "Consultando…" : "Consultar puntos"}
          </button>
        </div>
        {errorConsulta ? (
          <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900" role="alert">
            {errorConsulta}
          </p>
        ) : null}
        {noRegistrado ? (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <p className="font-semibold">No está en el plan de millas</p>
            <p className="mt-1">
              Invitá al cliente a registrarse en{" "}
              <a href={CLUB_MILLAS_PORTAL_URL} target="_blank" rel="noopener noreferrer" className="font-medium underline">
                club-de-millas
              </a>{" "}
              (app o punto de venta) y volvé a consultar.
            </p>
          </div>
        ) : null}
      </section>

      {registrado && cliente ? (
        <section className="relative overflow-hidden rounded-2xl border border-emerald-400/35 bg-gradient-to-b from-slate-900 to-[#0c0e14] p-6 shadow-xl">
          <div className="pointer-events-none absolute -right-12 top-0 h-40 w-40 rounded-full bg-emerald-500/20 blur-3xl" aria-hidden />
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-400/90">Socio consultado</p>
          {cliente.nombre ? (
            <p className="mt-2 text-2xl font-extrabold text-white">{cliente.nombre}</p>
          ) : null}
          {cliente.documento ? (
            <p className="mt-1 text-sm text-emerald-100/90">
              Documento: <span className="font-mono font-semibold text-white">{cliente.documento}</span>
            </p>
          ) : null}
          <div className="mt-5 flex flex-wrap items-end gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-200/80">Puntos acumulados</p>
              <p className="mt-1 text-4xl font-extrabold tabular-nums text-brand-yellow">
                {typeof puntosCliente === "number" ? formatPuntos(puntosCliente) : "—"}
              </p>
            </div>
            {typeof puntosCliente === "number" && premiosReclamables > 0 ? (
              <p className="rounded-full bg-emerald-500/20 px-4 py-2 text-sm font-semibold text-emerald-200">
                Puede reclamar {premiosReclamables} premio{premiosReclamables === 1 ? "" : "s"}
              </p>
            ) : null}
          </div>
          {typeof puntosCliente !== "number" ? (
            <p className="mt-3 text-xs text-slate-400">
              El WMS no devolvió saldo numérico; igual podés orientar al cliente con el catálogo de premios.
            </p>
          ) : null}
        </section>
      ) : null}

      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Catálogo de premios</h3>
            <p className="text-sm text-gray-600">Premios publicados en el Club de millas · el canje lo realiza el cliente en su plan.</p>
          </div>
        </div>

        {cargandoPremios ? (
          <p className="rounded-xl border border-gray-200 bg-gray-50 py-12 text-center text-sm text-gray-500">
            Cargando premios…
          </p>
        ) : errorPremios ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950" role="alert">
            {errorPremios}
          </p>
        ) : premios.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-300 py-12 text-center text-sm text-gray-500">
            No hay premios activos en el catálogo del club.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {premios.map((p) => (
              <TarjetaPremio
                key={p.id}
                premio={p}
                puntosCliente={puntosCliente}
                registrado={registrado}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
