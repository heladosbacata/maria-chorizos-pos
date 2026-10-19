"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ymdColombia } from "@/lib/fecha-colombia";
import { formatPesosCop } from "@/lib/pesos-cop-input";
import {
  EVENT_PLAN_BONOS_HISTORIAL,
  etiquetaQuincenaDesdeId,
  listarHistorialBonosArtesanos,
  marcarBonoArtesanosCancelado,
  type HistorialBonoArtesanos,
} from "@/lib/plan-bonos-artesanos";

type Props = {
  puntoVenta: string | null;
  onVolver?: () => void;
};

function dinero(n: number): string {
  return `$${formatPesosCop(n, false)}`;
}

function tonoBadge(tono: HistorialBonoArtesanos["tono"]): string {
  if (tono === "oro") return "bg-amber-100 text-amber-900 border-amber-300";
  if (tono === "plata") return "bg-slate-100 text-slate-800 border-slate-300";
  return "bg-orange-100 text-orange-900 border-orange-300";
}

export default function BonosArtesanosFranquiciaPanel({ puntoVenta, onVolver }: Props) {
  const pv = puntoVenta?.trim() || "";
  const [items, setItems] = useState<HistorialBonoArtesanos[]>([]);
  const [filtro, setFiltro] = useState<"todos" | "pendientes" | "cancelados">("todos");

  const refresh = useCallback(() => {
    setItems(listarHistorialBonosArtesanos(pv));
  }, [pv]);

  useEffect(() => {
    refresh();
    const onEvt = (e: Event) => {
      const detail = (e as CustomEvent<{ puntoVenta?: string }>).detail;
      if (detail?.puntoVenta && pv && detail.puntoVenta.trim() !== pv) return;
      refresh();
    };
    window.addEventListener(EVENT_PLAN_BONOS_HISTORIAL, onEvt);
    window.addEventListener("storage", onEvt);
    return () => {
      window.removeEventListener(EVENT_PLAN_BONOS_HISTORIAL, onEvt);
      window.removeEventListener("storage", onEvt);
    };
  }, [pv, refresh]);

  const visibles = useMemo(() => {
    if (filtro === "pendientes") return items.filter((it) => !it.cancelado);
    if (filtro === "cancelados") return items.filter((it) => it.cancelado);
    return items;
  }, [filtro, items]);

  const porArtesano = useMemo(() => {
    const map = new Map<string, HistorialBonoArtesanos[]>();
    for (const it of visibles) {
      const nombre = it.artesanoNombre?.trim() || "Artesano del turno";
      const list = map.get(nombre) ?? [];
      list.push(it);
      map.set(nombre, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "es"));
  }, [visibles]);

  const totalPendiente = useMemo(
    () => items.filter((it) => !it.cancelado).reduce((s, it) => s + it.bonoCOP, 0),
    [items]
  );
  const totalCancelado = useMemo(
    () => items.filter((it) => it.cancelado).reduce((s, it) => s + it.bonoCOP, 0),
    [items]
  );

  const toggleCancelado = (bono: HistorialBonoArtesanos) => {
    const next = marcarBonoArtesanosCancelado(pv, bono.id, !bono.cancelado, ymdColombia());
    setItems(next);
  };

  return (
    <div className="flex h-full min-h-[28rem] flex-col">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-amber-100 pb-3">
        <div>
          {onVolver ? (
            <button
              type="button"
              onClick={onVolver}
              className="mb-2 text-sm font-semibold text-amber-800 hover:text-amber-950"
            >
              ← Configuración
            </button>
          ) : null}
          <h2 className="text-xl font-black tracking-tight text-gray-900">Bonos Artesanos</h2>
          <p className="mt-1 max-w-xl text-sm text-gray-600">
            Historial de bonos ganados por cada artesano. Marcá como{" "}
            <strong>cancelado</strong> cuando ya lo pagaste en la quincena, para no confundir cuentas
            futuras.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-right">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
            <p className="text-[9px] font-bold uppercase tracking-wide text-amber-800/70">Pendiente</p>
            <p className="text-base font-black tabular-nums text-amber-900">{dinero(totalPendiente)}</p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
            <p className="text-[9px] font-bold uppercase tracking-wide text-emerald-800/70">Cancelado</p>
            <p className="text-base font-black tabular-nums text-emerald-900">{dinero(totalCancelado)}</p>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {(
          [
            ["todos", "Todos"],
            ["pendientes", "Pendientes de pago"],
            ["cancelados", "Ya cancelados"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFiltro(id)}
            className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
              filtro === id
                ? "bg-amber-500 text-white shadow-sm"
                : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {!pv ? (
        <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          No hay punto de venta asignado.
        </p>
      ) : porArtesano.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center text-sm text-gray-600">
          Aún no hay bonos registrados en este punto. Cuando un artesano alcance una meta en caja,
          aparecerán aquí.
        </p>
      ) : (
        <div className="mt-4 space-y-4 overflow-y-auto pr-1">
          {porArtesano.map(([artesano, bonos]) => {
            const pend = bonos.filter((b) => !b.cancelado).reduce((s, b) => s + b.bonoCOP, 0);
            return (
              <section
                key={artesano}
                className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"
              >
                <header className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-100 bg-gradient-to-r from-amber-50 to-orange-50 px-4 py-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-800/70">
                      Artesano
                    </p>
                    <h3 className="text-base font-black text-gray-900">{artesano}</h3>
                  </div>
                  <p className="text-sm font-bold text-amber-900">
                    Pendiente: <span className="tabular-nums">{dinero(pend)}</span>
                  </p>
                </header>
                <ul className="divide-y divide-gray-100">
                  {bonos.map((b) => (
                    <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${tonoBadge(b.tono)}`}
                          >
                            {b.tono}
                          </span>
                          <span className="text-sm font-bold text-gray-900">{b.etiqueta}</span>
                          {b.cancelado ? (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-800">
                              Cancelado
                            </span>
                          ) : (
                            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase text-rose-800">
                              Por pagar
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-gray-500">
                          {b.ymd} · Quincena {etiquetaQuincenaDesdeId(b.quincenaId)}
                          {b.cancelado && b.canceladoAtMs
                            ? ` · Pagado ${new Date(b.canceladoAtMs).toLocaleString("es-CO")}`
                            : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-base font-black tabular-nums ${
                            b.cancelado ? "text-emerald-700 line-through decoration-emerald-400" : "text-amber-700"
                          }`}
                        >
                          {dinero(b.bonoCOP)}
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleCancelado(b)}
                          className={`rounded-xl px-3 py-2 text-xs font-bold transition ${
                            b.cancelado
                              ? "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                              : "bg-emerald-600 text-white hover:bg-emerald-700"
                          }`}
                        >
                          {b.cancelado ? "Desmarcar" : "Marcar cancelado"}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
