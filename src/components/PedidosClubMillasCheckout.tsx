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
 * Checkout /pedidos: invita a digitar cédula (cliente frecuente) o registrarse en la misma página.
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
            ? `¡Hola, ${vinculo.nombrePlan}! Acumulará millas como cliente frecuente en este pedido.`
            : "Documento encontrado. Acumulará millas como cliente frecuente en este pedido."
        );
        return;
      }
      onChange(null);
      setMostrarRegistro(true);
      setInfo(
        "No encontramos esta cédula en el Club de Millas. Regístrese aquí (es rápido) y acumule en esta misma compra."
      );
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
    <div
      id="pedidos-club-millas-checkout"
      className="rounded-2xl border-2 border-amber-400 bg-gradient-to-br from-amber-50 via-orange-50 to-white px-3.5 py-3.5 shadow-md ring-2 ring-amber-200/70"
    >
      <div className="flex items-start gap-2.5">
        <div
          className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-red-700 to-amber-500 text-[11px] font-black leading-tight text-white shadow"
          aria-hidden
        >
          CF
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-red-700">
            Cliente frecuente · Club de Millas
          </p>
          <p className="text-base font-black leading-snug text-slate-900">
            Escriba su número de documento para acumular millas
          </p>
          <p className="mt-1 text-xs font-medium leading-snug text-slate-700">
            Consulte su cédula. Si no aparece en el plan, regístrese aquí mismo (nombre + correo) y acumule en
            esta compra. Puede continuar sin millas si prefiere.
            {millasEstimadas > 0 ? (
              <>
                {" "}
                Con este total estima{" "}
                <strong className="font-bold text-amber-900">
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
        <div className="mt-3 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2.5">
          <p className="text-sm font-bold text-emerald-950">
            Cliente frecuente vinculado · CC {value.documento}
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
            Usar otra cédula / no acumular en esta compra
          </button>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-amber-950">Número de cédula</span>
            <div className="flex flex-col gap-2 sm:flex-row">
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
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void consultar();
                  }
                }}
                disabled={consultando || registrando}
                placeholder="Ej. 1020304050"
                className="min-w-0 flex-1 rounded-xl border-2 border-amber-300 bg-white px-3 py-3 text-sm font-semibold text-slate-900 outline-none ring-amber-200 focus:border-amber-500 focus:ring-2"
              />
              <button
                type="button"
                disabled={consultando || registrando || !documento.trim()}
                onClick={() => void consultar()}
                className="shrink-0 rounded-xl bg-gradient-to-r from-red-700 to-amber-500 px-4 py-3 text-sm font-black text-white shadow-sm transition hover:from-red-800 hover:to-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {consultando ? "Consultando…" : "Soy cliente frecuente"}
              </button>
            </div>
          </label>

          {!mostrarRegistro ? (
            <button
              type="button"
              disabled={consultando || registrando}
              onClick={() => {
                setMostrarRegistro(true);
                setError(null);
                setInfo("Complete sus datos para registrarse como cliente frecuente y acumular millas.");
              }}
              className="w-full rounded-xl border-2 border-dashed border-amber-400 bg-white/80 px-3 py-2.5 text-left text-xs font-bold text-amber-950 transition hover:bg-amber-100/80"
            >
              ¿Aún no está registrado? Toque aquí para afiliarse al Club de Millas en esta misma página →
            </button>
          ) : null}

          {mostrarRegistro ? (
            <div className="space-y-2 rounded-xl border-2 border-amber-300 bg-white px-3 py-3">
              <p className="text-sm font-black text-amber-950">Registro de cliente frecuente</p>
              <p className="text-[11px] font-medium text-slate-600">
                En menos de un minuto queda afiliado y puede acumular millas en este pedido.
              </p>
              <input
                type="text"
                value={nombreRegistro}
                onChange={(e) => setNombreRegistro(e.target.value)}
                disabled={registrando}
                placeholder="Nombre completo"
                className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none ring-amber-200 focus:border-amber-500 focus:ring-2"
              />
              <input
                type="text"
                inputMode="numeric"
                value={documento}
                onChange={(e) => setDocumento(e.target.value.replace(/[^\d.\-]/g, "").slice(0, 20))}
                disabled={registrando}
                placeholder="Cédula"
                className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none ring-amber-200 focus:border-amber-500 focus:ring-2"
              />
              <input
                type="email"
                value={emailRegistro}
                onChange={(e) => setEmailRegistro(e.target.value)}
                disabled={registrando}
                placeholder="Correo (le enviamos su clave de millas)"
                autoComplete="email"
                className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none ring-amber-200 focus:border-amber-500 focus:ring-2"
              />
              <p className="text-[11px] text-slate-500">
                Teléfono del pedido: {telefono.replace(/\D/g, "").slice(-10) || "complételo arriba"}
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  disabled={registrando || !emailRegistro.trim() || !nombreRegistro.trim() || !documento.trim()}
                  onClick={() => void registrar()}
                  className="flex-1 rounded-xl bg-gradient-to-r from-red-700 to-amber-500 px-3 py-3 text-sm font-black text-white shadow-sm transition hover:from-red-800 hover:to-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {registrando ? "Registrando…" : "Registrarme y acumular millas"}
                </button>
                <button
                  type="button"
                  disabled={registrando}
                  onClick={() => {
                    setMostrarRegistro(false);
                    setInfo(null);
                  }}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {info && !value ? <p className="mt-2 text-xs font-semibold text-amber-950">{info}</p> : null}
      {info && value ? <p className="mt-2 text-xs font-semibold text-emerald-800">{info}</p> : null}
      {error ? <p className="mt-2 text-xs font-semibold text-rose-700">{error}</p> : null}
    </div>
  );
}
