"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import LoginForm from "@/components/LoginForm";

export default function LoginPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user && !user.necesitaSeleccionarPunto) {
      router.replace("/caja");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-primary-50">
        <div className="h-14 w-14 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
        <p className="text-lg font-medium text-gray-700">Cargando...</p>
      </div>
    );
  }

  return <LoginForm />;
}
