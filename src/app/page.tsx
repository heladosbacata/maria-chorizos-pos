"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import LoginForm from "@/components/LoginForm";

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user && !user.necesitaSeleccionarPunto) {
      router.replace("/caja");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-white">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
        <p className="text-base font-medium text-gray-600">Cargando...</p>
      </div>
    );
  }

  if (user && !user.necesitaSeleccionarPunto) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <p className="text-gray-600">Redirigiendo a caja...</p>
      </div>
    );
  }

  return <LoginForm />;
}
