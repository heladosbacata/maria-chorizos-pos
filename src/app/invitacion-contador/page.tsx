"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  isSignInWithEmailLink,
  signInWithEmailLink,
  signOut as firebaseSignOut,
  updatePassword,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import {
  buscarInvitacionPendientePorCorreo,
  marcarInvitacionAceptada,
} from "@/lib/contador-invite-firestore";
import { persistContadorDesdeInvitacion } from "@/lib/pos-user-firestore";

type Paso = "cargando" | "pedir_correo" | "clave" | "listo" | "error";

type InvRef = NonNullable<Awaited<ReturnType<typeof buscarInvitacionPendientePorCorreo>>>;

function InvitacionContadorInner() {
  const searchParams = useSearchParams();
  const emailFromQuery = searchParams?.get("e")?.trim().toLowerCase() ?? "";

  const [paso, setPaso] = useState<Paso>("cargando");
  const [emailInput, setEmailInput] = useState(emailFromQuery);
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [puntoVentaLabel, setPuntoVentaLabel] = useState("");
  const invRef = useRef<InvRef | null>(null);

  const enlazarSesion = useCallback(async (correo: string) => {
    if (!auth || typeof window === "undefined") return;
    const href = window.location.href;
    if (!isSignInWithEmailLink(auth, href)) {
      setPaso("error");
      setMensaje(
        "Este enlace no es válido o expiró. Pide una nueva invitación desde el punto de venta."
      );
      return;
    }
    setPaso("cargando");
    setMensaje(null);
    try {
      await signInWithEmailLink(auth, correo, href);
      const inv = await buscarInvitacionPendientePorCorreo(correo);
      if (!inv?.puntoVenta || !inv.firestoreId) {
        setMensaje(
          "No hay invitación pendiente para este correo. Verifica que sea el mismo email al que enviaron la invitación."
        );
        await firebaseSignOut(auth);
        setPaso("error");
        return;
      }
      invRef.current = inv;
      setPuntoVentaLabel(inv.puntoVenta);
      window.history.replaceState({}, document.title, window.location.pathname);
      setPaso("clave");
    } catch (e) {
      setMensaje(e instanceof Error ? e.message : "No se pudo validar el enlace.");
      setPaso("error");
    }
  }, []);

  useEffect(() => {
    if (!auth || typeof window === "undefined") return;
    const href = window.location.href;
    if (!isSignInWithEmailLink(auth, href)) {
      setMensaje(
        "Abre este enlace desde el correo de invitación. Si ya te registraste, inicia sesión en la página principal."
      );
      setPaso("error");
      return;
    }
    if (emailFromQuery && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailFromQuery)) {
      void enlazarSesion(emailFromQuery);
    } else {
      setPaso("pedir_correo");
    }
  }, [emailFromQuery, enlazarSesion]);

  const enviarClave = async () => {
    if (password.length < 6) {
      setMensaje("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (password !== password2) {
      setMensaje("Las contraseñas no coinciden.");
      return;
    }
    if (!auth?.currentUser) {
      setMensaje("Sesión no válida. Vuelve a abrir el enlace del correo.");
      return;
    }
    const inv = invRef.current;
    if (!inv?.puntoVenta || !inv.firestoreId) {
      setMensaje("Datos de invitación no disponibles. Abre de nuevo el enlace del correo.");
      return;
    }
    setPaso("cargando");
    setMensaje(null);
    try {
      await updatePassword(auth.currentUser, password);
      const r = await persistContadorDesdeInvitacion({
        uid: auth.currentUser.uid,
        email: auth.currentUser.email,
        puntoVenta: inv.puntoVenta,
        invitadoPorUid: inv.inviterUid,
      });
      if (!r.ok) {
        setMensaje(r.message ?? "No se pudo guardar tu perfil.");
        setPaso("clave");
        return;
      }
      await marcarInvitacionAceptada(inv.firestoreId);
      invRef.current = null;
      await firebaseSignOut(auth);
      setPaso("listo");
    } catch (e) {
      setMensaje(e instanceof Error ? e.message : "No se pudo guardar la contraseña.");
      setPaso("clave");
    }
  };

  if (paso === "cargando") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  if (paso === "pedir_correo") {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center bg-gray-50 px-6 py-12">
        <div className="mb-6 flex justify-center">
          <Image src="/images/logo-red-bg.png" alt="Maria Chorizos" width={160} height={56} className="h-12 w-auto" />
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-lg">
          <h1 className="text-xl font-bold text-gray-900">Confirmar correo</h1>
          <p className="mt-2 text-sm text-gray-600">
            Escribe el mismo correo al que te llegó la invitación para ser contador del punto de venta.
          </p>
          <input
            type="email"
            className="mt-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            placeholder="tu@correo.com"
          />
          {mensaje && <p className="mt-3 text-sm text-red-600">{mensaje}</p>}
          <button
            type="button"
            onClick={() => {
              const c = emailInput.trim().toLowerCase();
              if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c)) {
                setMensaje("Introduce un correo válido.");
                return;
              }
              void enlazarSesion(c);
            }}
            className="mt-4 w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Continuar
          </button>
        </div>
      </div>
    );
  }

  if (paso === "clave") {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center bg-gray-50 px-6 py-12">
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-lg">
          <h1 className="text-xl font-bold text-gray-900">Crea tu contraseña</h1>
          <p className="mt-2 text-sm text-gray-600">
            Punto de venta asignado: <strong>{puntoVentaLabel}</strong>. Verás solo la información de este punto de
            venta al iniciar sesión.
          </p>
          <label className="mt-4 block text-sm font-medium text-gray-700">Contraseña</label>
          <input
            type="password"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
          <label className="mt-3 block text-sm font-medium text-gray-700">Confirmar contraseña</label>
          <input
            type="password"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
            autoComplete="new-password"
          />
          {mensaje && <p className="mt-3 text-sm text-red-600">{mensaje}</p>}
          <button
            type="button"
            onClick={() => void enviarClave()}
            className="mt-6 w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Finalizar registro
          </button>
        </div>
      </div>
    );
  }

  if (paso === "listo") {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center bg-gray-50 px-6 py-12 text-center">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8">
          <h1 className="text-xl font-bold text-emerald-900">Registro completado</h1>
          <p className="mt-2 text-sm text-emerald-800">
            Inicia sesión con tu correo y la contraseña que elegiste.
          </p>
          <Link
            href="/"
            className="mt-6 inline-block rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Ir al inicio de sesión
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center bg-gray-50 px-6 py-12">
      <div className="mb-8 flex justify-center">
        <Image src="/images/logo-red-bg.png" alt="Maria Chorizos" width={160} height={56} className="h-12 w-auto" />
      </div>
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-950">
        <p className="font-medium">No se pudo completar la invitación</p>
        <p className="mt-2">{mensaje}</p>
        <Link href="/" className="mt-4 inline-block text-blue-700 underline">
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}

export default function InvitacionContadorPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gray-50">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
        </div>
      }
    >
      <InvitacionContadorInner />
    </Suspense>
  );
}
