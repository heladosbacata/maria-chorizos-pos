"use client";

import { useEffect, useState } from "react";
import { millasGanadasPorMontoCop } from "@/lib/club-millas-calculo-venta";
import { consultarDocumentoPlanMillasWms } from "@/lib/wms-fidelizacion-consulta-documento";

export type PedidosClubMillasVinculo = {
  documento: string;
  socioId?: string;
  millasActuales?: number;
  nombrePlan?: string;
};

type Props = {
  puntoVenta: string;
  nombreCliente: string;
  telefono: string;
  totalPedido: number;
  value: PedidosClubMillasVinculo | null;
  onChange: (v: PedidosClubMillasVinculo | null) => void;
};

function normalizarDocumento(raw: string): string {
  return raw.replace(/\s/g, "").replace(/[.\-]/g, "").trim();
}

/**
 * Bloque de checkout en /pedidos: cédula para acumular millas o registro amigable en la misma página.
 */
export default function PedidosClubMillasCheckout({
  puntoVenta,
  nombreCliente,
  telefono,
  totalPedido,
  value,
  onChange,
}: Props) {
  const [documento, setDocumento] = useState(value?.documento ?? "");
  const [consultando, setConsultando] = useState(false);
  const [registrando, setRegistrando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [mostrarRegistro, setMostrarRegistro] = useState(false);
  const [emailRegistro, setEmailRegistro] = useState("");
  const [nombreRegistro, setNombreRegistro] = useState(nombreCliente);

  const millasEstimadas = millasGanadasPorMontoCop(totalPedido);

  useEffect(() => {
    if (!value) return;
    setDocumento(value.documento);
    setMostrarRegistro(false);
  }, [value]);

  useEffect(() => {
    if (!mostrarRegistro) return;
    if (nombreCliente.trim()) setNombreRegistro(nombreCliente);
  }, [nombreCliente, mostrarRegistro]);

  const limpiarVinculo = () => {
    onChange(null);
    setInfo(null);
    setError(null);
    setMostrarRegistro(false);
  };

  const consultar = async () => {
    setError(null);
    setInfo(null);
    const doc = normalizarDocumento(documento);
    if (doc.length < 5) {
      setError("Escriba su cédula (mínimo 5 dígitos, sin puntos).");
      return;
    }
    setConsultando(true);
    try {
      const r = await consultarDocumentoPlanMillasWms(doc);
      if (!r.ok) {
        setError(r.message);
        onChange(null);
        return;
      }
      if (r.registrado) {
        const vinculo: PedidosClubMillasVinculo = {
          documento: r.clientePlanMillas?.documento?.trim() || doc,
          ...(r.clientePlanMillas?.socioId?.trim()
            ? { socioId: r.clientePlanMillas.socioId.trim() }
            : {}),
          ...(typeof r.clientePlanMillas?.millas === "number"
            ? { millasActuales: r.clientePlanMillas.millas }
            : {}),
          ...(r.clientePlanMillas?.nombre?.trim()
            ? { nombrePlan: r.clientePlanMillas.nombre.trim() }
            : {}),
        };
        onChange(vinculo);
        setMostrarRegistro(false);
        setInfo(
          vinculo.nombrePlan
            ? `¡Hola, ${vinculo.nombrePlan}! Acumulará millas con este pedido.`
            : "Documento encontrado. Acumulará millas con este pedido."
        );
        return;
      }
      onChange(null);
      setMostrarRegistro(true);
      setInfo("Aún no está en el Club de Millas. Regístrese aquí en un momento y acumule en esta compra.");
    } finally {
      setConsultando(false);
    }
  };

  const registrar = async () => {
    setError(null);
    setInfo(null);
    const doc = normalizarDocumento(documento);
    const tel = telefono.replace(/\D/g, "").slice(-10);
    if (doc.length < 5) {
      setError("Escriba su cédula para registrarse.");
      return;
    }
    if (!nombreRegistro.trim()) {
      setError("Indique su nombre completo.");
      return;
    }
    if (tel.length !== 10) {
      setError("Complete el teléfono del pedido (10 dígitos) antes de registrarse.");
      return;
    }
    setRegistrando(true);
    try {
      const res = await fetch("/api/pedidos_club_millas_registrar", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          puntoVenta,
          documento: doc,
          email: emailRegistro.trim(),
          telefono: tel,
          nombreCompleto: nombreRegistro.trim(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        clientePlanMillas?: { documento?: string; nombre?: string; socioId?: string };
        bienvenidaCorreoEnviado?: boolean;
      };
      if (!res.ok || data.ok === false) {
        setError(data.message || "No se pudo completar el registro.");
        return;
      }
      const vinculo: PedidosClubMillasVinculo = {
        documento: data.clientePlanMillas?.documento?.trim() || doc,
        ...(data.clientePlanMillas?.socioId?.trim()
          ? { socioId: data.clientePlanMillas.socioId.trim() }
          : {}),
        ...(data.clientePlanMillas?.nombre?.trim()
          ? { nombrePlan: data.clientePlanMillas.nombre.trim() }
          : {}),
      };
      onChange(vinculo);
      setMostrarRegistro(false);
      setInfo(
        data.message ||
          (data.bienvenidaCorreoEnviado
            ? "¡Bienvenido al Club de Millas! Revise su correo con la clave."
            : "¡Bienvenido al Club de Millas! Acumulará millas con este pedido.")
      );
    } catch {
      setError("Sin conexión. Intente registrarse de nuevo en unos segundos.");
    } finally {
      setRegistrando(false);
    }
  };

  return (
    <div className="rounded-xl border-2 border-amber-300/80 bg-gradient-to-br from-amber-50 via-white to-orange-50 px-3 py-3 shadow-sm">
      <div className="flex items-start gap-2">
        <div
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-red-700 to-amber-500 text-xs font-black text-white shadow"
          aria-hidden
        >
          M
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-red-700">Club de Millas</p>
          <p className="text-sm font-black leading-snug text-slate-900">
            ¿Quiere acumular millas con esta compra?
          </p>
          <p className="mt-0.5 text-[11px] font-medium leading-snug text-slate-600">
            Escriba su cédula si ya está registrado, o regístrese aquí mismo. Es opcional: puede confirmar el pedido
            igual.
            {millasEstimadas > 0 ? (
              <>
                {" "}
                Con este total estima{" "}
                <strong className="font-bold text-amber-800">
                  {millasEstimadas} milla{millasEstimadas === 1 ? "" : "s"}
                </strong>
                .
              </>
            ) : (
              <> A partir de $9.000 empieza a sumar millas.</>
            )}
          </p>
        </div>
      </div>

      {value ? (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
          <p className="text-sm font-bold text-emerald-950">
            Millas vinculadas · cédula {value.documento}
            {value.nombrePlan ? ` · ${value.nombrePlan}` : ""}
          </p>
          {typeof value.millasActuales === "number" ? (
            <p className="mt-0.5 text-xs font-semibold text-emerald-800">
              Saldo actual: {value.millasActuales} millas
              {millasEstimadas > 0 ? ` · +${millasEstimadas} con este pedido` : ""}
            </p>
          ) : millasEstimadas > 0 ? (
            <p className="mt-0.5 text-xs font-semibold text-emerald-800">
              +{millasEstimadas} milla{millasEstimadas === 1 ? "" : "s"} estimada
              {millasEstimadas === 1 ? "" : "s"} al confirmarse el pedido
            </p>
          ) : null}
          <button
            type="button"
            onClick={limpiarVinculo}
            className="mt-2 text-xs font-bold text-emerald-900 underline underline-offset-2 hover:text-emerald-700"
          >
            Usar otra cédula / no acumular
          </button>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <label className="block">
            <span className="sr-only">Cédula Club de Millas</span>
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={documento}
                onChange={(e) => {
                  setDocumento(e.target.value.replace(/[^\d.\-]/g, "").slice(0, 20));
                  setError(null);
                  setInfo(null);
                }}
                disabled={consultando || registrando}
                placeholder="Cédula (sin puntos)"
                className="min-w-0 flex-1 rounded-lg border border-amber-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-amber-200 focus:border-amber-500 focus:ring-2"
              />
              <button
                type="button"
                disabled={consultando || registrando || !documento.trim()}
                onClick={() => void consultar()}
                className="shrink-0 rounded-lg bg-gradient-to-r from-red-700 to-amber-500 px-3 py-2.5 text-xs font-black text-white shadow-sm transition hover:from-red-800 hover:to-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {consultando ? "…" : "Consultar"}
              </button>
            </div>
          </label>

          {mostrarRegistro ? (
            <div className="space-y-2 rounded-lg border border-amber-200 bg-white/90 px-3 py-3">
              <p className="text-xs font-bold text-amber-950">
                Regístrese en el Club de Millas (mismo paso, sin salir de aquí)
              </p>
              <input
                type="text"
                value={nombreRegistro}
                onChange={(e) => setNombreRegistro(e.target.value)}
                disabled={registrando}
                placeholder="Nombre completo"
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none ring-amber-200 focus:border-amber-500 focus:ring-2"
              />
              <input
                type="email"
                value={emailRegistro}
                onChange={(e) => setEmailRegistro(e.target.value)}
                disabled={registrando}
                placeholder="Correo (le enviamos su clave)"
                autoComplete="email"
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none ring-amber-200 focus:border-amber-500 focus:ring-2"
              />
              <p className="text-[11px] text-slate-500">
                Usaremos el teléfono del pedido ({telefono.replace(/\D/g, "").slice(-10) || "—"}) y esta cédula.
              </p>
              <button
                type="button"
                disabled={registrando || !emailRegistro.trim() || !nombreRegistro.trim()}
                onClick={() => void registrar()}
                className="w-full rounded-lg bg-gradient-to-r from-red-700 to-amber-500 px-3 py-2.5 text-sm font-black text-white shadow-sm transition hover:from-red-800 hover:to-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {registrando ? "Registrando…" : "Registrarme y acumular millas"}
              </button>
            </div>
          ) : null}
        </div>
      )}

      {info && !value ? (
        <p className="mt-2 text-xs font-semibold text-amber-950">{info}</p>
      ) : null}
      {info && value ? (
        <p className="mt-2 text-xs font-semibold text-emerald-800">{info}</p>
      ) : null}
      {error ? <p className="mt-2 text-xs font-semibold text-rose-700">{error}</p> : null}
    </div>
  );
}
