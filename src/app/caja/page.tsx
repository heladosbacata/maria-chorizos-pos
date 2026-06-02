"use client";

import dynamic from "next/dynamic";

/**
 * La UI de caja es muy pesada (~4k líneas + muchos módulos).
 * Sin SSR el documento en Vercel responde al instante; el bundle se carga en el cliente.
 */
const CajaPageClient = dynamic(() => import("./CajaPageClient"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-100/90">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
      <p className="text-sm font-medium text-gray-600">Cargando caja…</p>
    </div>
  ),
});

export default function CajaPage() {
  return <CajaPageClient />;
}
