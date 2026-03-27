"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { sendPasswordResetEmail } from "firebase/auth";
import { useAuth } from "@/context/AuthContext";
import { auth } from "@/lib/firebase";
import { LOGO_ORG_URL } from "@/lib/brand";
import { esContadorInvitado } from "@/lib/auth-roles";
import { PUNTOS_DE_VENTA } from "@/lib/puntos-venta";

export default function LoginForm() {
  const { signIn, signOut, user, setPuntoVentaSeleccionado } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resetEnviado, setResetEnviado] = useState(false);
  const [resetting, setResetting] = useState(false);

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

  const handleSeleccionarPunto = async (punto: string) => {
    await setPuntoVentaSeleccionado(punto);
    router.replace("/caja");
  };

  const handleCerrarSesion = async () => {
    await signOut();
    router.replace("/");
  };

  const handleOlvidarContraseña = async () => {
    const emailTrim = email.trim();
    if (!emailTrim) {
      setError("Ingresa tu correo electrónico y vuelve a hacer clic en Olvidé contraseña.");
      return;
    }
    const confirmar = window.confirm(
      "¿Estás seguro que quieres enviar al equipo de soporte de POS GEB la solicitud de recuperación de contraseña?"
    );
    if (!confirmar) return;

    setError("");
    setResetEnviado(false);
    setResetting(true);
    try {
      if (!auth) throw new Error("Firebase no está disponible");
      await sendPasswordResetEmail(auth, emailTrim);
      setResetEnviado(true);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "No se pudo enviar el correo. Revisa la dirección.";
      setError(msg);
    } finally {
      setResetting(false);
    }
  };

  if (user?.necesitaSeleccionarPunto) {
    if (esContadorInvitado(user.role)) {
      return (
        <div className="flex min-h-screen flex-col bg-white">
          <header className="border-b border-gray-100 bg-white px-6 py-4 shadow-sm">
            <div className="mx-auto flex max-w-4xl items-center justify-between">
              <Image
                src={LOGO_ORG_URL}
                alt="Maria Chorizos"
                width={180}
                height={60}
                className="h-12 w-auto object-contain"
                priority
              />
              <button
                type="button"
                onClick={handleCerrarSesion}
                className="rounded-lg bg-brand-yellow px-4 py-2 text-sm font-medium text-gray-900 transition-colors hover:opacity-90"
              >
                Cerrar sesión
              </button>
            </div>
          </header>
          <main className="flex flex-1 flex-col items-center justify-center p-6 md:p-12">
            <div className="w-full max-w-lg rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
              <h1 className="text-xl font-bold text-amber-950">Cuenta de contador sin punto de venta</h1>
              <p className="mt-3 text-sm text-amber-900">
                Tu perfil está marcado como contador pero no hay punto de venta asignado en el sistema. No puedes elegir
                otro punto de venta por tu cuenta. Contacta al punto de venta que te invitó para que revisen tu acceso.
              </p>
            </div>
          </main>
        </div>
      );
    }

    return (
      <div className="flex min-h-screen flex-col bg-white">
        <header className="border-b border-gray-100 bg-white px-6 py-4 shadow-sm">
          <div className="mx-auto flex max-w-4xl items-center justify-between">
            <Image
              src={LOGO_ORG_URL}
              alt="Maria Chorizos"
              width={180}
              height={60}
              className="h-12 w-auto object-contain"
              priority
            />
            <button
              type="button"
              onClick={handleCerrarSesion}
              className="rounded-lg bg-brand-yellow px-4 py-2 text-sm font-medium text-gray-900 transition-colors hover:opacity-90"
            >
              Cerrar sesión
            </button>
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
                  className="group rounded-xl border-2 border-brand-yellow/50 bg-brand-yellow px-6 py-4 text-lg font-semibold text-gray-900 shadow-sm transition-all hover:opacity-90"
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
              src={LOGO_ORG_URL}
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
              <div className="mb-2 flex items-center justify-between">
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-gray-700"
                >
                  Contraseña
                </label>
                <button
                  type="button"
                  onClick={handleOlvidarContraseña}
                  disabled={resetting}
                  className="text-sm font-medium text-primary-500 hover:text-primary-600 hover:underline disabled:opacity-50"
                >
                  {resetting ? "Enviando..." : "¿Olvidaste tu contraseña?"}
                </button>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="input-tablet border-gray-300 focus:border-primary-500 focus:ring-primary-200 pr-12"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
                  aria-label={showPassword ? "Ocultar contraseña" : "Ver contraseña"}
                >
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                      <path d="M3.53 2.47a.75.75 0 0 0-1.06 1.06l18 18a.75.75 0 1 0 1.06-1.06l-18-18ZM22.676 12.553a11.249 11.249 0 0 1-2.631 4.31l-3.099-3.099a5.25 5.25 0 0 0-6.71-6.71L7.759 4.577a11.25 11.25 0 0 1 4.31-2.631c.426-.128.853-.128 1.278 0 2.128.64 4.04 1.91 5.61 3.586.446.446.832 1.03 1.09 1.658.258.628.378 1.305.378 1.984 0 .679-.12 1.356-.378 1.984-.258.628-.644 1.212-1.09 1.658a11.25 11.25 0 0 1-3.586 5.61 11.25 11.25 0 0 1-5.61 3.586c-.628.258-1.305.378-1.984.378-.679 0-1.356-.12-1.984-.378a5.25 5.25 0 0 0-1.658-1.09l-1.658 1.658a.75.75 0 1 1-1.06-1.06l1.658-1.658a11.25 11.25 0 0 1 1.09-1.658 11.25 11.25 0 0 1 1.658-1.09l2.587-2.587a11.25 11.25 0 0 1 3.586-5.61 11.25 11.25 0 0 1 5.61-3.586c.628-.258 1.305-.378 1.984-.378.679 0 1.356.12 1.984.378a5.25 5.25 0 0 0 1.658 1.09l2.587 2.587c.446.446.832 1.03 1.09 1.658.258.628.378 1.305.378 1.984 0 .679-.12 1.356-.378 1.984a5.25 5.25 0 0 1-1.09 1.658 11.25 11.25 0 0 1-4.31 2.631c-.426.128-.853.128-1.278 0Z" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
                      <path fillRule="evenodd" d="M1.323 11.447C2.811 6.976 7.028 3.75 12.001 3.75c4.97 0 9.185 3.223 10.675 7.69.12.362.12.752 0 1.113-1.487 4.471-5.705 7.697-10.677 7.697-4.97 0-9.186-3.223-10.675-7.69a1.762 1.762 0 0 1 0-1.113ZM17.25 12a5.25 5.25 0 1 1-10.5 0 5.25 5.25 0 0 1 10.5 0Z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
            {resetEnviado && (
              <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                Revisa tu correo. Te enviamos un enlace para restablecer tu contraseña.
              </div>
            )}
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="btn-tablet w-full bg-brand-yellow text-gray-900 shadow-lg transition-all hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? "Iniciando sesión..." : "Entrar a la caja"}
            </button>

            <p className="mt-6 text-center text-xs text-gray-500 leading-relaxed">
              Al ingresar aceptas nuestros{" "}
              <a href="#" className="text-primary-500 underline hover:text-primary-600">
                Términos de servicio
              </a>{" "}
              y confirmas que has leído nuestra{" "}
              <a href="https://mariachorizos.com/elementor-2633/" target="_blank" rel="noopener noreferrer" className="text-primary-500 underline hover:text-primary-600">
                Política de privacidad
              </a>
              . Accede al módulo de <strong>POS GEB</strong>.
            </p>
          </form>
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
