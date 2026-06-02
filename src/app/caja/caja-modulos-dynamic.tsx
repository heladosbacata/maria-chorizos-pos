"use client";

import dynamic from "next/dynamic";

function ModuloSpinner() {
  return (
    <div className="flex min-h-[240px] items-center justify-center">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
    </div>
  );
}

export const InventarioPosModule = dynamic(() => import("@/components/InventarioPosModule"), {
  loading: () => <ModuloSpinner />,
});
export const PosDomiciliosModule = dynamic(() => import("@/components/PosDomiciliosModule"), {
  loading: () => <ModuloSpinner />,
});
export const CajeroReportesDashboard = dynamic(() => import("@/components/CajeroReportesDashboard"), {
  loading: () => <ModuloSpinner />,
});
export const MetasBonificacionesModule = dynamic(() => import("@/components/MetasBonificacionesModule"), {
  loading: () => <ModuloSpinner />,
});
export const PlanMillasPosModule = dynamic(() => import("@/components/PlanMillasPosModule"), {
  loading: () => <ModuloSpinner />,
});
export const TurnosHistorialModule = dynamic(() => import("@/components/TurnosHistorialModule"), {
  loading: () => <ModuloSpinner />,
});
export const CargueInventarioManualPanel = dynamic(() => import("@/components/CargueInventarioManualPanel"), {
  loading: () => <ModuloSpinner />,
});
export const ConfiguracionMasModule = dynamic(() => import("@/components/ConfiguracionMasModule"), {
  loading: () => <ModuloSpinner />,
});
export const UltimosRecibosModule = dynamic(() => import("@/components/UltimosRecibosModule"), {
  loading: () => <ModuloSpinner />,
});
