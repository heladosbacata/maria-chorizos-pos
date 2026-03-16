"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { enviarReporteVenta } from "@/lib/enviar-venta";
import type { EnvioEstado } from "@/lib/enviar-venta";

function formatFechaHoy(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function CajaPage() {
  const { user, signOut, loading } = useAuth();
  const router = useRouter();
  const [valorVenta, setValorVenta] = useState("");
  const [estado, setEstado] = useState<EnvioEstado>("idle");
  const [mensaje, setMensaje] = useState("");

  const handleEnviar = async () => {
    const valor = parseFloat(valorVenta.replace(/,/g, "."));
    if (isNaN(valor) || valor < 0) {
      setEstado("error");
      setMensaje("Ingresa un valor numérico válido");
      return;
    }

    if (!user?.puntoVenta) {
      setEstado("error");
      setMensaje("No hay punto de venta seleccionado");
      return;
    }

    setEstado("enviando");
    setMensaje("");

    const resultado = await enviarReporteVenta({
      fecha: formatFechaHoy(),
      uen: "Maria Chorizos",
      ventas: [{ puntoVenta: user.puntoVenta, valorVenta: valor }],
    });

    setEstado(resultado.estado);
    setMensaje(resultado.mensaje ?? "");
  };

  const handleCerrarSesion = async () => {
    await signOut();
    router.replace("/");
  };

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-primary-50">
        <div className="h-14 w-14 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
        <p className="text-lg font-medium text-gray-700">Cargando...</p>
      </div>
    );
  }

  if (!user) {
    router.replace("/");
    return null;
  }

  const fechaHoy = formatFechaHoy();
  const fechaFormateada = new Date().toLocaleDateString("es-CO", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="min-h-screen bg-primary-50 p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 md:text-3xl">
              Dashboard de Caja
            </h1>
            <p className="mt-1 text-gray-600 capitalize">{fechaFormateada}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-primary-100 px-4 py-2 text-sm font-medium text-primary-800">
              {user.puntoVenta}
            </span>
            <button
              onClick={handleCerrarSesion}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Cerrar sesión
            </button>
          </div>
        </header>

        {/* Card principal */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-lg md:p-8">
          <div className="mb-6">
            <label
              htmlFor="valorVenta"
              className="mb-2 block text-lg font-medium text-gray-700"
            >
              Valor de Venta del Día
            </label>
            <input
              id="valorVenta"
              type="text"
              inputMode="decimal"
              value={valorVenta}
              onChange={(e) => setValorVenta(e.target.value)}
              placeholder="0"
              className="input-tablet text-3xl font-bold md:text-4xl"
              disabled={estado === "enviando"}
            />
          </div>

          <button
            onClick={handleEnviar}
            disabled={estado === "enviando"}
            className="btn-tablet w-full bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-50"
          >
            {estado === "enviando" ? "Enviando..." : "Enviar Reporte"}
          </button>

          {/* Feedback */}
          {estado !== "idle" && (
            <div
              className={`mt-6 rounded-xl p-4 ${
                estado === "exito"
                  ? "bg-green-50 text-green-800"
                  : estado === "error"
                    ? "bg-red-50 text-red-800"
                    : "bg-gray-50 text-gray-700"
              }`}
            >
              {estado === "exito" && (
                <span className="mr-2 text-xl">✓</span>
              )}
              {estado === "error" && (
                <span className="mr-2 text-xl">✕</span>
              )}
              {mensaje}
            </div>
          )}
        </div>

        {/* Info adicional */}
        <p className="mt-4 text-center text-sm text-gray-500">
          Fecha del reporte: {fechaHoy}
        </p>
      </div>
    </div>
  );
}
