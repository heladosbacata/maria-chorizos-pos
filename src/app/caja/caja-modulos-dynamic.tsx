"use client";

import dynamic from "next/dynamic";

function ModuloSpinner() {
  return (
    <div className="flex min-h-[240px] items-center justify-center">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
    </div>
  );
}

function SinLoader() {
  return null;
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
export const PosChatFloatingDock = dynamic(() => import("@/components/PosChatFloatingDock"), {
  ssr: false,
});
export const PosLigaTurnoYMotivacion = dynamic(() => import("@/components/PosLigaTurnoYMotivacion"), {
  ssr: false,
  loading: () => null,
});
export const PosCajaPremiumHeader = dynamic(() => import("@/components/PosCajaPremiumHeader"), {
  loading: () => <div className="mb-5 h-24 animate-pulse rounded-2xl bg-neutral-200/80" />,
});
export const RegistrarPagoPanel = dynamic(() => import("@/components/RegistrarPagoPanel"), {
  loading: () => null,
});
export const SeleccionClienteVenta = dynamic(() => import("@/components/SeleccionClienteVenta"), {
  loading: () => null,
});

export const CrearClientePosModal = dynamic(() => import("@/components/CrearClientePosModal"), {
  loading: () => <SinLoader />,
});
export const EdicionItemCuentaModal = dynamic(() => import("@/components/EdicionItemCuentaModal"), {
  loading: () => <SinLoader />,
});
export const PerfilUsuarioModal = dynamic(() => import("@/components/PerfilUsuarioModal"), {
  loading: () => <SinLoader />,
});
export const PosGebAyudaMotorModal = dynamic(() => import("@/components/PosGebAyudaMotorModal"), {
  loading: () => <SinLoader />,
});
export const PosGebBienvenidaModal = dynamic(() => import("@/components/PosGebBienvenidaModal"), {
  loading: () => <SinLoader />,
});
export const PosGebTutorialOverlay = dynamic(() => import("@/components/PosGebTutorialOverlay"), {
  loading: () => <SinLoader />,
});
export const CobroImpresionCelebracionOverlay = dynamic(
  () => import("@/components/CobroImpresionCelebracionOverlay"),
  { loading: () => <SinLoader /> }
);
export const TicketPrevisualizacionModal = dynamic(() => import("@/components/TicketPrevisualizacionModal"), {
  loading: () => <SinLoader />,
});
export const ModalCobroSinInternet = dynamic(() => import("@/components/ModalCobroSinInternet"), {
  loading: () => <SinLoader />,
});
export const ModalInformeCierreCorreo = dynamic(() => import("@/components/ModalInformeCierreCorreo"), {
  loading: () => <SinLoader />,
});
export const PosMetaCumplidaCelebracion = dynamic(() => import("@/components/PosMetaCumplidaCelebracion"), {
  ssr: false,
  loading: () => <SinLoader />,
});
export const PosAnunciosCajaWatcher = dynamic(() => import("@/components/PosAnunciosCajaWatcher"), {
  ssr: false,
  loading: () => <SinLoader />,
});
export const PosDomiciliosNuevoPedidoAlerta = dynamic(
  () => import("@/components/PosDomiciliosNuevoPedidoAlerta"),
  { ssr: false, loading: () => <SinLoader /> }
);
export const PosDomiciliosNuevosWatcher = dynamic(() => import("@/components/PosDomiciliosNuevosWatcher"), {
  ssr: false,
  loading: () => <SinLoader />,
});
export const PosDomiciliosChatFloatingDock = dynamic(
  () => import("@/components/PosDomiciliosChatFloatingDock"),
  { ssr: false, loading: () => <SinLoader /> }
);
export const PosAjustePantallaPanel = dynamic(() => import("@/components/PosAjustePantallaPanel"), {
  ssr: false,
  loading: () => <SinLoader />,
});
export const PosFeEstadoCajaPanel = dynamic(() => import("@/components/PosFeEstadoCajaPanel"), {
  loading: () => <SinLoader />,
});
export const TurnoCierreExitoPremiumModal = dynamic(
  () => import("@/components/TurnoCierreExitoPremiumModal"),
  { loading: () => <SinLoader /> }
);
