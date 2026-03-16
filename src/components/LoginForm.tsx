"use client";

import { useState } from "react";
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
      <div className="flex min-h-screen flex-col items-center justify-center bg-primary-50 p-6 md:p-8">
        <div className="w-full max-w-md rounded-2xl border border-primary-200 bg-white p-8 shadow-lg">
          <h1 className="mb-2 text-2xl font-bold text-gray-900">
            Selecciona tu punto de venta
          </h1>
          <p className="mb-6 text-gray-600">
            No tienes un punto asignado. Elige uno para continuar:
          </p>
          <div className="flex flex-col gap-3">
            {PUNTOS_DE_VENTA.map((punto) => (
              <button
                key={punto}
                type="button"
                onClick={() => handleSeleccionarPunto(punto)}
                className="btn-tablet w-full bg-primary-500 text-white hover:bg-primary-600"
              >
                {punto}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-primary-50 p-6 md:p-8">
      <div className="w-full max-w-md rounded-2xl border border-primary-200 bg-white p-8 shadow-lg">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">
            Maria Chorizos - POS
          </h1>
          <p className="mt-2 text-gray-600">Inicia sesión para reportar ventas</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label htmlFor="email" className="mb-2 block text-sm font-medium text-gray-700">
              Correo electrónico
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="input-tablet"
              placeholder="usuario@ejemplo.com"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-2 block text-sm font-medium text-gray-700">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="input-tablet"
              placeholder="••••••••"
            />
          </div>
          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="btn-tablet w-full bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-50"
          >
            {submitting ? "Iniciando sesión..." : "Iniciar sesión"}
          </button>
        </form>
      </div>
    </div>
  );
}
