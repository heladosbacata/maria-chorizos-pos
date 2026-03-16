"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { PUNTOS_DE_VENTA } from "@/lib/puntos-venta";

export default function LoginForm() {
  const { signIn, user, setPuntoVentaSeleccionado } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await signIn(email, password);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Error al iniciar sesión";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSeleccionarPunto = (punto: string) => {
    setPuntoVentaSeleccionado(punto);
    router.replace("/caja");
  };

  if (user?.necesitaSeleccionarPunto) {
    return (
      <div className="flex min-h-screen flex-col bg-white">
        <header className="border-b border-gray-100 bg-white px-6 py-4 shadow-sm">
          <div className="mx-auto flex max-w-4xl items-center justify-between">
            <Image
              src="/images/logo-red-bg.png"
              alt="Maria Chorizos"
              width={180}
              height={60}
              className="h-12 w-auto object-contain"
              priority
            />
            <span className="text-sm font-medium text-gray-500">
              Punto de venta
            </span>
          </div>
        </header>

        <main className="flex flex-1 flex-col items-center justify-center p-6 md:p-12">
          <div className="w-full max-w-md">
            <h1 className="mb-2 text-2xl font-bold text-gray-900">
              Selecciona tu punto de venta
            </h1>
            <p className="mb-8 text-gray-600">
              No tienes un punto asignado. Elige uno para continuar:
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {PUNTOS_DE_VENTA.map((punto) => (
                <button
                  key={punto}
                  type="button"
                  onClick={() => handleSeleccionarPunto(punto)}
                  className="group rounded-xl border-2 border-gray-200 bg-white px-6 py-4 text-lg font-semibold text-gray-800 shadow-sm transition-all hover:border-primary-500 hover:bg-primary-50 hover:text-primary-600"
                >
                  {punto}
                </button>
              ))}
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* Hero con logo */}
      <header className="relative overflow-hidden border-b border-gray-100 bg-white">
        <div className="absolute inset-0 bg-gradient-to-b from-primary-50/50 to-transparent" />
        <div className="relative mx-auto max-w-6xl px-6 py-12 md:py-16">
          <div className="flex flex-col items-center text-center">
            <Image
              src="/images/logo-red-bg.png"
              alt="Maria Chorizos"
              width={280}
              height={100}
              className="mb-6 h-20 w-auto object-contain drop-shadow-sm md:h-24"
              priority
            />
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 md:text-4xl">
              Punto de Venta
            </h1>
            <p className="mt-3 max-w-md text-lg text-gray-600">
              Reporta tus ventas diarias de forma rápida y segura
            </p>
          </div>
        </div>
      </header>

      {/* Formulario de login */}
      <main className="flex flex-1 flex-col items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-xl shadow-gray-200/50">
          <h2 className="mb-6 text-xl font-semibold text-gray-900">
            Iniciar sesión
          </h2>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label
                htmlFor="email"
                className="mb-2 block text-sm font-medium text-gray-700"
              >
                Correo electrónico
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="input-tablet border-gray-300 focus:border-primary-500 focus:ring-primary-200"
                placeholder="usuario@mariachorizos.com"
              />
            </div>
            <div>
              <label
                htmlFor="password"
                className="mb-2 block text-sm font-medium text-gray-700"
              >
                Contraseña
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="input-tablet border-gray-300 focus:border-primary-500 focus:ring-primary-200"
                placeholder="••••••••"
              />
            </div>
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="btn-tablet w-full bg-primary-500 text-white shadow-lg shadow-primary-500/25 transition-all hover:bg-primary-600 hover:shadow-primary-500/30 disabled:opacity-50"
            >
              {submitting ? "Iniciando sesión..." : "Entrar a la caja"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-500">
            Acceso exclusivo para cajeros autorizados
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-4">
        <p className="text-center text-sm text-gray-400">
          Maria Chorizos · Sistema de punto de venta
        </p>
      </footer>
    </div>
  );
}
