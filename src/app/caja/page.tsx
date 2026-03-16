"use client";

import { useState } from "react";
import Image from "next/image";
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
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-white">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
        <p className="text-base font-medium text-gray-600">Cargando...</p>
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
    <div className="flex min-h-screen flex-col bg-white">
      {/* Header estilo Siigo */}
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 md:px-6">
          <div className="flex items-center gap-4">
            <Image
              src="/images/logo-red-bg.png"
              alt="Maria Chorizos"
              width={140}
              height={48}
              className="h-10 w-auto object-contain"
            />
            <div className="hidden sm:block">
              <h1 className="text-lg font-bold text-gray-900">
                Dashboard de Caja
              </h1>
              <p className="text-sm text-gray-500 capitalize">
                {fechaFormateada}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-primary-100 px-4 py-2 text-sm font-semibold text-primary-700">
              {user.puntoVenta}
            </span>
            <button
              onClick={handleCerrarSesion}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      </header>

      {/* Contenido principal */}
      <main className="flex-1 p-4 md:p-8">
        <div className="mx-auto max-w-2xl">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-lg md:p-10">
            <label
              htmlFor="valorVenta"
              className="mb-3 block text-base font-semibold text-gray-700"
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
              className="input-tablet mb-6 border-2 border-gray-200 text-3xl font-bold text-gray-900 focus:border-primary-500 md:text-4xl"
              disabled={estado === "enviando"}
            />

            <button
              onClick={handleEnviar}
              disabled={estado === "enviando"}
              className="btn-tablet w-full bg-primary-500 text-white shadow-lg shadow-primary-500/25 transition-all hover:bg-primary-600 hover:shadow-primary-500/30 disabled:opacity-50"
            >
              {estado === "enviando" ? "Enviando..." : "Enviar Reporte"}
            </button>

            {/* Feedback */}
            {estado !== "idle" && (
              <div
                className={`mt-6 rounded-xl p-4 ${
                  estado === "exito"
                    ? "border border-green-200 bg-green-50 text-green-800"
                    : estado === "error"
                      ? "border border-red-200 bg-red-50 text-red-800"
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

          <p className="mt-4 text-center text-sm text-gray-500">
            Fecha del reporte: {fechaHoy}
          </p>
        </div>
      </main>
    </div>
  );
}
