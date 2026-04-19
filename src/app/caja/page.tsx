"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import CajeroReportesDashboard from "@/components/CajeroReportesDashboard";
import MetasBonificacionesModule from "@/components/MetasBonificacionesModule";
import { MetasRetosCajaProvider } from "@/components/MetasRetosCajaProvider";
import CargueInventarioManualPanel from "@/components/CargueInventarioManualPanel";
import ConfiguracionMasModule from "@/components/ConfiguracionMasModule";
import CrearClientePosModal from "@/components/CrearClientePosModal";
import EdicionItemCuentaModal from "@/components/EdicionItemCuentaModal";
import InventarioPosModule from "@/components/InventarioPosModule";
import PerfilUsuarioModal from "@/components/PerfilUsuarioModal";
import PosGebAyudaMotorModal from "@/components/PosGebAyudaMotorModal";
import PosGebBienvenidaModal from "@/components/PosGebBienvenidaModal";
import PosGebTutorialOverlay from "@/components/PosGebTutorialOverlay";
import PosCajaPremiumHeader from "@/components/PosCajaPremiumHeader";
import PosLigaTurnoYMotivacion from "@/components/PosLigaTurnoYMotivacion";
import CobroImpresionCelebracionOverlay from "@/components/CobroImpresionCelebracionOverlay";
import TicketPrevisualizacionModal from "@/components/TicketPrevisualizacionModal";
import ModalCobroSinInternet from "@/components/ModalCobroSinInternet";
import ModalInformeCierreCorreo from "@/components/ModalInformeCierreCorreo";
import PosCajaMensajesBell from "@/components/PosCajaMensajesBell";
import PosBroadcastBell from "@/components/PosBroadcastBell";
import PosDomiciliosModule from "@/components/PosDomiciliosModule";
import RegistrarPagoPanel, { type DetallePagoConfirmado } from "@/components/RegistrarPagoPanel";
import TurnoCierreExitoPremiumModal from "@/components/TurnoCierreExitoPremiumModal";
import TurnosHistorialModule from "@/components/TurnosHistorialModule";
import UltimosRecibosModule from "@/components/UltimosRecibosModule";
import SeleccionClienteVenta from "@/components/SeleccionClienteVenta";
import {
  buildLineIdPos,
  etiquetaArepaCombo,
  etiquetaVarianteChorizo,
  productoEsComboConArepa,
  productoRequiereChorizoYArepa,
  productoRequiereSoloChorizoPan,
  productoRequiereSoloTipoArepaPeto,
  productoRequiereTamanoBebida,
  type OpcionesVariantesLineaPos,
  type VarianteArepaCombo,
  type VarianteChorizo,
} from "@/lib/chorizo-variante-pos";
import { useAuth } from "@/context/AuthContext";
import { esContadorInvitado } from "@/lib/auth-roles";
import { auth } from "@/lib/firebase";
import { LOGO_ORG_URL } from "@/lib/brand";
import {
  CAJERO_TURNO_ID_SESION,
  listarCajerosTurnoActivos,
  nombreDisplayCajeroTurno,
  type CajeroTurnoDoc,
} from "@/lib/cajeros-turno-firestore";
import { listarClientesPorPuntoVenta, nombreDisplayCliente } from "@/lib/clientes-pos-firestore";
import { loadImpresionPrefs } from "@/lib/impresion-pos-storage";
import {
  imprimirTicketConQz,
  imprimirTicketEnNavegador,
  reservarVentanaTicketNavegador,
} from "@/lib/pos-geb-print";
import { fetchCatalogoInsumosDesdeSheet } from "@/lib/catalogo-insumos-sheet-client";
import { getCatalogoPOS } from "@/lib/catalogo-pos";
import { mergeCatalogoInventarioBase, mergeCatalogoInventarioConProductosPos } from "@/lib/inventario-pos-catalogo";
import {
  insumoBolsaPapelParaLlevarResolver,
  insumoKitDesdeCatalogoPorSku,
  insumoStickerDomicilioParaLlevarResolver,
  listarInsumosKitPorPuntoVenta,
  registrarMovimientoInventario,
} from "@/lib/inventario-pos-firestore";
import {
  skuBolsaPapelParaLlevarEnv,
  skuStickerDomicilioParaLlevarEnv,
  skuStickerFidelizacion,
} from "@/lib/pos-para-llevar-config";
import {
  lineInputDesdeItemCuentaLike,
  montoDescuentoLinea,
  subtotalNetoLinea,
} from "@/lib/item-cuenta-linea";
import {
  mediosPagoDesdeDetalle,
  normalizarMediosPagoVenta,
  sumarMediosPagoVentas,
  type MediosPagoVentaGuardados,
} from "@/lib/medios-pago-venta";
import { anularVentaEnEquipoInventarioYNube } from "@/lib/pos-anular-venta-inventario-nube";
import { encolarAplicarEnsamblePendiente, procesarColaAplicarEnsamblePendiente } from "@/lib/pos-wms-ensamble-pendiente";
import { encolarFeEmitirPendiente, procesarColaFeEmitir } from "@/lib/pos-fe-retry-queue";
import { encolarVentaPendienteWms, procesarColaVentasPendientesWms } from "@/lib/pos-ventas-pendientes-wms";
import { getWmsPublicBaseUrl } from "@/lib/wms-public-base";
import { registrarVentaPosCloud } from "@/lib/pos-ventas-cloud-client";
import {
  agregarProductosEnVentas,
  actualizarVentaLocalFacturaElectronica,
  appendVentaLocal,
  filtrarVentasVigentes,
  listarVentasPuntoVenta,
  ventasDelTurnoActivos,
  ventasDelTurnoParaCierre,
} from "@/lib/pos-ventas-local-storage";
import {
  guardarTurnoPersistido,
  leerTurnoPersistido,
  limpiarTurnoPersistido,
} from "@/lib/turno-pos-persist";
import { appendTurnoCerrado, type TurnoCerradoV1 } from "@/lib/turno-historial-local";
import { nombreArchivoInformeTurno, textoInformeTurno, triggerDescargaTexto } from "@/lib/turno-informe-texto";
import {
  crearPdfDetalleTurno,
  nombreArchivoDetalleTurnoPdf,
} from "@/lib/turno-informe-pdf";
import { textoResumenCorreoCierreTurno } from "@/lib/turno-informe-correo-resumen";
import {
  acumularMovimientosCaja,
  crearMovimientoCajaTurno,
  type MovimientoCajaTurno,
  type TipoMovimientoCaja,
} from "@/lib/turno-movimientos-caja";
import {
  construirPayloadFidelizacionV1,
  generarDataUrlQrFidelizacion,
} from "@/lib/fidelizacion-qr";
import {
  enviarReporteVenta,
  esErrorRedVenta,
  mensajeErrorVentaParaUsuario,
} from "@/lib/enviar-venta";
import {
  wmsTurnosAbrir,
  wmsTurnosCerrar,
  wmsTurnosSincronizarSilent,
} from "@/lib/wms-turnos-client";
import { wmsPosAlegraEmitirCobro } from "@/lib/wms-pos-dian-client";
import {
  aplicarVentaEnsambleWms,
  contarAplicadosEnsambleReportados,
  guardarUltimoEnsambleEnSesion,
  lineasWmsEnsambleDesdeItemsCuenta,
  mensajeAplicarEnsambleParaCajero,
  mensajeEnsambleOkSinDescuentoInventario,
  type WmsAplicarVentaEnsambleBody,
  type WmsAplicarVentaEnsambleResult,
} from "@/lib/wms-aplicar-venta-ensamble";
import type { TicketVentaLinea, TicketVentaPayload } from "@/types/impresion-pos";
import type { ClientePosFirestoreDoc } from "@/types/clientes-pos";
import { CONSUMIDOR_FINAL_ID, type ClienteVentaRef } from "@/types/clientes-pos";
import type { ProductoPOS, TipoComprobanteVenta, VentaReporte } from "@/types";
import type { ItemCuenta } from "@/types/pos-caja-item";
import {
  comprimirDataUrlFotoCajero,
  readCajeroFotoDataUrl,
  writeCajeroFotoDataUrl,
} from "@/constants/perfil-pos";
import { fechaColombia, fechaHoraColombia, ymdColombia } from "@/lib/fecha-colombia";
import { formatPesosCop, parsePesosCopInput } from "@/lib/pesos-cop-input";
import { calcularResumenCierreTurno } from "@/lib/turno-cierre-resumen";
import {
  combinarCcInformeCierreTurno,
  mensajeExitoMotivacionalInformeCierreTurno,
} from "@/lib/cierre-turno-informe-correo-ui";
import { emailDesdeFichaFranquiciado, getFranquiciadoPorPuntoVenta } from "@/lib/franquiciado-pos";
import {
  clearPosGebOnboarding,
  markPosGebTutorialCompleted,
  readPosGebOnboarding,
  writePosGebOnboarding,
} from "@/lib/pos-onboarding-storage";
import { getPosGebTutorialSteps, type PosGebTutorialModulo } from "@/lib/pos-geb-tutorial-steps";

const LS_INFORME_TURNO_PARA = "pos_mc_informe_turno_para_v1";
const LS_INFORME_TURNO_CC = "pos_mc_informe_turno_cc_v1";
/** Clave maestra para abrir el menú «Más» (misma que PYG, inventario y contrato POS en el proyecto). */
const CLAVE_ACCESO_MAS = "MC2026";
/** Tiempo mínimo visible del overlay de impresión al cobrar (experiencia pulida). */
const MIN_COBRO_IMPRESION_OVERLAY_MS = 2600;
/** Sincronización del acumulado del turno con el WMS (monitor / ventas por minuto). */
const WMS_TURNO_SYNC_INTERVAL_MS = 45_000;

/** Vista previa post-cobro: permite anular y restaurar la cuenta con el mismo criterio que «Últimos recibos». */
type VistaPreviaCobroPendiente = {
  ticket: TicketVentaPayload;
  ventaLocalId: string | null;
  itemsRestaurar: ItemCuenta[];
  total: number;
  /** Si existe, el ensamble WMS aún no se aplicó y debe ejecutarse al pulsar «Imprimir». */
  ensamblePendiente: WmsAplicarVentaEnsambleBody | null;
  /** Sticker descontado al activar «Cliente frecuente» antes del cobro; al cancelar vista previa se devuelve. */
  incluirQrClienteFrecuente?: boolean;
};

function clonarItemsCuenta(items: ItemCuenta[]): ItemCuenta[] {
  try {
    return structuredClone(items);
  } catch {
    return JSON.parse(JSON.stringify(items)) as ItemCuenta[];
  }
}

function emailValidoSimple(s: string): boolean {
  const t = s.trim();
  if (!t || t.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

function nuevoTurnoSesionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

const EPS_PAGO = 0.01;

function construirNotaPiePago(d: DetallePagoConfirmado): string | undefined {
  const fmt = (n: number) =>
    n.toLocaleString("es-CO", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
  const parts: string[] = [];
  if (d.efectivo > EPS_PAGO) parts.push(`Efectivo $${fmt(d.efectivo)}`);
  for (const p of d.pagosLinea) {
    parts.push(`${p.tipo} $${fmt(p.monto)}`);
  }
  const pagoLine = parts.length ? `Pago: ${parts.join(" · ")}` : "";
  const obs = d.observaciones.trim();
  if (obs) return [pagoLine, `Obs.: ${obs}`].filter(Boolean).join("\n");
  return pagoLine || undefined;
}

export interface PrecuentaTab {
  id: string;
  nombre: string;
}

export type { ItemCuenta } from "@/types/pos-caja-item";

function detalleVarianteTicketLinea(it: ItemCuenta): string | undefined {
  const parts: string[] = [];
  if (it.varianteChorizo) parts.push(etiquetaVarianteChorizo(it.varianteChorizo));
  if (it.varianteArepaCombo) parts.push(etiquetaArepaCombo(it.varianteArepaCombo));
  if (Array.isArray(it.variantes) && it.variantes.length > 0) {
    const variantesEtiquetas = it.variantes
      .map((v) => {
        const norm = String(v ?? "").trim().toUpperCase();
        const match = it.producto.variantes?.find((opt) => String(opt.clave ?? "").trim().toUpperCase() === norm);
        return match?.etiqueta ?? v;
      })
      .filter(Boolean);
    parts.push(...variantesEtiquetas);
  }
  const dto = montoDescuentoLinea(lineInputDesdeItemCuentaLike(it));
  const modo = it.descuentoModo ?? "ninguno";
  if (dto > 0) {
    if (modo === "porcentaje" && it.descuentoValor != null) {
      parts.push(`Dto ${it.descuentoValor}%`);
    } else {
      parts.push(`Dto $${dto.toLocaleString("es-CO")}`);
    }
  }
  return parts.length ? parts.join(" · ") : undefined;
}

async function cargarCatalogoInventarioUnificado(puntoVenta: string) {
  const [sheetRes, desdeFs, posRes] = await Promise.all([
    fetchCatalogoInsumosDesdeSheet(puntoVenta),
    listarInsumosKitPorPuntoVenta(puntoVenta),
    getCatalogoPOS(null, puntoVenta),
  ]);
  const base = mergeCatalogoInventarioBase(sheetRes.ok && sheetRes.data.length > 0 ? sheetRes.data : [], desdeFs);
  return mergeCatalogoInventarioConProductosPos(base, posRes.ok ? posRes.productos ?? [] : []).items;
}

function itemCuentaEsBebidaConInventarioDirecto(it: ItemCuenta): boolean {
  return productoRequiereTamanoBebida(it.producto) || `${it.producto.categoria ?? ""}`.toLowerCase().includes("bebida");
}

function lineasTicketDesdeItemsCuenta(items: ItemCuenta[]): TicketVentaLinea[] {
  return items.map((it) => {
    const li = lineInputDesdeItemCuentaLike(it);
    const sub = subtotalNetoLinea(li);
    const qty = Math.max(0.0001, it.cantidad);
    const precioUnitario = Math.round((sub / qty) * 100) / 100;
    return {
      descripcion: it.producto.descripcion,
      cantidad: it.cantidad,
      precioUnitario,
      subtotal: sub,
      detalleVariante: detalleVarianteTicketLinea(it),
    };
  });
}

function totalLineaItem(it: ItemCuenta): number {
  return subtotalNetoLinea(lineInputDesdeItemCuentaLike(it));
}

function etiquetaTipoComprobanteTicket(t: TipoComprobanteVenta): string {
  return t === "documento_interno" ? "Doc. interno" : "Factura electrónica de venta";
}

type ModuloActivo =
  | "ventas"
  | "ultimosRecibos"
  | "turnos"
  | "cargueInventario"
  | "inventarios"
  | "metasBonificaciones"
  | "reportes"
  | "domicilios"
  | "mas";

type TipoComprobante = TipoComprobanteVenta;

export default function CajaPage() {
  const { user, signOut, loading } = useAuth();
  const router = useRouter();
  const [fotoPerfil, setFotoPerfil] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/");
    }
  }, [loading, user, router]);

  /** Reintenta ventas que quedaron fuera del WMS por red (cola local) y descuentos ensamble pendientes. */
  useEffect(() => {
    if (!user || esContadorInvitado(user.role)) return;
    const run = () => {
      void procesarColaVentasPendientesWms();
      void procesarColaAplicarEnsamblePendiente(async () => (await auth?.currentUser?.getIdToken()) ?? null);
      void procesarColaFeEmitir(async () => (await auth?.currentUser?.getIdToken()) ?? null);
    };
    run();
    const onVis = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVis);
    const t = window.setInterval(run, 120_000);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(t);
    };
  }, [user]);

  const [moduloActivo, setModuloActivo] = useState<ModuloActivo>("ventas");
  const [posGebBienvenidaAbierta, setPosGebBienvenidaAbierta] = useState(false);
  const [posGebTutorialAbierto, setPosGebTutorialAbierto] = useState(false);
  const [posGebTutorialPaso, setPosGebTutorialPaso] = useState(0);
  const [posGebAyudaAbierta, setPosGebAyudaAbierta] = useState(false);
  const [precuentas, setPrecuentas] = useState<PrecuentaTab[]>([
    { id: "1", nombre: "Nueva pre-cuenta" },
  ]);
  const [activePrecuentaId, setActivePrecuentaId] = useState("1");
  /** Ítems de la cuenta a cobrar por pre-cuenta (panel derecho) */
  const [itemsPorPrecuenta, setItemsPorPrecuenta] = useState<Record<string, ItemCuenta[]>>({ "1": [] });
  /** El turno inicia cerrado: al abrirlo se elige el cajero operativo. */
  const [turnoAbierto, setTurnoAbierto] = useState(false);
  const [turnoInicio, setTurnoInicio] = useState<Date>(() => new Date());
  const [showModalCierreTurno, setShowModalCierreTurno] = useState(false);
  const [modalInformeCierreCorreoAbierto, setModalInformeCierreCorreoAbierto] = useState(false);
  const [emailInformeCierrePara, setEmailInformeCierrePara] = useState("");
  const [emailInformeCierreCc, setEmailInformeCierreCc] = useState("");
  const [cargandoDefaultsInformeCorreo, setCargandoDefaultsInformeCorreo] = useState(false);
  const [procesandoCierreTurno, setProcesandoCierreTurno] = useState(false);
  const [errorInformeCierreCorreo, setErrorInformeCierreCorreo] = useState<string | null>(null);
  const [modalExitoCierreTurno, setModalExitoCierreTurno] = useState<{
    titulo: string;
    lineas: string[];
  } | null>(null);
  const [detalleVentasExpandido, setDetalleVentasExpandido] = useState(true);
  const [baseInicialCaja, setBaseInicialCaja] = useState(0);
  const [showModalAbrirTurno, setShowModalAbrirTurno] = useState(false);
  const [baseInicialCajaInput, setBaseInicialCajaInput] = useState("");
  const [cajerosModalTurno, setCajerosModalTurno] = useState<CajeroTurnoDoc[]>([]);
  const [cargandoCajerosTurnoModal, setCargandoCajerosTurnoModal] = useState(false);
  const [cajeroIdSeleccionAbrirTurno, setCajeroIdSeleccionAbrirTurno] = useState<string>(CAJERO_TURNO_ID_SESION);
  const [errorModalAbrirTurno, setErrorModalAbrirTurno] = useState<string | null>(null);
  const [showModalClaveMas, setShowModalClaveMas] = useState(false);
  const [inputClaveMas, setInputClaveMas] = useState("");
  const [mostrarClaveMasEnClaro, setMostrarClaveMasEnClaro] = useState(false);
  /** Cajero que opera el turno actual (ventas / reportes al WMS). */
  const [cajeroTurnoActivo, setCajeroTurnoActivo] = useState<{
    id: string;
    nombreDisplay: string;
    documento: string;
  } | null>(null);
  /** Catálogo posCajerosTurno cuando el turno no es «solo sesión». */
  const cajeroFirestoreIdPerfil = useMemo(() => {
    if (turnoAbierto && cajeroTurnoActivo?.id && cajeroTurnoActivo.id !== CAJERO_TURNO_ID_SESION) {
      return cajeroTurnoActivo.id.trim();
    }
    return null;
  }, [turnoAbierto, cajeroTurnoActivo?.id]);

  /** Misma clave que el modal: `uid` en sesión / cajero del catálogo cuando el turno está abierto. */
  useEffect(() => {
    if (!user) return;
    setFotoPerfil(readCajeroFotoDataUrl(user.uid, cajeroFirestoreIdPerfil));
  }, [user?.uid, cajeroFirestoreIdPerfil]);

  const esUsuarioContadorGeb = Boolean(user && esContadorInvitado(user.role));
  const pasosTutorialPosGeb = useMemo(
    () => getPosGebTutorialSteps(esUsuarioContadorGeb),
    [esUsuarioContadorGeb]
  );

  useEffect(() => {
    if (!user?.uid) return;
    const st = readPosGebOnboarding(user.uid);
    if (!st) {
      setPosGebBienvenidaAbierta(true);
      return;
    }
    if (st.isNewUser && !st.tutorialCompleted) {
      setPosGebTutorialAbierto(true);
      setPosGebTutorialPaso(0);
    }
  }, [user?.uid]);

  const finalizarTutorialPosGeb = useCallback(() => {
    if (user?.uid) markPosGebTutorialCompleted(user.uid);
    setPosGebTutorialAbierto(false);
    setPosGebTutorialPaso(0);
  }, [user?.uid]);

  const handleTutorialNavigatePosGeb = useCallback((m: PosGebTutorialModulo) => {
    setModuloActivo(m as ModuloActivo);
  }, []);

  const handleAyudaIrAPosGeb = useCallback((m: PosGebTutorialModulo, target?: string) => {
    setModuloActivo(m as ModuloActivo);
    if (target) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          document
            .querySelector(`[data-pos-tutorial="${target}"]`)
            ?.scrollIntoView({ block: "center", behavior: "smooth" });
        });
      });
    }
  }, []);

  const handleFotoPerfilChange = useCallback(
    (dataUrl: string | null) => {
      const uid = user?.uid;
      if (!dataUrl) {
        setFotoPerfil(null);
        if (!writeCajeroFotoDataUrl(uid, null, cajeroFirestoreIdPerfil)) {
          window.alert(
            "No se pudo actualizar la foto en este navegador. Revisá que no esté bloqueado el almacenamiento del sitio."
          );
        }
        return;
      }
      void (async () => {
        const compressed = await comprimirDataUrlFotoCajero(dataUrl);
        const ok = writeCajeroFotoDataUrl(uid, compressed, cajeroFirestoreIdPerfil);
        if (!ok) {
          window.alert(
            "No se pudo guardar la foto en este navegador (suele ser por imagen muy grande o cuota llena). " +
              "Probá con otra foto o liberá espacio; la imagen se comprime al guardar."
          );
          return;
        }
        setFotoPerfil(compressed);
      })();
    },
    [user?.uid, cajeroFirestoreIdPerfil]
  );

  const [totalVentasEnTurno, setTotalVentasEnTurno] = useState(0);
  const [movimientosCaja, setMovimientosCaja] = useState<MovimientoCajaTurno[]>([]);
  const [ventasCredito, setVentasCredito] = useState(0);
  /** Historial de precuentas anuladas en este turno */
  const [precuentasEliminadasCount, setPrecuentasEliminadasCount] = useState(0);
  const [productosEliminadosCount, setProductosEliminadosCount] = useState(0);
  const [valorProductosEliminados, setValorProductosEliminados] = useState(0);
  /** Id estable del turno actual (ventas y cierre). */
  const [turnoSesionId, setTurnoSesionId] = useState("");
  const [abriendoTurnoWms, setAbriendoTurnoWms] = useState(false);
  const totalVentasEnTurnoRef = useRef(0);
  totalVentasEnTurnoRef.current = totalVentasEnTurno;
  /** Evita sobrescribir el cierre si el usuario editó con el modal abierto. */
  const cierreTurnoYaPrecargadoRef = useRef(false);
  /** Hubo snapshot de turno en localStorage al hidratar (alinear WMS una vez). */
  const restauradoDesdeLocalStorageRef = useRef(false);
  /** Ya se ejecutó abrir+sincronizar tras restaurar desde LS. */
  const wmsAlineadoTrasRestauracionRef = useRef(false);
  const [showModalPerfilUsuario, setShowModalPerfilUsuario] = useState(false);
  /** Foto en el modal de perfil (cajero en turno o sesión, según turno abierto). */
  const [fotoPerfilModal, setFotoPerfilModal] = useState<string | null>(null);
  const inputFotoRef = useRef<HTMLInputElement>(null);
  const [catalogoProductos, setCatalogoProductos] = useState<ProductoPOS[]>([]);
  const [catalogoLoading, setCatalogoLoading] = useState(false);
  const [catalogoError, setCatalogoError] = useState<string | null>(null);
  const [busquedaCatalogo, setBusquedaCatalogo] = useState("");
  /** Tipo de comprobante: Doc. interno (predeterminado) o Factura electrónica */
  const [tipoComprobante, setTipoComprobante] = useState<TipoComprobante>("documento_interno");
  const [clientePorPrecuenta, setClientePorPrecuenta] = useState<Record<string, ClienteVentaRef>>(() => ({
    "1": { id: CONSUMIDOR_FINAL_ID, nombreDisplay: "Consumidor final" },
  }));
  const [clientesPosLista, setClientesPosLista] = useState<ClientePosFirestoreDoc[]>([]);
  const [showModalCrearCliente, setShowModalCrearCliente] = useState(false);
  const [cobrando, setCobrando] = useState(false);
  const [cobroImpresionOverlayOpen, setCobroImpresionOverlayOpen] = useState(false);
  /** Ticket listo para imprimir: primero se muestra vista previa si imprimir automático está activo. */
  const [previsualizacionCobro, setPrevisualizacionCobro] = useState<VistaPreviaCobroPendiente | null>(null);
  const [cancelandoTransaccionVistaPrevia, setCancelandoTransaccionVistaPrevia] = useState(false);
  const [registrarPagoAbierto, setRegistrarPagoAbierto] = useState(false);
  const [modalCobroSinInternetAbierto, setModalCobroSinInternetAbierto] = useState(false);
  const resolverCobroSinInternetRef = useRef<((aceptar: boolean) => void) | null>(null);
  const [itemEditando, setItemEditando] = useState<ItemCuenta | null>(null);
  const [aplicandoParaLlevar, setAplicandoParaLlevar] = useState(false);
  /** Panel “Ver resumen” en el pie del carrito (doc. interno / factura). */
  const [sidebarResumenExpandido, setSidebarResumenExpandido] = useState(false);
  /** Id de la pre-cuenta cuyo nombre se está editando; null si no hay edición */
  const [editingPrecuentaId, setEditingPrecuentaId] = useState<string | null>(null);
  const [editingNombre, setEditingNombre] = useState("");
  /** Modal Picante / Tradicional para chorizo con pan o arepa */
  const [modalProductoChorizo, setModalProductoChorizo] = useState<ProductoPOS | null>(null);
  const [varianteModalChorizo, setVarianteModalChorizo] = useState<VarianteChorizo>("tradicional");
  const [varianteModalArepa, setVarianteModalArepa] = useState<VarianteArepaCombo>("arepa_queso");
  const [modalProductoBebida, setModalProductoBebida] = useState<ProductoPOS | null>(null);
  const [varianteModalBebida, setVarianteModalBebida] = useState<string>("");
  /** Evita escribir localStorage antes de restaurar el turno guardado (misma sesión / otro usuario). */
  const [turnoHidratadoDesdeStorage, setTurnoHidratadoDesdeStorage] = useState(false);
  const resumenMovimientosCaja = useMemo(
    () => acumularMovimientosCaja(movimientosCaja),
    [movimientosCaja]
  );
  const totalIngresoEfectivo = resumenMovimientosCaja.totalIngresoEfectivo;
  const totalRetiroEfectivo = resumenMovimientosCaja.totalRetiroEfectivo;

  useEffect(() => {
    if (!showModalPerfilUsuario || !user?.uid?.trim()) return;
    setFotoPerfilModal(readCajeroFotoDataUrl(user.uid, cajeroFirestoreIdPerfil));
  }, [showModalPerfilUsuario, user?.uid, cajeroFirestoreIdPerfil]);

  const handleFotoPerfilModalChange = useCallback(
    (dataUrl: string | null) => {
      const uid = user?.uid;
      if (!dataUrl) {
        setFotoPerfilModal(null);
        setFotoPerfil(null);
        if (!writeCajeroFotoDataUrl(uid, null, cajeroFirestoreIdPerfil)) {
          window.alert(
            "No se pudo actualizar la foto en este navegador. Revisá que no esté bloqueado el almacenamiento del sitio."
          );
        }
        return;
      }
      void (async () => {
        const compressed = await comprimirDataUrlFotoCajero(dataUrl);
        const ok = writeCajeroFotoDataUrl(uid, compressed, cajeroFirestoreIdPerfil);
        if (!ok) {
          window.alert(
            "No se pudo guardar la foto en este navegador (suele ser por imagen muy grande o cuota llena). " +
              "Probá con otra foto o liberá espacio; la imagen se comprime al guardar."
          );
          return;
        }
        setFotoPerfilModal(compressed);
        setFotoPerfil(compressed);
      })();
    },
    [user?.uid, cajeroFirestoreIdPerfil]
  );

  useEffect(() => {
    if (user && esContadorInvitado(user.role)) {
      setModuloActivo("reportes");
    }
  }, [user?.uid, user?.role]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!user?.uid || !user?.puntoVenta?.trim()) {
      restauradoDesdeLocalStorageRef.current = false;
      setTurnoHidratadoDesdeStorage(false);
      return;
    }
    if (esContadorInvitado(user.role)) {
      restauradoDesdeLocalStorageRef.current = false;
      setTurnoHidratadoDesdeStorage(true);
      return;
    }
    const snap = leerTurnoPersistido(user.uid, user.puntoVenta);
    if (snap) {
      restauradoDesdeLocalStorageRef.current = true;
      const inicio = new Date(snap.turnoInicioIso);
      setTurnoAbierto(true);
      setTurnoInicio(Number.isNaN(inicio.getTime()) ? new Date() : inicio);
      setBaseInicialCaja(snap.baseInicialCaja);
      setCajeroTurnoActivo(snap.cajeroTurnoActivo);
      setTotalVentasEnTurno(snap.totalVentasEnTurno);
      setMovimientosCaja(snap.movimientosCaja ?? []);
      setVentasCredito(snap.ventasCredito);
      setPrecuentasEliminadasCount(snap.precuentasEliminadasCount);
      setProductosEliminadosCount(snap.productosEliminadosCount);
      setValorProductosEliminados(snap.valorProductosEliminados);
      setTurnoSesionId(snap.turnoSesionId.trim() ? snap.turnoSesionId.trim() : nuevoTurnoSesionId());
    } else {
      restauradoDesdeLocalStorageRef.current = false;
      setTurnoAbierto(false);
      setCajeroTurnoActivo(null);
      setTotalVentasEnTurno(0);
      setMovimientosCaja([]);
      setVentasCredito(0);
      setPrecuentasEliminadasCount(0);
      setProductosEliminadosCount(0);
      setValorProductosEliminados(0);
      setBaseInicialCaja(0);
      setTurnoSesionId("");
    }
    setTurnoHidratadoDesdeStorage(true);
  }, [user?.uid, user?.puntoVenta, user?.role]);

  useEffect(() => {
    if (!turnoHidratadoDesdeStorage) return;
    if (!user?.uid || !user?.puntoVenta?.trim() || esContadorInvitado(user.role)) return;
    if (!turnoAbierto || !cajeroTurnoActivo) return;
    guardarTurnoPersistido(user.uid, user.puntoVenta, {
      version: 1,
      turnoSesionId: turnoSesionId.trim(),
      turnoInicioIso: turnoInicio.toISOString(),
      baseInicialCaja,
      cajeroTurnoActivo,
      totalVentasEnTurno,
      totalIngresoEfectivo,
      totalRetiroEfectivo,
      movimientosCaja,
      ventasCredito,
      precuentasEliminadasCount,
      productosEliminadosCount,
      valorProductosEliminados,
    });
  }, [
    turnoHidratadoDesdeStorage,
    turnoAbierto,
    user?.uid,
    user?.puntoVenta,
    user?.role,
    cajeroTurnoActivo,
    turnoSesionId,
    turnoInicio,
    baseInicialCaja,
    totalVentasEnTurno,
    totalIngresoEfectivo,
    totalRetiroEfectivo,
    movimientosCaja,
    ventasCredito,
    precuentasEliminadasCount,
    productosEliminadosCount,
    valorProductosEliminados,
  ]);

  useEffect(() => {
    if (!turnoHidratadoDesdeStorage) return;
    if (!turnoAbierto || !cajeroTurnoActivo) return;
    if (turnoSesionId.trim()) return;
    setTurnoSesionId(nuevoTurnoSesionId());
  }, [turnoHidratadoDesdeStorage, turnoAbierto, cajeroTurnoActivo, turnoSesionId]);

  /** Turno recuperado de localStorage: una vez alinear abrir + total en el WMS. */
  useEffect(() => {
    if (!turnoHidratadoDesdeStorage) return;
    if (!restauradoDesdeLocalStorageRef.current) return;
    if (wmsAlineadoTrasRestauracionRef.current) return;
    if (!turnoAbierto || !user?.puntoVenta?.trim() || esContadorInvitado(user.role)) return;

    let cancelled = false;
    let settled = false;
    void (async () => {
      try {
        const token = await auth?.currentUser?.getIdToken();
        if (cancelled) return;
        if (!token) {
          settled = true;
          wmsAlineadoTrasRestauracionRef.current = true;
          return;
        }
        const r = await wmsTurnosAbrir(token, { uen: "Maria Chorizos" });
        if (cancelled) return;
        if (!r.ok) {
          console.warn("[POS] Turno restaurado desde este equipo: WMS abrir no disponible —", r.error);
          settled = true;
          wmsAlineadoTrasRestauracionRef.current = true;
          return;
        }
        await wmsTurnosSincronizarSilent(token, totalVentasEnTurnoRef.current);
        if (cancelled) return;
        settled = true;
        wmsAlineadoTrasRestauracionRef.current = true;
      } catch (e) {
        if (!cancelled) {
          console.warn("[POS] Turno restaurado: error al alinear con WMS", e);
          settled = true;
          wmsAlineadoTrasRestauracionRef.current = true;
        }
      }
    })();

    return () => {
      cancelled = true;
      if (!settled) wmsAlineadoTrasRestauracionRef.current = false;
    };
  }, [turnoHidratadoDesdeStorage, turnoAbierto, user?.puntoVenta, user?.role]);

  /** Heartbeat de total de ventas del turno hacia el WMS (monitor en vivo). */
  useEffect(() => {
    if (!turnoAbierto || !user?.puntoVenta?.trim() || esContadorInvitado(user.role)) return;
    const id = window.setInterval(() => {
      void (async () => {
        const t = await auth?.currentUser?.getIdToken();
        if (t) await wmsTurnosSincronizarSilent(t, totalVentasEnTurnoRef.current);
      })();
    }, WMS_TURNO_SYNC_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [turnoAbierto, user?.puntoVenta, user?.role]);

  const cargarCatalogo = () => {
    if (user && esContadorInvitado(user.role)) return;
    if (moduloActivo !== "ventas") return;
    setCatalogoLoading(true);
    setCatalogoError(null);
    const tokenPromise = auth?.currentUser ? auth.currentUser.getIdToken() : Promise.resolve(null);
    tokenPromise
      .then((token) => getCatalogoPOS(token, user?.puntoVenta?.trim() ?? ""))
      .then((res) => {
        if (res.ok && res.productos) setCatalogoProductos(res.productos ?? []);
        else setCatalogoError(res.message ?? "No se pudo cargar el catálogo");
      })
      .catch(() => setCatalogoError("Error al cargar el catálogo"))
      .finally(() => setCatalogoLoading(false));
  };

  useEffect(() => {
    if (user && esContadorInvitado(user.role)) return;
    if (moduloActivo !== "ventas") return;
    let cancelled = false;
    setCatalogoLoading(true);
    setCatalogoError(null);
    const tokenPromise = auth?.currentUser ? auth.currentUser.getIdToken() : Promise.resolve(null);
    tokenPromise
      .then((token) => getCatalogoPOS(token, user?.puntoVenta?.trim() ?? ""))
      .then((res) => {
        if (cancelled) return;
        if (res.ok && res.productos) setCatalogoProductos(res.productos ?? []);
        else setCatalogoError(res.message ?? "No se pudo cargar el catálogo");
      })
      .catch(() => {
        if (!cancelled) setCatalogoError("Error al cargar el catálogo");
      })
      .finally(() => {
        if (!cancelled) setCatalogoLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [moduloActivo, user?.role, user, user?.puntoVenta]);

  useEffect(() => {
    if (!user?.puntoVenta?.trim() || esContadorInvitado(user.role)) return;
    if (moduloActivo !== "ventas") return;
    let cancelled = false;
    void listarClientesPorPuntoVenta(user.puntoVenta.trim()).then((rows) => {
      if (!cancelled) setClientesPosLista(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [moduloActivo, user?.puntoVenta, user?.role]);

  useEffect(() => {
    if (!showModalAbrirTurno || !user?.puntoVenta?.trim()) return;
    let cancelled = false;
    setCargandoCajerosTurnoModal(true);
    setErrorModalAbrirTurno(null);
    void listarCajerosTurnoActivos(user.puntoVenta).then((rows) => {
      if (cancelled) return;
      setCajerosModalTurno(rows);
      /** Por defecto: turno como franquiciado (quien suele apoyar en caja con la misma cuenta). */
      setCajeroIdSeleccionAbrirTurno(CAJERO_TURNO_ID_SESION);
      setCargandoCajerosTurnoModal(false);
    });
    return () => {
      cancelled = true;
    };
  }, [showModalAbrirTurno, user?.puntoVenta]);

  const catalogosFiltrados = useMemo(() => {
    const q = busquedaCatalogo.trim().toLowerCase();
    if (!q) return catalogoProductos;
    return catalogoProductos.filter(
      (p) =>
        p.sku.toLowerCase().includes(q) ||
        (p.descripcion && p.descripcion.toLowerCase().includes(q)) ||
        (p.categoria && p.categoria.toLowerCase().includes(q))
    );
  }, [catalogoProductos, busquedaCatalogo]);

  const clienteActivoPrecuenta: ClienteVentaRef = clientePorPrecuenta[activePrecuentaId] ?? {
    id: CONSUMIDOR_FINAL_ID,
    nombreDisplay: "Consumidor final",
  };

  const vendedorEtiqueta = useMemo(() => {
    if (cajeroTurnoActivo?.nombreDisplay?.trim()) {
      const s = cajeroTurnoActivo.nombreDisplay.trim();
      return s.length > 32 ? `${s.slice(0, 29)}…` : s;
    }
    const mail = user?.email?.split("@")[0]?.trim();
    return mail && mail.length > 0 ? mail : "—";
  }, [cajeroTurnoActivo?.nombreDisplay, user?.email]);

  const ventasTurnoActivales = useMemo(() => {
    if (!user?.uid?.trim() || !user?.puntoVenta?.trim() || !turnoAbierto) return [];
    const pv = user.puntoVenta.trim();
    return filtrarVentasVigentes(
      ventasDelTurnoActivos(listarVentasPuntoVenta(user.uid, pv), turnoSesionId, turnoInicio)
    );
  }, [user?.uid, user?.puntoVenta, turnoAbierto, turnoSesionId, turnoInicio, totalVentasEnTurno]);

  const mediosTurnoModal = useMemo(() => {
    const rows = ventasTurnoActivales
      .map((v) => (v.mediosPago ? normalizarMediosPagoVenta(v.mediosPago, v.total) : undefined))
      .filter((m): m is MediosPagoVentaGuardados => Boolean(m));
    const base = rows.length
      ? sumarMediosPagoVentas(rows)
      : ({
          efectivo: 0,
          tarjeta: 0,
          pagosLinea: 0,
          otros: 0,
          detalleLineas: [] as { tipo: string; monto: number }[],
        } satisfies MediosPagoVentaGuardados);
    const sinDesglose = ventasTurnoActivales
      .filter((v) => !v.mediosPago)
      .reduce((s, v) => s + v.total, 0);
    return {
      ...base,
      efectivo: Math.round((base.efectivo + sinDesglose) * 100) / 100,
    };
  }, [ventasTurnoActivales]);

  /** Mismos totales que el resumen «Ver detalle» (cierre de caja solo lectura desde tickets). */
  const cierreCamposDesdeVentas = useMemo(
    () => ({
      efectivo: mediosTurnoModal.efectivo,
      tarjeta: mediosTurnoModal.tarjeta,
      pagosLinea: mediosTurnoModal.pagosLinea,
      otros: mediosTurnoModal.otros,
    }),
    [mediosTurnoModal]
  );

  /** Efectivo en caja = base inicial + ventas en efectivo; el resto son ventas por medio. No editable. */
  const valoresCierreCajaSegunVentas = useMemo(() => {
    const m = cierreCamposDesdeVentas;
    const totalVentasLocales = Math.round(
      ventasTurnoActivales.reduce((s, v) => s + v.total, 0) * 100
    ) / 100;
    return calcularResumenCierreTurno({
      baseInicialCaja,
      totalVentasLocales,
      totalVentasSistema: totalVentasEnTurno,
      mediosVentas: m,
      totalIngresoEfectivo,
      totalRetiroEfectivo,
    });
  }, [
    cierreCamposDesdeVentas,
    baseInicialCaja,
    ventasTurnoActivales,
    totalVentasEnTurno,
    totalIngresoEfectivo,
    totalRetiroEfectivo,
  ]);

  const registrarMovimientoCaja = useCallback(
    (input: { tipo: TipoMovimientoCaja; monto: number; motivo: string }) => {
      const monto = Math.round(input.monto * 100) / 100;
      const motivo = input.motivo.trim();
      if (!(monto > 0) || !motivo) {
        return { ok: false as const, message: "Indica un monto mayor a cero y un motivo para el movimiento." };
      }
      const nombreDisplay =
        cajeroTurnoActivo?.nombreDisplay?.trim() ||
        (user?.email?.trim() ? `Franquiciado · ${user.email.trim()}` : "Usuario POS");
      const mov = crearMovimientoCajaTurno({
        tipo: input.tipo,
        monto,
        motivo,
        uid: user?.uid,
        nombreDisplay,
        email: user?.email,
      });
      setMovimientosCaja((prev) => [mov, ...prev]);
      return { ok: true as const };
    },
    [cajeroTurnoActivo?.nombreDisplay, user?.uid, user?.email]
  );

  const ejecutarCierreTurnoDefinitivo = useCallback(
    async (correoInforme?: { para: string; cc?: string }) => {
    const pv = user?.puntoVenta?.trim();
    const uid = user?.uid;
    if (!uid || !pv) {
      window.alert("No hay sesión o punto de venta para guardar el turno.");
      return;
    }
    setProcesandoCierreTurno(true);
    try {
      const tokenCierre = await auth?.currentUser?.getIdToken();
      if (!tokenCierre) {
        window.alert("No hay sesión válida para cerrar el turno en el servidor. Volvé a iniciar sesión e intentá de nuevo.");
        return;
      }
      const cerrarWms = await wmsTurnosCerrar(tokenCierre, {
        uen: "Maria Chorizos",
        plataformaMovil: "POS GEB",
      });
      if (!cerrarWms.ok) {
        window.alert(
          cerrarWms.error ||
            "No se pudo cerrar el turno en el administrativo (ingreso diario). El turno sigue abierto en el servidor hasta que esto responda bien."
        );
        return;
      }

      const {
        efectivoEsperadoCaja: efectivoReal,
        tarjeta,
        pagosLinea,
        otros: otrosMedios,
        totalCierreLocal,
      } = valoresCierreCajaSegunVentas;
    const totalEsperado = valoresCierreCajaSegunVentas.totalCierreSistema;
    const diferencia = totalCierreLocal - totalEsperado;

    const fin = new Date();
    const ventasPv = listarVentasPuntoVenta(uid, pv);
    const ventasTurnoTodas = ventasDelTurnoParaCierre(ventasPv, turnoSesionId, turnoInicio, fin);
    const ventasTurno = filtrarVentasVigentes(ventasTurnoTodas);
    const mediosRows: MediosPagoVentaGuardados[] = ventasTurno
      .map((v) => v.mediosPago)
      .filter((m): m is MediosPagoVentaGuardados => Boolean(m));
    const totalesMediosVentas = mediosRows.length
      ? sumarMediosPagoVentas(mediosRows)
      : ({
          efectivo: 0,
          tarjeta: 0,
          pagosLinea: 0,
          otros: 0,
          detalleLineas: [] as { tipo: string; monto: number }[],
        } satisfies MediosPagoVentaGuardados);
    const totalVentasRegistradas = ventasTurno.reduce((s, v) => s + v.total, 0);
    const agregadoProductos = agregarProductosEnVentas(ventasTurno);
    const cr = cajeroTurnoActivo;

    const registro: TurnoCerradoV1 = {
      version: 1,
      id: nuevoTurnoSesionId(),
      turnoSesionId: turnoSesionId.trim() || "legacy",
      uid,
      puntoVenta: pv,
      inicioIso: turnoInicio.toISOString(),
      cierreIso: fin.toISOString(),
      emailSesion: user?.email ?? undefined,
      cajero: cr
        ? { id: cr.id, nombreDisplay: cr.nombreDisplay, documento: cr.documento }
        : { id: "—", nombreDisplay: "—", documento: "" },
      baseInicialCaja,
      totalVentasRegistradas,
      numTickets: ventasTurno.length,
      ventasCredito,
      totalIngresoEfectivo,
      totalRetiroEfectivo,
      movimientosCaja: [...movimientosCaja],
      totalesMediosVentas,
      cierre: {
        efectivoReal,
        tarjeta,
        pagosLinea,
        otrosMedios,
        totalIngresado: totalCierreLocal,
        totalEsperado,
        diferencia,
      },
      metricsPrecuentas: {
        precuentasEliminadas: precuentasEliminadasCount,
        productosEliminados: productosEliminadosCount,
        valorProductosEliminados,
      },
      ventas: ventasTurnoTodas.map((v) => ({ ...v })),
      agregadoProductos,
    };

    appendTurnoCerrado(uid, pv, registro);
    const txt = textoInformeTurno(registro);
    triggerDescargaTexto(nombreArchivoInformeTurno(registro), txt);
    const pdfDoc = crearPdfDetalleTurno(registro);
    const pdfBase64 = pdfDoc.output("datauristring").split(",", 2)[1] || "";
    const textoCorreo = textoResumenCorreoCierreTurno(registro);

    try {
      const tokenMail = await auth?.currentUser?.getIdToken();
      if (tokenMail) {
        const r = await fetch("/api/pos_turno_informe_correo", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${tokenMail}`,
          },
          body: JSON.stringify({
            subject: `Informe cierre turno ${pv} · ${fechaHoraColombia(fin)}`,
            text: textoCorreo,
            attachments: pdfBase64
              ? [
                  {
                    filename: nombreArchivoDetalleTurnoPdf(registro),
                    contentBase64: pdfBase64,
                    contentType: "application/pdf",
                  },
                ]
              : [],
            ...(correoInforme?.para?.trim()
              ? { to: correoInforme.para.trim(), ...(correoInforme.cc?.trim() ? { cc: correoInforme.cc.trim() } : {}) }
              : {}),
          }),
        });
        const data = (await r.json().catch(() => ({}))) as { ok?: boolean; message?: string };
        if (!r.ok || !data.ok) {
          const msg = data.message ?? "";
          const faltaConfigServidor =
            r.status === 503 && /no configurado|Firebase Admin no está/i.test(msg);
          if (faltaConfigServidor) {
            window.alert(
              "El informe ya se descargó en tu equipo. No se envió por correo: en el servidor falta configuración (correo SMTP/Zoho/Resend y/o Firebase Admin). Quien administre Vercel debe revisar las variables de entorno del POS."
            );
          } else {
            window.alert(msg || "No se pudo enviar el correo con el informe.");
          }
        } else if (correoInforme?.para?.trim()) {
          const msg = mensajeExitoMotivacionalInformeCierreTurno();
          const parts = msg
            .split("\n")
            .map((x) => x.trim())
            .filter(Boolean);
          const [titulo, ...lineas] = parts;
          setModalExitoCierreTurno({
            titulo: titulo || "Turno cerrado con éxito",
            lineas,
          });
        }
      } else if (correoInforme?.para?.trim()) {
        window.alert("No hay sesión válida para enviar el correo. Vuelve a iniciar sesión e intenta de nuevo.");
      }
    } catch (e) {
      console.warn("Informe turno: correo no enviado (red o servidor).", e);
      if (correoInforme?.para?.trim()) {
        window.alert(
          "El informe se descargó, pero no se pudo enviar el correo (red o error del servidor). Revisa conexión o inténtalo más tarde."
        );
      }
    }

    if (correoInforme?.para?.trim()) {
      try {
        if (typeof window !== "undefined") {
          localStorage.setItem(LS_INFORME_TURNO_PARA, correoInforme.para.trim());
          if (correoInforme.cc?.trim()) {
            localStorage.setItem(LS_INFORME_TURNO_CC, correoInforme.cc.trim());
          } else {
            localStorage.removeItem(LS_INFORME_TURNO_CC);
          }
        }
      } catch {
        /* ignore */
      }
    }

    limpiarTurnoPersistido(uid, pv);
    wmsAlineadoTrasRestauracionRef.current = false;
    setTurnoAbierto(false);
    setCajeroTurnoActivo(null);
    setTotalVentasEnTurno(0);
    setMovimientosCaja([]);
    setVentasCredito(0);
    setPrecuentasEliminadasCount(0);
    setProductosEliminadosCount(0);
    setValorProductosEliminados(0);
    setBaseInicialCaja(0);
    setTurnoSesionId("");
    setShowModalCierreTurno(false);
    } finally {
      setProcesandoCierreTurno(false);
    }
  }, [
    user,
    valoresCierreCajaSegunVentas,
    baseInicialCaja,
    totalVentasEnTurno,
    turnoSesionId,
    turnoInicio,
    ventasCredito,
    totalIngresoEfectivo,
    totalRetiroEfectivo,
    movimientosCaja,
    precuentasEliminadasCount,
    productosEliminadosCount,
    valorProductosEliminados,
    cajeroTurnoActivo,
    auth,
  ]);

  const abrirModalInformeCierreCorreo = useCallback(async () => {
    setModalInformeCierreCorreoAbierto(true);
    setErrorInformeCierreCorreo(null);
    setCargandoDefaultsInformeCorreo(true);
    let para = "";
    let ccExtraGuardado = "";
    try {
      if (typeof window !== "undefined") {
        ccExtraGuardado = localStorage.getItem(LS_INFORME_TURNO_CC)?.trim() ?? "";
      }
      const token = await auth?.currentUser?.getIdToken();
      const pv = user?.puntoVenta?.trim();
      if (token && pv) {
        const r = await getFranquiciadoPorPuntoVenta(pv, token);
        if (r.ok) {
          const fromFicha = emailDesdeFichaFranquiciado(r.franquiciado ?? null);
          if (fromFicha) para = fromFicha;
        }
      }
      if (!para && typeof window !== "undefined") {
        para = localStorage.getItem(LS_INFORME_TURNO_PARA)?.trim() ?? "";
      }
      if (!para && user?.email?.trim()) para = user.email.trim();
    } finally {
      setEmailInformeCierrePara(para);
      setEmailInformeCierreCc(combinarCcInformeCierreTurno(ccExtraGuardado));
      setCargandoDefaultsInformeCorreo(false);
    }
  }, [user?.puntoVenta, user?.email]);

  const confirmarInformeCierreYcerrarTurno = useCallback(async () => {
    const para = emailInformeCierrePara.trim();
    if (!emailValidoSimple(para)) {
      setErrorInformeCierreCorreo("Ingresa un correo válido para el franquiciado.");
      return;
    }
    const ccFinal = combinarCcInformeCierreTurno(emailInformeCierreCc.trim());
    const partesCc = ccFinal.split(/[,;]/).map((x) => x.trim()).filter(Boolean);
    if (!partesCc.every((p) => emailValidoSimple(p))) {
      setErrorInformeCierreCorreo("Revisa los correos en «Con copia».");
      return;
    }
    setErrorInformeCierreCorreo(null);
    await ejecutarCierreTurnoDefinitivo({ para, cc: ccFinal });
    setModalInformeCierreCorreoAbierto(false);
  }, [emailInformeCierrePara, emailInformeCierreCc, ejecutarCierreTurnoDefinitivo]);

  const agregarPrecuenta = () => {
    const nextNum = precuentas.length + 1;
    const id = String(Date.now());
    setPrecuentas((prev) => [...prev, { id, nombre: `Pre-cuenta ${nextNum}` }]);
    setItemsPorPrecuenta((prev) => ({ ...prev, [id]: [] }));
    setClientePorPrecuenta((prev) => ({
      ...prev,
      [id]: { id: CONSUMIDOR_FINAL_ID, nombreDisplay: "Consumidor final" },
    }));
    setActivePrecuentaId(id);
  };

  const cerrarPrecuenta = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (precuentas.length <= 1) return;
    const items = itemsPorPrecuenta[id] ?? [];
    const numProductos = items.reduce((s, i) => s + i.cantidad, 0);
    const valor = items.reduce((s, i) => s + totalLineaItem(i), 0);
    setPrecuentasEliminadasCount((prev) => prev + 1);
    setProductosEliminadosCount((prev) => prev + numProductos);
    setValorProductosEliminados((prev) => prev + valor);
    const idx = precuentas.findIndex((p) => p.id === id);
    if (idx < 0) return;
    const next = precuentas.filter((p) => p.id !== id);
    setPrecuentas(next);
    setClientePorPrecuenta((prev) => {
      const nextC = { ...prev };
      delete nextC[id];
      return nextC;
    });
    setItemsPorPrecuenta((prev) => {
      const nextData = { ...prev };
      delete nextData[id];
      return nextData;
    });
    if (activePrecuentaId === id) {
      setActivePrecuentaId(next[idx === 0 ? 1 : idx - 1]!.id);
    }
    setEditingPrecuentaId((prev) => (prev === id ? null : prev));
  };

  const iniciarEdicionNombre = (id: string) => {
    const p = precuentas.find((x) => x.id === id);
    if (p) {
      setEditingPrecuentaId(id);
      setEditingNombre(p.nombre);
    }
  };

  const guardarNombrePrecuenta = (id: string) => {
    const nombre = editingNombre.trim() || "Pre-cuenta";
    setPrecuentas((prev) =>
      prev.map((p) => (p.id === id ? { ...p, nombre } : p))
    );
    setEditingPrecuentaId(null);
    setEditingNombre("");
  };

  /** Clic en catálogo: chorizo + arepa, chorizo con pan, o arepa de peto (solo tipo de arepa) */
  const onClicProductoCatalogo = (producto: ProductoPOS) => {
    if (!turnoAbierto) return;
    if (productoRequiereTamanoBebida(producto)) {
      const primera = producto.variantes?.[0]?.clave ?? "";
      setVarianteModalBebida(primera);
      setModalProductoBebida(producto);
      return;
    }
    if (productoRequiereChorizoYArepa(producto)) {
      setVarianteModalChorizo("tradicional");
      setVarianteModalArepa("arepa_queso");
      setModalProductoChorizo(producto);
      return;
    }
    if (productoRequiereSoloChorizoPan(producto)) {
      setVarianteModalChorizo("tradicional");
      setModalProductoChorizo(producto);
      return;
    }
    if (productoRequiereSoloTipoArepaPeto(producto)) {
      setVarianteModalArepa("arepa_queso");
      setModalProductoChorizo(producto);
      return;
    }
    agregarProductoACuenta(producto);
  };

  /** Agregar producto a la cuenta (variantes opcionales: chorizo y/o arepa en combo) */
  const agregarProductoACuenta = (producto: ProductoPOS, opts?: OpcionesVariantesLineaPos) => {
    const lineId = buildLineIdPos(producto.sku, opts);
    const precioVariante =
      opts?.variantes?.length && producto.preciosPorVariante
        ? producto.preciosPorVariante[opts.variantes[0] ?? ""]
        : undefined;
    setItemsPorPrecuenta((prev) => {
      const items = prev[activePrecuentaId] ?? [];
      const idx = items.findIndex((i) => i.lineId === lineId);
      const next = [...items];
      if (idx >= 0) {
        next[idx] = { ...next[idx]!, cantidad: next[idx]!.cantidad + 1 };
      } else {
        next.push({
          lineId,
          producto,
          cantidad: 1,
          ...(opts?.varianteChorizo ? { varianteChorizo: opts.varianteChorizo } : {}),
          ...(opts?.varianteArepaCombo ? { varianteArepaCombo: opts.varianteArepaCombo } : {}),
          ...(opts?.variantes?.length ? { variantes: [...opts.variantes] } : {}),
          ...(typeof precioVariante === "number" && Number.isFinite(precioVariante)
            ? { precioUnitarioOverride: precioVariante }
            : {}),
        });
      }
      return { ...prev, [activePrecuentaId]: next };
    });
  };

  const confirmarAgregarChorizoModal = () => {
    if (!modalProductoChorizo) return;
    const p = modalProductoChorizo;
    if (productoRequiereChorizoYArepa(p)) {
      agregarProductoACuenta(p, {
        varianteChorizo: varianteModalChorizo,
        varianteArepaCombo: varianteModalArepa,
      });
    } else if (productoRequiereSoloTipoArepaPeto(p)) {
      agregarProductoACuenta(p, { varianteArepaCombo: varianteModalArepa });
    } else {
      agregarProductoACuenta(p, { varianteChorizo: varianteModalChorizo });
    }
    setModalProductoChorizo(null);
  };

  const confirmarAgregarBebidaModal = () => {
    if (!modalProductoBebida || !varianteModalBebida) return;
    agregarProductoACuenta(modalProductoBebida, { variantes: [varianteModalBebida] });
    setModalProductoBebida(null);
  };

  const itemsCuentaActiva = itemsPorPrecuenta[activePrecuentaId] ?? [];
  const totalCuentaActiva = itemsCuentaActiva.reduce((sum, i) => sum + totalLineaItem(i), 0);

  const construirPayloadTicket = useCallback(
    (titulo: string, items: ItemCuenta[], notaPie?: string): TicketVentaPayload | null => {
      const pv = user?.puntoVenta?.trim();
      if (!pv) return null;
      const total = items.reduce((s, i) => s + totalLineaItem(i), 0);
      const nombrePrecuenta = precuentas.find((p) => p.id === activePrecuentaId)?.nombre ?? "Cuenta";
      const vendedorTicket =
        cajeroTurnoActivo?.nombreDisplay?.trim() || user?.email?.split("@")[0]?.trim() || "—";
      return {
        titulo,
        puntoVenta: pv,
        precuentaNombre: nombrePrecuenta,
        fechaHora: fechaHoraColombia(new Date()),
        clienteNombre: clienteActivoPrecuenta.nombreDisplay,
        tipoComprobanteLabel: etiquetaTipoComprobanteTicket(tipoComprobante),
        vendedorLabel: vendedorTicket,
        lineas: lineasTicketDesdeItemsCuenta(items),
        total,
        ...(notaPie ? { notaPie } : {}),
      };
    },
    [
      user?.puntoVenta,
      user?.email,
      activePrecuentaId,
      precuentas,
      cajeroTurnoActivo?.nombreDisplay,
      clienteActivoPrecuenta,
      tipoComprobante,
    ]
  );

  const handleProductoParaLlevar = useCallback(async () => {
    if (!user || esContadorInvitado(user.role)) return;
    const pv = user.puntoVenta?.trim();
    if (!pv) {
      window.alert("No hay punto de venta asignado.");
      return;
    }
    if (itemsCuentaActiva.length === 0) {
      window.alert("Agrega productos a la cuenta antes de marcar para llevar.");
      return;
    }
    if (!turnoAbierto) {
      window.alert("Abre el turno para registrar el consumo de empaques.");
      return;
    }
    setAplicandoParaLlevar(true);
    try {
      const catalog = await cargarCatalogoInventarioUnificado(pv);
      const bolsa = insumoBolsaPapelParaLlevarResolver(catalog, skuBolsaPapelParaLlevarEnv());
      const sticker = insumoStickerDomicilioParaLlevarResolver(catalog, skuStickerDomicilioParaLlevarEnv());
      if (!bolsa && !sticker) {
        window.alert(
          "No se encontró en el catálogo de este punto ni la bolsa de papel ni el sticker de domicilio. " +
            "Revisá que existan en la hoja de insumos o Firestore (p. ej. descripción con «bolsa» y «papel», y «sticker» y «domicilio»). " +
            "Opcional: definí NEXT_PUBLIC_POS_SKU_BOLSA_PAPEL y NEXT_PUBLIC_POS_SKU_STICKER_DOMICILIO en el despliegue con el SKU exacto."
        );
        return;
      }
      if (bolsa && sticker && bolsa.id === sticker.id) {
        window.alert(
          "El catálogo resolvió el mismo ítem para bolsa y sticker. Revisá los SKU en variables de entorno o los nombres en la hoja de insumos."
        );
        return;
      }
      const nombrePrecuenta = precuentas.find((p) => p.id === activePrecuentaId)?.nombre ?? "Cuenta";
      const notasBase = `Para llevar · ${nombrePrecuenta}`.slice(0, 420);
      const partesOk: string[] = [];
      if (bolsa) {
        const r1 = await registrarMovimientoInventario({
          puntoVenta: pv,
          insumo: bolsa,
          tipo: "consumo_interno",
          cantidad: 1,
          notas: `${notasBase} · bolsa papel`.slice(0, 500),
          uid: user.uid,
          email: user.email ?? null,
          permitirNegativo: false,
        });
        if (!r1.ok) {
          window.alert(r1.message ?? "No se pudo descontar la bolsa de papel.");
          return;
        }
        partesOk.push("−1 bolsa de papel");
      }
      if (sticker) {
        const r2 = await registrarMovimientoInventario({
          puntoVenta: pv,
          insumo: sticker,
          tipo: "consumo_interno",
          cantidad: 1,
          notas: `${notasBase} · sticker domicilio`.slice(0, 500),
          uid: user.uid,
          email: user.email ?? null,
          permitirNegativo: false,
        });
        if (!r2.ok) {
          window.alert(
            `${r2.message ?? "No se pudo descontar el sticker."}${
              partesOk.length ? ` Ya se aplicó: ${partesOk.join(" y ")}. Revisá inventario si hace falta un ajuste.` : ""
            }`
          );
          return;
        }
        partesOk.push("−1 sticker de domicilio");
      }
      const faltantes: string[] = [];
      if (!bolsa) faltantes.push("bolsa de papel (no hallada en catálogo)");
      if (!sticker) faltantes.push("sticker de domicilio (no hallado en catálogo)");
      const msgBase = `Para llevar registrado en inventario: ${partesOk.join(" y ")}.`;
      window.alert(
        faltantes.length
          ? `${msgBase}\n\nNo se descontó: ${faltantes.join("; ")}. Podés definir los SKU en Vercel o ajustar nombres en la hoja.`
          : msgBase
      );
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "No se pudo actualizar el inventario.");
    } finally {
      setAplicandoParaLlevar(false);
    }
  }, [user, itemsCuentaActiva, turnoAbierto, precuentas, activePrecuentaId]);

  const antesActivarClienteFrecuente = useCallback(async (): Promise<{ ok: true } | { ok: false; message: string }> => {
    if (!user || esContadorInvitado(user.role)) {
      return { ok: false, message: "Tu perfil no puede registrar este movimiento." };
    }
    const pv = user.puntoVenta?.trim();
    if (!pv) return { ok: false, message: "No hay punto de venta asignado." };
    const sku = skuStickerFidelizacion();
    /** Sin SKU en el despliegue (p. ej. Vercel): el QR de fidelización sigue activo; no se descuenta inventario. */
    if (!sku) {
      return { ok: true };
    }
    if (!turnoAbierto) {
      return { ok: false, message: "Abrí el turno para descontar el sticker de fidelización en inventario." };
    }
    try {
      const catalog = await cargarCatalogoInventarioUnificado(pv);
      const insumo = insumoKitDesdeCatalogoPorSku(catalog, sku);
      if (!insumo) {
        return {
          ok: false,
          message: `No está en el catálogo de este punto de venta el SKU «${sku}» (sticker de fidelización). Revisá la hoja o Firestore.`,
        };
      }
      const nombrePrecuenta = precuentas.find((p) => p.id === activePrecuentaId)?.nombre ?? "Cuenta";
      const notasBase = `Cliente frecuente · ${nombrePrecuenta}`.slice(0, 420);
      const r = await registrarMovimientoInventario({
        puntoVenta: pv,
        insumo,
        tipo: "consumo_interno",
        cantidad: 1,
        notas: `${notasBase} · sticker fidelización`.slice(0, 500),
        uid: user.uid,
        email: user.email ?? null,
        permitirNegativo: false,
      });
      if (!r.ok) return { ok: false, message: r.message ?? "No se pudo descontar el sticker de fidelización." };
      return { ok: true };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : "No se pudo actualizar el inventario." };
    }
  }, [user, turnoAbierto, precuentas, activePrecuentaId]);

  /** Devuelve 1 sticker de fidelización si se descontó al marcar cliente frecuente y luego se cancela desde la vista previa. */
  const revertirStickerFidelizacionTrasCancelarVistaPrevia = useCallback(async () => {
    if (!user || esContadorInvitado(user.role)) return;
    const pv = user.puntoVenta?.trim();
    if (!pv) return;
    const sku = skuStickerFidelizacion();
    if (!sku) return;
    try {
      const catalog = await cargarCatalogoInventarioUnificado(pv);
      const insumo = insumoKitDesdeCatalogoPorSku(catalog, sku);
      if (!insumo) {
        console.warn("[POS] Cancelar vista previa: no se pudo devolver sticker fidelización (SKU no en catálogo).");
        return;
      }
      const notas = "Reversión sticker fidelización · cancelación vista previa comprobante".slice(0, 500);
      const r = await registrarMovimientoInventario({
        puntoVenta: pv,
        insumo,
        tipo: "ajuste_positivo",
        cantidad: 1,
        notas,
        uid: user.uid,
        email: user.email ?? null,
        permitirNegativo: false,
      });
      if (!r.ok) {
        console.warn("[POS] Cancelar vista previa: no se pudo devolver sticker fidelización:", r.message);
      }
    } catch (e) {
      console.warn("[POS] Cancelar vista previa: error al devolver sticker fidelización.", e);
    }
  }, [user]);

  useEffect(() => {
    if (itemsCuentaActiva.length === 0) setSidebarResumenExpandido(false);
  }, [itemsCuentaActiva.length]);

  const cambiarCantidad = (lineId: string, delta: number) => {
    setItemsPorPrecuenta((prev) => {
      const items = prev[activePrecuentaId] ?? [];
      const next = items
        .map((it) =>
          it.lineId === lineId ? { ...it, cantidad: Math.max(0, it.cantidad + delta) } : it
        )
        .filter((it) => it.cantidad > 0);
      return { ...prev, [activePrecuentaId]: next };
    });
  };

  const quitarItem = (lineId: string) => {
    setItemsPorPrecuenta((prev) => {
      const items = (prev[activePrecuentaId] ?? []).filter((i) => i.lineId !== lineId);
      return { ...prev, [activePrecuentaId]: items };
    });
  };

  const guardarItemCuentaEditado = (actualizado: ItemCuenta) => {
    setItemsPorPrecuenta((prev) => {
      const items = [...(prev[activePrecuentaId] ?? [])];
      const idx = items.findIndex((i) => i.lineId === actualizado.lineId);
      if (idx < 0) return prev;
      items[idx] = actualizado;
      return { ...prev, [activePrecuentaId]: items };
    });
  };

  const vaciarCuenta = useCallback(() => {
    setItemsPorPrecuenta((prev) => ({ ...prev, [activePrecuentaId]: [] }));
  }, [activePrecuentaId]);

  const pedirConfirmacionCobroSinInternet = useCallback((): Promise<boolean> => {
    return new Promise((resolve) => {
      resolverCobroSinInternetRef.current = resolve;
      setModalCobroSinInternetAbierto(true);
    });
  }, []);

  const cerrarModalCobroSinInternet = useCallback((aceptar: boolean) => {
    setModalCobroSinInternetAbierto(false);
    const r = resolverCobroSinInternetRef.current;
    resolverCobroSinInternetRef.current = null;
    r?.(aceptar);
  }, []);

  const ejecutarImpresionPostCobro = useCallback(async (ticket: TicketVentaPayload) => {
    const prefs = loadImpresionPrefs();
    setCobroImpresionOverlayOpen(true);
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });
    const overlayInicio = Date.now();
    try {
      if (prefs.metodo === "directa") {
        try {
          await imprimirTicketConQz(prefs, ticket);
        } catch (qzErr) {
          console.warn("Ticket venta: QZ falló, intentando navegador.", qzErr);
          imprimirTicketEnNavegador(ticket);
        }
      } else {
        imprimirTicketEnNavegador(ticket);
      }
    } catch (printErr) {
      console.error(printErr);
      window.alert(
        printErr instanceof Error
          ? `Venta registrada. No se pudo imprimir: ${printErr.message}`
          : "Venta registrada. Revisa la impresión."
      );
    } finally {
      const restante = Math.max(0, MIN_COBRO_IMPRESION_OVERLAY_MS - (Date.now() - overlayInicio));
      if (restante > 0) {
        await new Promise((r) => setTimeout(r, restante));
      }
      setCobroImpresionOverlayOpen(false);
    }
  }, []);

  const handleCancelarTransaccionVistaPrevia = useCallback(async () => {
    const pack = previsualizacionCobro;
    if (!pack || !user?.uid?.trim()) return;
    const pv = user.puntoVenta?.trim();
    if (!pv) {
      window.alert("No hay punto de venta asignado.");
      return;
    }
    const okConfirm = window.confirm(
      "¿Anular por completo esta venta?\n\n" +
        "Se devolverán los productos a la cuenta actual y se marcará el recibo como anulado. " +
        "El inventario por ensamble aún no se había descontado (se aplica al pulsar «Imprimir»), así que no hay reversión de stock de productos.\n\n" +
        "Si activaste «Cliente frecuente», se devolverá el sticker en inventario. " +
        "El reporte de venta ya enviado a red / WMS no se revierte solo; coordiná con soporte si hace falta."
    );
    if (!okConfirm) return;

    setCancelandoTransaccionVistaPrevia(true);
    try {
      if (pack.ventaLocalId) {
        const r = await anularVentaEnEquipoInventarioYNube({
          uid: user.uid,
          email: user.email ?? null,
          puntoVenta: pv,
          ventaId: pack.ventaLocalId,
          motivo: "Cancelación desde vista previa del comprobante (error del cajero).",
          omitirDevolucionInventarioPos: true,
        });
        if (!r.ok) {
          window.alert(r.message);
          return;
        }
        if (turnoAbierto && r.venta.turnoSesionId?.trim() === turnoSesionId.trim()) {
          const nextTot = Math.max(0, totalVentasEnTurnoRef.current - r.venta.total);
          setTotalVentasEnTurno(nextTot);
          void (async () => {
            const t = await auth?.currentUser?.getIdToken();
            if (t) await wmsTurnosSincronizarSilent(t, nextTot);
          })();
        }
      } else {
        window.alert(
          "No hay id de venta local para registrar la anulación en el historial. Se restauró la cuenta y se ajustó el total del turno en pantalla; revisá «Últimos recibos», inventario y reportes con soporte si los números no cuadran."
        );
        const nextTot = Math.max(0, totalVentasEnTurnoRef.current - pack.total);
        setTotalVentasEnTurno(nextTot);
        void (async () => {
          const t = await auth?.currentUser?.getIdToken();
          if (t) await wmsTurnosSincronizarSilent(t, nextTot);
        })();
      }

      if (pack.incluirQrClienteFrecuente) {
        await revertirStickerFidelizacionTrasCancelarVistaPrevia();
      }

      setItemsPorPrecuenta((prev) => ({
        ...prev,
        [activePrecuentaId]: clonarItemsCuenta(pack.itemsRestaurar),
      }));
      setPrevisualizacionCobro(null);
    } finally {
      setCancelandoTransaccionVistaPrevia(false);
    }
  }, [
    previsualizacionCobro,
    user,
    turnoAbierto,
    turnoSesionId,
    activePrecuentaId,
    revertirStickerFidelizacionTrasCancelarVistaPrevia,
  ]);

  const ejecutarAplicarVentaEnsambleWmsDesdeBody = useCallback(async (bodyEnsamble: WmsAplicarVentaEnsambleBody) => {
    const idEnsamble = bodyEnsamble.idVenta ?? "ens-sin-id";
    const pv = bodyEnsamble.puntoVenta ?? "";
    let ultimoEnsamble: WmsAplicarVentaEnsambleResult = {
      ok: false,
      status: 0,
      error: "Ensamble no ejecutado",
    };
    try {
      const tokenEns = await auth?.currentUser?.getIdToken();
      if (!tokenEns) {
        ultimoEnsamble = { ok: false, status: 401, error: "Sin token de sesión para ensamble." };
      } else {
        let rEns = await aplicarVentaEnsambleWms(tokenEns, bodyEnsamble);
        if (!rEns.ok && (rEns.status === 0 || rEns.status >= 500)) {
          await new Promise((r) => setTimeout(r, 1500));
          const t2 = await auth?.currentUser?.getIdToken();
          if (t2) rEns = await aplicarVentaEnsambleWms(t2, bodyEnsamble);
        }
        ultimoEnsamble = rEns;
        if (!rEns.ok) {
          if (rEns.status === 0 || rEns.status >= 500) {
            encolarAplicarEnsamblePendiente(bodyEnsamble);
          }
          window.alert(mensajeAplicarEnsambleParaCajero(rEns));
        } else {
          const aplicados = contarAplicadosEnsambleReportados(rEns);
          if (aplicados === 0) {
            window.alert(mensajeEnsambleOkSinDescuentoInventario(rEns));
          } else if (aplicados === null) {
            console.warn(
              "[POS] Ensamble WMS: respuesta OK pero sin campo «aplicados». Revisá Inventarios → Diagnóstico último cobro, Firebase projectId y que DB_POS_Composición use el mismo SKU/variante que el POS.",
              rEns
            );
          }
        }
      }
    } catch (e) {
      console.warn("aplicar-venta-ensamble", e);
      ultimoEnsamble = {
        ok: false,
        status: 0,
        error: e instanceof Error ? e.message : String(e),
      };
      encolarAplicarEnsamblePendiente(bodyEnsamble);
      window.alert(
        "La venta quedó registrada en caja, pero hubo un error al sincronizar el inventario por ensamble. Se reintentará automáticamente cuando haya conexión."
      );
    } finally {
      guardarUltimoEnsambleEnSesion(bodyEnsamble, ultimoEnsamble);
      console.info("[POS] aplicar-venta-ensamble", {
        idVenta: idEnsamble,
        puntoVenta: pv,
        skus: bodyEnsamble.lineas.map((l) => l.skuProducto),
        ...ultimoEnsamble,
      });
    }
  }, []);

  type OpcionesCobroVenta = { notaPie?: string; detallePago?: DetallePagoConfirmado };

  const ejecutarCobroVenta = useCallback(
    async (itemsSnap: ItemCuenta[], opts?: OpcionesCobroVenta): Promise<boolean> => {
      if (!user || esContadorInvitado(user.role)) return false;
      if (!turnoAbierto) return false;
      const pv = user.puntoVenta?.trim();
      if (!pv) {
        window.alert("No hay punto de venta asignado.");
        return false;
      }

      const notaPie =
        opts?.notaPie ??
        (opts?.detallePago ? construirNotaPiePago(opts.detallePago) : undefined);
      const mediosPagoRaw =
        opts?.detallePago != null ? mediosPagoDesdeDetalle(opts.detallePago) : undefined;
      const sid = turnoSesionId.trim();

      const total = itemsSnap.reduce((s, i) => s + totalLineaItem(i), 0);
      if (!(total > 0)) return false;
      const mediosPago =
        mediosPagoRaw != null ? normalizarMediosPagoVenta(mediosPagoRaw, total) : undefined;

      setCobrando(true);
      try {
        const ct = cajeroTurnoActivo;
        const cr = clienteActivoPrecuenta;
        const filaVenta: VentaReporte = {
          puntoVenta: pv,
          valorVenta: total,
          tipoComprobante,
          ...(ct
            ? {
                cajeroTurnoId: ct.id,
                cajeroNombre: ct.nombreDisplay,
                ...(ct.documento ? { cajeroDocumento: ct.documento } : {}),
              }
            : {}),
        };
        if (cr.id === CONSUMIDOR_FINAL_ID) {
          filaVenta.clienteNombre = "Consumidor final";
        } else {
          filaVenta.clienteId = cr.id;
          filaVenta.clienteNombre = cr.nombreDisplay;
          if (cr.tipoIdentificacion?.trim()) filaVenta.clienteTipoIdentificacion = cr.tipoIdentificacion.trim();
          if (cr.numeroIdentificacion?.trim()) filaVenta.clienteNumeroIdentificacion = cr.numeroIdentificacion.trim();
        }

        const payloadWms = {
          fecha: ymdColombia(),
          uen: "Maria Chorizos",
          ventas: [filaVenta],
        };

        const resultado = await enviarReporteVenta(payloadWms);

        let ventaSoloEnPos = false;
        if (resultado.estado !== "exito") {
          if (esErrorRedVenta(resultado.mensaje)) {
            const continuar = await pedirConfirmacionCobroSinInternet();
            if (!continuar) {
              window.alert(mensajeErrorVentaParaUsuario(resultado.mensaje));
              return false;
            }
            ventaSoloEnPos = true;
            encolarVentaPendienteWms(payloadWms);
            void procesarColaVentasPendientesWms();
          } else {
            window.alert(mensajeErrorVentaParaUsuario(resultado.mensaje));
            return false;
          }
        }

        setTotalVentasEnTurno((prev) => {
          const next = prev + total;
          totalVentasEnTurnoRef.current = next;
          return next;
        });
        const tokenTurnoSync = await auth?.currentUser?.getIdToken();
        if (tokenTurnoSync) void wmsTurnosSincronizarSilent(tokenTurnoSync, totalVentasEnTurnoRef.current);

        const notaPieTicket =
          ventaSoloEnPos && notaPie
            ? `${notaPie}\n[Cobro guardado en caja — pendiente de envío por internet]`
            : ventaSoloEnPos
              ? "[Cobro guardado en caja — pendiente de envío por internet]"
              : notaPie;

        const isoVenta = new Date().toISOString();
        const lineasVenta = itemsSnap.map((it) => {
          const li = lineInputDesdeItemCuentaLike(it);
          const sub = subtotalNetoLinea(li);
          const qty = Math.max(0.0001, it.cantidad);
          return {
            lineId: it.lineId,
            inventarioLookupKey: it.lineId,
            sku: it.producto.sku,
            descripcion: it.producto.descripcion,
            cantidad: it.cantidad,
            precioUnitario: Math.round((sub / qty) * 100) / 100,
            detalleVariante: detalleVarianteTicketLinea(it),
          };
        });

        const ventaLocalId = appendVentaLocal(user.uid, {
          fechaYmd: ymdColombia(),
          isoTimestamp: isoVenta,
          puntoVenta: pv,
          total,
          ...(sid ? { turnoSesionId: sid } : {}),
          lineas: lineasVenta,
          ...(ct
            ? {
                cajeroTurnoId: ct.id,
                cajeroNombre: ct.nombreDisplay,
              }
            : {}),
          ...(notaPieTicket ? { pagoResumen: notaPieTicket } : {}),
          ...(mediosPago ? { mediosPago } : {}),
        });

        const bebidasInventarioDirecto = itemsSnap.filter(itemCuentaEsBebidaConInventarioDirecto);
        if (bebidasInventarioDirecto.length > 0) {
          const catalogoInventario = await cargarCatalogoInventarioUnificado(pv);
          const fallosBebidas: string[] = [];
          for (const item of bebidasInventarioDirecto) {
            const insumo = insumoKitDesdeCatalogoPorSku(catalogoInventario, item.lineId);
            if (!insumo) {
              fallosBebidas.push(item.lineId);
              continue;
            }
            const detalleVariante = detalleVarianteTicketLinea(item);
            const notasBebida = `Venta POS bebida${detalleVariante ? ` · ${detalleVariante}` : ""}`.slice(0, 500);
            const rBebida = await registrarMovimientoInventario({
              puntoVenta: pv,
              insumo,
              tipo: "consumo_interno",
              cantidad: item.cantidad,
              notas: notasBebida,
              uid: user.uid,
              email: user.email ?? null,
              permitirNegativo: false,
            });
            if (!rBebida.ok) {
              fallosBebidas.push(`${item.lineId}: ${rBebida.message ?? "error"}`);
            }
          }
          if (fallosBebidas.length > 0) {
            window.alert(
              `La venta se registró, pero no se pudo descontar inventario para estas bebidas: ${fallosBebidas.join(", ")}.`
            );
          }
        }

        let ensamblePendienteParaVista: WmsAplicarVentaEnsambleBody | null = null;
        const lineasEnsamble = lineasWmsEnsambleDesdeItemsCuenta(itemsSnap);
        const idEnsamble =
          ventaLocalId ?? `ens-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
        const prefsImpresionCobro = loadImpresionPrefs();
        const aplazarEnsambleHastaImprimir =
          prefsImpresionCobro.imprimirAutomaticoAlCobrar && lineasEnsamble.length > 0;
        if (lineasEnsamble.length > 0) {
          const bodyEnsamble: WmsAplicarVentaEnsambleBody = {
            lineas: lineasEnsamble,
            idVenta: idEnsamble,
            puntoVenta: pv,
          };
          if (aplazarEnsambleHastaImprimir) {
            ensamblePendienteParaVista = bodyEnsamble;
          } else {
            await ejecutarAplicarVentaEnsambleWmsDesdeBody(bodyEnsamble);
          }
        }

        if (ventaLocalId) {
          try {
            const tokenCloud = await auth?.currentUser?.getIdToken();
            if (tokenCloud) {
              const sync = await registrarVentaPosCloud(tokenCloud, {
                ventaLocalId,
                fechaYmd: ymdColombia(),
                isoTimestamp: isoVenta,
                puntoVenta: pv,
                total,
                lineas: lineasVenta,
                ...(sid ? { turnoSesionId: sid } : {}),
                ...(ct
                  ? {
                      cajeroTurnoId: ct.id,
                      cajeroNombre: ct.nombreDisplay,
                    }
                  : {}),
                ...(notaPieTicket ? { pagoResumen: notaPieTicket } : {}),
                ...(mediosPago ? { mediosPago } : {}),
                wmsSincronizado: !ventaSoloEnPos,
              });
              if (!sync.ok) {
                console.warn("Venta guardada en el equipo; nube POS:", sync.message ?? sync);
              }
            }
          } catch (e) {
            console.warn("Venta guardada en el equipo; no se pudo replicar en la nube del POS.", e);
          }
        }

        const ticketBase = construirPayloadTicket("TICKET DE VENTA", itemsSnap, notaPieTicket);
        if (!ticketBase) return false;

        let ticket = ticketBase;

        if (tipoComprobante === "factura_electronica") {
          const tokenFe = await auth?.currentUser?.getIdToken();
          if (tokenFe) {
            const lineasFe = itemsSnap.map((it) => {
              const varTxt = detalleVarianteTicketLinea(it);
              const desc = [it.producto.descripcion.trim(), varTxt].filter(Boolean).join(" · ");
              return {
                descripcion: (desc.slice(0, 500) || "Ítem").trim(),
                sku: it.producto.sku,
                cantidad: it.cantidad,
                montoConIva: totalLineaItem(it),
              };
            });
            let clienteNombreFe = "Consumidor final";
            let clienteNitFe = "222222222";
            let clienteTipoFe: string | undefined;
            if (cr.id !== CONSUMIDOR_FINAL_ID) {
              clienteNombreFe = cr.nombreDisplay.trim() || clienteNombreFe;
              clienteNitFe = (cr.numeroIdentificacion ?? "").trim() || clienteNitFe;
              clienteTipoFe = cr.tipoIdentificacion?.trim();
            }
            const payloadFe = {
              fecha: ymdColombia(),
              lineas: lineasFe,
              clienteNombre: clienteNombreFe,
              clienteNit: clienteNitFe,
              ...(clienteTipoFe ? { clienteTipoIdentificacion: clienteTipoFe } : {}),
              observaciones: notaPieTicket?.slice(0, 400),
              formaPago: opts?.detallePago ? construirNotaPiePago(opts.detallePago) : undefined,
              ventaLocalId: ventaLocalId ?? undefined,
            };
            const rFe = await wmsPosAlegraEmitirCobro(tokenFe, payloadFe);
            if (!rFe.ok) {
              encolarFeEmitirPendiente(user.uid, ventaLocalId, payloadFe);
              window.alert(
                `La venta se registró en caja, pero la factura electrónica no se pudo enviar a la DIAN:\n\n${rFe.error}\n\nSe reintentará automáticamente al recuperar conexión. Revisá también Más → Habilitaciones DIAN → Facturación electrónica o contactá a administración.`
              );
            } else {
              const feBlock = {
                numero: rFe.numeroFactura,
                cufe: rFe.alegraCufe,
                enviadoAt: rFe.enviadoAt,
              };
              if (ventaLocalId) {
                actualizarVentaLocalFacturaElectronica(user.uid, ventaLocalId, {
                  numero: feBlock.numero,
                  cufe: feBlock.cufe,
                  enviadoAt: feBlock.enviadoAt,
                });
              }
              ticket = { ...ticket, facturaElectronica: feBlock };
            }
          }
        }

        if (opts?.detallePago?.incluirQrClienteFrecuente) {
          const ventaIdFid =
            ventaLocalId ?? `pos-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
          const payloadJson = construirPayloadFidelizacionV1({
            ventaId: ventaIdFid,
            puntoVenta: pv,
            isoTimestamp: isoVenta,
            total,
            lineas: itemsSnap.map((it) => ({
              sku: it.producto.sku,
              cantidad: it.cantidad,
            })),
          });
          try {
            const dataUrl = await generarDataUrlQrFidelizacion(payloadJson);
            ticket = {
              ...ticket,
              fidelizacionQrDataUrl: dataUrl,
              fidelizacionPayloadTexto: payloadJson,
            };
          } catch (e) {
            console.warn("[POS] QR cliente frecuente:", e);
            ticket = { ...ticket, fidelizacionPayloadTexto: payloadJson };
          }
        }

        vaciarCuenta();

        const prefs = loadImpresionPrefs();
        if (prefs.imprimirAutomaticoAlCobrar) {
          setPrevisualizacionCobro({
            ticket,
            ventaLocalId: ventaLocalId ?? null,
            itemsRestaurar: clonarItemsCuenta(itemsSnap),
            total,
            ensamblePendiente: ensamblePendienteParaVista,
            incluirQrClienteFrecuente: Boolean(opts?.detallePago?.incluirQrClienteFrecuente),
          });
        }

        void procesarColaVentasPendientesWms();
        void procesarColaAplicarEnsamblePendiente(async () => (await auth?.currentUser?.getIdToken()) ?? null);
        void procesarColaFeEmitir(async () => (await auth?.currentUser?.getIdToken()) ?? null);

        return true;
      } finally {
        setCobrando(false);
      }
    },
    [
      user,
      turnoAbierto,
      turnoSesionId,
      cajeroTurnoActivo,
      clienteActivoPrecuenta,
      tipoComprobante,
      construirPayloadTicket,
      vaciarCuenta,
      pedirConfirmacionCobroSinInternet,
      ejecutarAplicarVentaEnsambleWmsDesdeBody,
    ]
  );

  const abrirRegistrarPago = () => {
    if (!user || esContadorInvitado(user.role)) return;
    if (!turnoAbierto || itemsCuentaActiva.length === 0) return;
    const pv = user.puntoVenta?.trim();
    if (!pv) {
      window.alert("No hay punto de venta asignado.");
      return;
    }
    const total = itemsCuentaActiva.reduce((s, i) => s + totalLineaItem(i), 0);
    if (!(total > 0)) return;
    setRegistrarPagoAbierto(true);
  };

  const handleConfirmarRegistrarPago = async (detalle: DetallePagoConfirmado) => {
    const itemsSnap = [...itemsCuentaActiva];
    const ok = await ejecutarCobroVenta(itemsSnap, { detallePago: detalle });
    if (ok) setRegistrarPagoAbierto(false);
  };

  const confirmarAbrirTurno = useCallback(async () => {
    setErrorModalAbrirTurno(null);
    const pv = user?.puntoVenta?.trim();
    if (!pv) {
      setErrorModalAbrirTurno(
        "No hay punto de venta asignado en tu usuario. El administrativo no puede abrir el turno hasta que exista en Firestore."
      );
      return;
    }

    type CajeroTurnoState = NonNullable<typeof cajeroTurnoActivo>;
    let cajeroNext: CajeroTurnoState;
    if (cajeroIdSeleccionAbrirTurno === CAJERO_TURNO_ID_SESION) {
      cajeroNext = {
        id: CAJERO_TURNO_ID_SESION,
        nombreDisplay: user?.email?.trim()
          ? `Franquiciado · ${user.email.trim()}`
          : "Franquiciado (cuenta del punto)",
        documento: "",
      };
    } else {
      const row = cajerosModalTurno.find((c) => c.id === cajeroIdSeleccionAbrirTurno);
      if (!row) {
        setErrorModalAbrirTurno("Selecciona quién inicia el turno en caja.");
        return;
      }
      cajeroNext = {
        id: row.id,
        nombreDisplay: nombreDisplayCajeroTurno(row.ficha),
        documento: row.ficha.numeroDocumento?.trim() ?? "",
      };
    }

    setAbriendoTurnoWms(true);
    try {
      const token = await auth?.currentUser?.getIdToken();
      if (!token) {
        setErrorModalAbrirTurno("Sesión inválida. Volvé a iniciar sesión.");
        return;
      }
      const rWms = await wmsTurnosAbrir(token, { uen: "Maria Chorizos" });
      if (!rWms.ok) {
        setErrorModalAbrirTurno(
          rWms.error ||
            "No se pudo abrir el turno en el administrativo. Revisá conexión y que tu usuario tenga punto de venta."
        );
        return;
      }

      const valor = parseFloat(String(baseInicialCajaInput).replace(/,/g, "."));
      const base = Number.isFinite(valor) && valor >= 0 ? valor : 0;
      setCajeroTurnoActivo(cajeroNext);
      setBaseInicialCaja(base);
      setTurnoAbierto(true);
      setTurnoInicio(new Date());
      setTotalVentasEnTurno(0);
      totalVentasEnTurnoRef.current = 0;
      setMovimientosCaja([]);
      setPrecuentasEliminadasCount(0);
      setProductosEliminadosCount(0);
      setValorProductosEliminados(0);
      setTurnoSesionId(nuevoTurnoSesionId());
      setShowModalAbrirTurno(false);
      setBaseInicialCajaInput("");
      await wmsTurnosSincronizarSilent(token, 0);
    } finally {
      setAbriendoTurnoWms(false);
    }
  }, [
    user?.puntoVenta,
    user?.email,
    cajeroIdSeleccionAbrirTurno,
    cajerosModalTurno,
    baseInicialCajaInput,
    auth,
  ]);

  const handleCerrarSesion = async () => {
    await signOut();
    router.replace("/");
  };

  const abrirModuloMasConClave = useCallback(() => {
    setInputClaveMas("");
    setMostrarClaveMasEnClaro(false);
    setShowModalClaveMas(true);
  }, []);

  const confirmarClaveMas = useCallback(() => {
    if (inputClaveMas.trim() !== CLAVE_ACCESO_MAS) {
      window.alert("Clave incorrecta.");
      return;
    }
    setShowModalClaveMas(false);
    setInputClaveMas("");
    setMostrarClaveMasEnClaro(false);
    setModuloActivo("mas");
  }, [inputClaveMas]);

  const cerrarModalClaveMas = useCallback(() => {
    setShowModalClaveMas(false);
    setInputClaveMas("");
    setMostrarClaveMasEnClaro(false);
  }, []);

  /** Debe declararse antes de cualquier return condicional (loading / sin usuario) para no violar reglas de hooks. */
  const getIdTokenCajaMensajes = useCallback(async () => {
    if (!auth?.currentUser) return null;
    return auth.currentUser.getIdToken();
  }, []);

  const inicialesCajero = user?.email
    ? user.email
        .split("@")[0]
        .replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ]/g, "")
        .slice(0, 2)
        .toUpperCase() || "CA"
    : "CA";

  /** Iniciales para el avatar del cajero en turno (evita mostrar las del correo de sesión, p. ej. "CC"). */
  const inicialesCajeroTurnoNombre = cajeroTurnoActivo?.nombreDisplay
    ? (() => {
        const t = cajeroTurnoActivo.nombreDisplay.trim();
        if (!t) return inicialesCajero;
        const parts = t.split(/\s+/).filter(Boolean);
        if (parts.length >= 2) {
          return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
        }
        return (
          t
            .replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ]/g, "")
            .slice(0, 2)
            .toUpperCase() || inicialesCajero
        );
      })()
    : inicialesCajero;

  const handleCambiarFoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file?.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      handleFotoPerfilChange(dataUrl);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const abrirModalPerfil = () => setShowModalPerfilUsuario(true);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100/90">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const esContador = esContadorInvitado(user.role);

  const fechaHoy = ymdColombia();
  const fechaFormateada = fechaColombia(new Date(), {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const tituloModulo = esContador
    ? moduloActivo === "ultimosRecibos"
      ? "Últimos recibos"
      : moduloActivo === "metasBonificaciones"
        ? "Metas y bonificaciones"
        : "Reportes"
    : moduloActivo === "ventas"
      ? "Ventas e ingresos"
      : moduloActivo === "ultimosRecibos"
        ? "Últimos recibos"
        : moduloActivo === "turnos"
          ? "Turnos"
          : moduloActivo === "cargueInventario"
            ? "Cargue de inventario"
            : moduloActivo === "inventarios"
              ? "Inventarios"
              : moduloActivo === "metasBonificaciones"
                ? "Metas y bonificaciones"
                : moduloActivo === "reportes"
                  ? "Reportes"
                  : moduloActivo === "domicilios"
                    ? "Domicilios"
                  : "Más";

  return (
    <div className="flex h-dvh max-h-dvh min-h-0 overflow-hidden bg-gray-100/90">
      {/* Sidebar izquierdo */}
      <aside
        data-pos-tutorial="sidebar"
        className="fixed left-0 top-0 z-10 flex min-h-screen w-52 flex-col border-r border-gray-200 bg-white shadow-sm"
      >
        <div className="flex items-start justify-between gap-2 border-b border-gray-100 bg-white px-2 py-3">
          <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <Image
              src={LOGO_ORG_URL}
              alt="Maria Chorizos"
              width={140}
              height={50}
              className="h-9 w-auto object-contain"
            />
            <span className="text-xs font-medium text-primary-600">POS</span>
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0" data-pos-tutorial="nav-admin-msgs">
            {!esContador && (
              <div className="flex flex-row items-center gap-1.5">
                <PosCajaMensajesBell
                  getIdToken={getIdTokenCajaMensajes}
                  puntoVentaLabel={user.puntoVenta?.trim() || undefined}
                />
                <PosBroadcastBell getIdToken={getIdTokenCajaMensajes} />
              </div>
            )}
            <button
              type="button"
              data-pos-tutorial="ayuda-icon"
              onClick={() => setPosGebAyudaAbierta(true)}
              className="group relative flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-amber-100/90 shadow-[0_6px_20px_-6px_rgba(180,130,40,0.45)] transition-transform hover:scale-[1.03] active:scale-[0.97]"
              title="Ayuda GEB — buscá cómo hacer cualquier cosa"
              aria-label="Abrir ayuda GEB"
            >
            <span className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-brand-yellow/25 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
            <svg
              className="relative h-6 w-6 text-amber-900 drop-shadow-sm"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.8}
                d="M9.09 9a3 3 0 115.83 1c0 2-3 3-3 3M12 17h.01"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.2}
                d="M4.5 4.5l2 2M19.5 4.5l-2 2M12 3v1"
                className="text-brand-red opacity-60"
              />
            </svg>
          </button>
          </div>
        </div>
        <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
          {!esContador && (
            <>
              <button
                type="button"
                data-pos-tutorial="nav-ventas"
                onClick={() => setModuloActivo("ventas")}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                  moduloActivo === "ventas" ? "bg-brand-yellow/25 text-gray-900 border border-brand-yellow/50" : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Ventas e ingresos
              </button>
              <button
                type="button"
                data-pos-tutorial="nav-turnos"
                onClick={() => setModuloActivo("turnos")}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                  moduloActivo === "turnos" ? "bg-brand-yellow/25 text-gray-900 border border-brand-yellow/50" : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Turnos
              </button>
              <button
                type="button"
                data-pos-tutorial="nav-cargue"
                onClick={() => setModuloActivo("cargueInventario")}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                  moduloActivo === "cargueInventario"
                    ? "bg-brand-yellow/25 text-gray-900 border border-brand-yellow/50"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                  />
                </svg>
                <span className="min-w-0 flex-1 leading-snug">
                  <span className="block">Cargue inventario</span>
                  <span className="block text-[10px] font-normal text-gray-500">Por producto, lote y lista</span>
                </span>
              </button>
              <button
                type="button"
                data-pos-tutorial="nav-inventarios"
                onClick={() => setModuloActivo("inventarios")}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                  moduloActivo === "inventarios"
                    ? "bg-brand-yellow/25 text-gray-900 border border-brand-yellow/50"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                  />
                </svg>
                Inventarios
              </button>
            </>
          )}
          <button
            type="button"
            data-pos-tutorial="nav-ultimos"
            onClick={() => setModuloActivo("ultimosRecibos")}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
              moduloActivo === "ultimosRecibos"
                ? "bg-brand-yellow/25 text-gray-900 border border-brand-yellow/50"
                : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
              />
            </svg>
            Últimos recibos
          </button>
          <button
            type="button"
            data-pos-tutorial="nav-metas"
            onClick={() => setModuloActivo("metasBonificaciones")}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
              moduloActivo === "metasBonificaciones"
                ? "bg-brand-yellow/25 text-gray-900 border border-brand-yellow/50"
                : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
              />
            </svg>
            Metas y bonificaciones
          </button>
          <button
            type="button"
            data-pos-tutorial="nav-reportes"
            onClick={() => setModuloActivo("reportes")}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
              moduloActivo === "reportes" ? "bg-brand-yellow/25 text-gray-900 border border-brand-yellow/50" : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Reportes
          </button>
          <button
            type="button"
            data-pos-tutorial="nav-domicilios"
            onClick={() => setModuloActivo("domicilios")}
            className={`group relative flex w-full items-center gap-3 overflow-hidden rounded-xl border px-3 py-2.5 text-left text-sm font-semibold transition-all ${
              moduloActivo === "domicilios"
                ? "border-cyan-400 bg-gradient-to-r from-cyan-600 to-sky-600 text-white shadow-md"
                : "border-cyan-200 bg-gradient-to-r from-cyan-50 to-sky-50 text-cyan-900 hover:border-cyan-300 hover:shadow-sm"
            }`}
          >
            <span
              className={`absolute inset-y-0 right-0 w-12 bg-white/20 blur-xl transition-opacity ${
                moduloActivo === "domicilios" ? "opacity-70" : "opacity-0 group-hover:opacity-50"
              }`}
            />
            <span
              className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                moduloActivo === "domicilios" ? "bg-white/20" : "bg-white"
              }`}
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.9}
                  d="M3 8.25h11.5v7.5H3m0-7.5l2.3-3.5h7.4l1.8 3.5M14.5 10.5h2.25l2.25 2.25v3h-4.5m0-5.25V15.75m0 0A2.25 2.25 0 1 0 19 15.75m-15.75 0A2.25 2.25 0 1 0 7.5 15.75"
                />
              </svg>
            </span>
            <span className="relative flex min-w-0 flex-1 flex-col leading-tight">
              <span>Domicilios</span>
              <span className={`text-[10px] uppercase tracking-wide ${moduloActivo === "domicilios" ? "text-cyan-100" : "text-cyan-700"}`}>
                Premium
              </span>
            </span>
          </button>
          {!esContador && (
            <button
              type="button"
              data-pos-tutorial="nav-mas"
              onClick={() => {
                if (moduloActivo === "mas") return;
                abrirModuloMasConClave();
              }}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                moduloActivo === "mas" ? "bg-brand-yellow/25 text-gray-900 border border-brand-yellow/50" : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              Más
            </button>
          )}
        </nav>
        <div className="border-t border-gray-100 p-2">
          {!esContador && (
            <button
              type="button"
              data-pos-tutorial="turno"
              onClick={() => {
                if (turnoAbierto) setShowModalCierreTurno(true);
                else {
                  setBaseInicialCajaInput("");
                  setErrorModalAbrirTurno(null);
                  setShowModalAbrirTurno(true);
                }
              }}
              className={`mb-3 flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors hover:opacity-90 ${
                turnoAbierto
                  ? "border-emerald-200 bg-emerald-50"
                  : "border-red-200 bg-red-50"
              }`}
              title={turnoAbierto ? "Clic para cerrar turno" : "Clic para abrir turno"}
            >
              {turnoAbierto ? (
                <>
                  <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm">
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                  <div className="min-w-0 flex-1 text-left">
                    <span className="block text-sm font-semibold text-emerald-800">Turno abierto</span>
                    <span className="mt-0.5 block text-xs font-medium text-emerald-700">
                      Abierto a las{" "}
                      {fechaHoraColombia(turnoInicio, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    {cajeroTurnoActivo && (
                      <span className="mt-0.5 block text-xs font-normal text-emerald-900/90">
                        Opera el turno: {cajeroTurnoActivo.nombreDisplay}
                      </span>
                    )}
                    <span className="mt-1 block text-xs font-semibold text-red-600 underline decoration-red-500/80 underline-offset-2">
                      Clic aquí para cerrar turno
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-red-500 text-white shadow-sm">
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </span>
                  <div className="min-w-0 flex-1 text-left">
                    <span className="block text-sm font-semibold text-red-800">Turno cerrado</span>
                    <span className="mt-0.5 block text-xs font-medium text-red-700">Abrir turno · toca aquí</span>
                  </div>
                </>
              )}
            </button>
          )}
          {esContador && (
            <p className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-center text-xs font-medium text-slate-700">
              Vista contador · solo tu punto de venta
            </p>
          )}
          {!esContador && (
            <div className="mb-3 w-full">
              {turnoAbierto && cajeroTurnoActivo ? (
                <div
                  className="relative overflow-hidden rounded-2xl border border-amber-200/60 bg-gradient-to-br from-stone-50 via-white to-amber-50/50 px-3 py-2.5 shadow-[0_8px_30px_-12px_rgba(146,110,60,0.35),inset_0_1px_0_rgba(255,255,255,0.95)] ring-1 ring-amber-900/[0.06]"
                  title={`Opera el turno: ${cajeroTurnoActivo.nombreDisplay}`}
                >
                  <div
                    className="pointer-events-none absolute -right-6 -top-8 h-24 w-24 rounded-full bg-gradient-to-br from-amber-200/30 to-transparent blur-2xl"
                    aria-hidden
                  />
                  <div className="relative flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                      <div className="relative flex h-11 w-11 shrink-0 items-center justify-center">
                        <span
                          className="absolute inset-0 rounded-full bg-gradient-to-br from-amber-300 via-yellow-200 to-amber-600 shadow-[inset_0_2px_4px_rgba(255,255,255,0.45),0_2px_8px_rgba(180,130,40,0.35)]"
                          aria-hidden
                        />
                        <span
                          className="absolute inset-[2.5px] rounded-full bg-gradient-to-b from-white/95 to-amber-50/90 shadow-inner"
                          aria-hidden
                        />
                        <svg
                          className="relative z-[1] h-[22px] w-[22px] drop-shadow-[0_1px_1px_rgba(0,0,0,0.12)]"
                          viewBox="0 0 24 24"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                          aria-hidden
                        >
                          <defs>
                            <linearGradient id="cajeroTurnoIconGold" x1="4" y1="2" x2="20" y2="22" gradientUnits="userSpaceOnUse">
                              <stop stopColor="#c9a227" />
                              <stop offset="0.5" stopColor="#f0d78c" />
                              <stop offset="1" stopColor="#8b6914" />
                            </linearGradient>
                          </defs>
                          <path
                            d="M12 2.2L4.5 5.4v5.35c0 4.05 2.6 7.85 7.5 10.05 4.9-2.2 7.5-6 7.5-10.05V5.4L12 2.2z"
                            fill="url(#cajeroTurnoIconGold)"
                            stroke="#6b4f0e"
                            strokeWidth="0.55"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M9.15 12.05 10.85 13.7 15.1 8.95"
                            stroke="#fffdf5"
                            strokeWidth="1.25"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M9.25 12 10.9 13.65 15 9.05"
                            stroke="#5c450a"
                            strokeWidth="0.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>
                      <div className="min-w-0 flex-1 text-left">
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-900/55">
                          Cajero en turno
                        </p>
                        <p className="truncate font-semibold leading-snug tracking-tight text-gray-900">
                          {cajeroTurnoActivo.nombreDisplay}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col items-center gap-1 border-t border-amber-200/50 pt-3">
                      <button
                        type="button"
                        onClick={() => inputFotoRef.current?.click()}
                        className="group relative flex h-[4.5rem] w-[4.5rem] flex-shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-amber-300/80 bg-white shadow-md ring-2 ring-amber-100 transition-all hover:border-brand-yellow hover:ring-brand-yellow/40 focus:outline-none focus:ring-2 focus:ring-brand-yellow"
                        title="Cambiar foto del cajero en turno"
                      >
                        {fotoPerfil ? (
                          <img
                            src={fotoPerfil}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="text-xl font-bold text-amber-900/80">{inicialesCajeroTurnoNombre}</span>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => inputFotoRef.current?.click()}
                        className="text-xs font-medium text-amber-900/70 hover:text-amber-950 hover:underline"
                      >
                        Cambiar foto
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-gray-200/90 bg-gray-50/90 px-3 py-2 text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-gray-500">
                    Cajero en turno
                  </p>
                  <p className="mt-0.5 text-xs text-gray-600">Abre turno para asignar cajero</p>
                </div>
              )}
            </div>
          )}
          {/* Perfil del cajero (avatar duplicado solo si no hay turno con cajero: la foto va en la tarjeta de turno) */}
          <div className="mb-3 flex flex-col items-center gap-2">
            <input
              ref={inputFotoRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleCambiarFoto}
              aria-label="Cambiar foto de perfil"
            />
            {!esContador && !(turnoAbierto && cajeroTurnoActivo) && (
              <>
                <button
                  type="button"
                  onClick={abrirModalPerfil}
                  className="group relative flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-gray-200 bg-gray-100 ring-2 ring-white shadow-md transition-all hover:border-brand-yellow hover:ring-brand-yellow/30 focus:outline-none focus:ring-2 focus:ring-brand-yellow"
                  title="Perfil del usuario"
                >
                  {fotoPerfil ? (
                    <img
                      src={fotoPerfil}
                      alt="Foto del cajero"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-lg font-bold text-primary-600">
                      {inicialesCajero}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => inputFotoRef.current?.click()}
                  className="text-xs font-medium text-gray-700 hover:text-gray-900 hover:underline"
                >
                  Cambiar foto
                </button>
              </>
            )}
            <button
              type="button"
              onClick={abrirModalPerfil}
              className="rounded-lg bg-brand-yellow px-3 py-2 text-sm font-medium text-gray-900 transition-colors hover:opacity-90"
            >
              Perfil del usuario
            </button>
          </div>
          <button
            onClick={handleCerrarSesion}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Cerrar sesión
          </button>
          {!esContador && (
            <Link
              href="/chat"
              className="mt-2 flex w-full items-center gap-3 rounded-lg bg-[#25D366] px-3 py-2.5 text-sm font-semibold text-white shadow-md transition-colors hover:bg-[#20bd5c]"
              aria-label="Abrir chat"
            >
              <svg className="h-5 w-5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              Chat
            </Link>
          )}
        </div>
      </aside>

      <PerfilUsuarioModal
        open={showModalPerfilUsuario}
        onClose={() => setShowModalPerfilUsuario(false)}
        uidSesion={user.uid}
        emailSesion={user.email}
        puntoVenta={user.puntoVenta}
        turnoAbierto={turnoAbierto}
        cajeroTurnoActivo={
          cajeroTurnoActivo
            ? { id: cajeroTurnoActivo.id, nombreDisplay: cajeroTurnoActivo.nombreDisplay }
            : null
        }
        fotoPreview={fotoPerfilModal}
        onFotoChange={handleFotoPerfilModalChange}
        esContador={esContador}
      />

      {/* Modal clave «Más» */}
      {showModalClaveMas && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-clave-mas-titulo"
        >
          <div className="absolute inset-0 bg-black/50" onClick={cerrarModalClaveMas} aria-hidden="true" />
          <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <h2 id="modal-clave-mas-titulo" className="text-lg font-semibold text-gray-900">
                Acceso a Más
              </h2>
              <button
                type="button"
                onClick={cerrarModalClaveMas}
                className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                aria-label="Cerrar"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form
              className="px-6 py-5"
              onSubmit={(e) => {
                e.preventDefault();
                confirmarClaveMas();
              }}
            >
              <p className="text-sm text-gray-600">
                Ingresá la clave maestra para abrir configuración y herramientas adicionales.
              </p>
              <label htmlFor="clave-mas-input" className="mb-1 mt-4 block text-xs font-medium text-gray-700">
                Clave
              </label>
              <div className="relative">
                <input
                  id="clave-mas-input"
                  type={mostrarClaveMasEnClaro ? "text" : "password"}
                  autoComplete="off"
                  value={inputClaveMas}
                  onChange={(e) => setInputClaveMas(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 py-2 pl-3 pr-11 text-sm text-gray-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                />
                <button
                  type="button"
                  onClick={() => setMostrarClaveMasEnClaro((v) => !v)}
                  className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                  aria-label={mostrarClaveMasEnClaro ? "Ocultar clave" : "Mostrar clave"}
                  title={mostrarClaveMasEnClaro ? "Ocultar clave" : "Mostrar clave"}
                >
                  {mostrarClaveMasEnClaro ? (
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                      />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                      />
                    </svg>
                  )}
                </button>
              </div>
              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={cerrarModalClaveMas}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700"
                >
                  Ingresar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Abrir turno */}
      {showModalAbrirTurno && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-abrir-turno-title"
        >
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowModalAbrirTurno(false)}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <h2 id="modal-abrir-turno-title" className="text-lg font-semibold text-gray-900">
                Abrir turno
              </h2>
              <button
                type="button"
                onClick={() => setShowModalAbrirTurno(false)}
                className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                aria-label="Cerrar"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-6 py-5">
              <p className="mb-3 text-sm text-gray-600">
                Punto de venta: <strong className="text-gray-900">{user?.puntoVenta ?? "—"}</strong>
              </p>
              <p className="mb-2 text-sm font-medium text-gray-900">
                ¿Quién inicia el turno en caja? <span className="text-red-500">*</span>
              </p>
              {cargandoCajerosTurnoModal ? (
                <p className="mb-4 text-sm text-gray-500">Cargando opciones…</p>
              ) : (
                <>
                  <fieldset className="mb-4 space-y-2">
                    <legend className="sr-only">Persona que inicia el turno</legend>
                    <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 px-3 py-2.5 has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50/60">
                      <input
                        type="radio"
                        name="cajero-turno-apertura"
                        checked={cajeroIdSeleccionAbrirTurno === CAJERO_TURNO_ID_SESION}
                        onChange={() => setCajeroIdSeleccionAbrirTurno(CAJERO_TURNO_ID_SESION)}
                        className="h-4 w-4 text-blue-600"
                      />
                      <span className="text-sm text-gray-900">
                        <span className="font-medium">Franquiciado — apoyo en caja</span>
                        <span className="block text-xs text-gray-500">
                          Misma cuenta del punto de venta{user?.email ? ` (${user.email})` : ""}
                        </span>
                      </span>
                    </label>
                    {cajerosModalTurno.map((c) => (
                      <label
                        key={c.id}
                        className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 px-3 py-2.5 has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50/60"
                      >
                        <input
                          type="radio"
                          name="cajero-turno-apertura"
                          checked={cajeroIdSeleccionAbrirTurno === c.id}
                          onChange={() => setCajeroIdSeleccionAbrirTurno(c.id)}
                          className="h-4 w-4 text-blue-600"
                        />
                        <span className="text-sm text-gray-900">
                          <span className="font-medium">{nombreDisplayCajeroTurno(c.ficha)}</span>
                          {c.ficha.cargo ? (
                            <span className="text-gray-500"> · {c.ficha.cargo}</span>
                          ) : null}
                          {c.ficha.numeroDocumento ? (
                            <span className="block text-xs text-gray-500">Doc. {c.ficha.numeroDocumento}</span>
                          ) : null}
                        </span>
                      </label>
                    ))}
                  </fieldset>
                  {cajerosModalTurno.length === 0 ? (
                    <p className="mb-4 rounded-lg border border-amber-100 bg-amber-50/80 px-3 py-2 text-xs text-amber-950">
                      No hay cajeros de turno registrados. El turno se atribuye al franquiciado. Puedes dar de alta
                      cajeros en <strong>Más → Cajeros de turno</strong> cuando otra persona opere la caja.
                    </p>
                  ) : null}
                </>
              )}
              {errorModalAbrirTurno && (
                <p className="mb-3 text-sm text-red-600" role="alert">
                  {errorModalAbrirTurno}
                </p>
              )}
              <div className="space-y-3 text-sm">
                <div>
                  <label className="text-gray-500">Fecha y hora de apertura:</label>
                  <p className="font-medium text-gray-900">
                    {fechaHoraColombia(new Date(), {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <div>
                  <label htmlFor="base-inicial" className="mb-1 flex items-center gap-1 text-gray-700">
                    Base Inicial en caja <span className="text-red-500" aria-hidden>*</span>
                  </label>
                  <div className="flex rounded-lg border border-gray-300 bg-white">
                    <span className="flex items-center px-3 text-gray-500">$</span>
                    <input
                      id="base-inicial"
                      type="text"
                      inputMode="decimal"
                      value={baseInicialCajaInput}
                      onChange={(e) => setBaseInicialCajaInput(e.target.value)}
                      placeholder="0,00"
                      className="w-full py-2.5 pr-3 focus:outline-none focus:ring-0"
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex gap-3 border-t border-gray-200 bg-gray-50 px-6 py-4">
              <button
                type="button"
                onClick={() => setShowModalAbrirTurno(false)}
                className="flex-1 rounded-lg border border-gray-300 bg-white py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={abriendoTurnoWms || cargandoCajerosTurnoModal}
                onClick={() => void confirmarAbrirTurno()}
                className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {abriendoTurnoWms ? "Abriendo en servidor…" : "Abrir turno"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal variantes: chorizo, chorizo + arepa, o solo arepa de peto */}
      {modalProductoChorizo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-chorizo-title"
        >
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setModalProductoChorizo(null)}
            aria-hidden="true"
          />
          <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl">
            <h2 id="modal-chorizo-title" className="text-lg font-semibold text-gray-900">
              {productoRequiereSoloTipoArepaPeto(modalProductoChorizo)
                ? "¿Cómo la deseas?"
                : productoRequiereChorizoYArepa(modalProductoChorizo)
                  ? productoEsComboConArepa(modalProductoChorizo)
                    ? "Arma tu combo con arepa"
                    : "Chorizo con arepa"
                  : "¿Cómo lo deseas?"}
            </h2>
            <p className="mt-1 text-sm text-gray-600 line-clamp-2">{modalProductoChorizo.descripcion}</p>
            {!productoRequiereSoloTipoArepaPeto(modalProductoChorizo) && (
              <fieldset className="mt-5 space-y-3">
                <legend className="mb-2 block text-sm font-semibold text-gray-800">
                  Chorizo
                </legend>
                <label className="flex cursor-pointer items-center gap-3 rounded-lg border-2 border-gray-200 px-4 py-3 has-[:checked]:border-primary-500 has-[:checked]:bg-primary-50">
                  <input
                    type="radio"
                    name="variante-chorizo"
                    checked={varianteModalChorizo === "tradicional"}
                    onChange={() => setVarianteModalChorizo("tradicional")}
                    className="h-4 w-4 text-primary-600"
                  />
                  <span className="text-sm font-medium text-gray-900">Tradicional</span>
                </label>
                <label className="flex cursor-pointer items-center gap-3 rounded-lg border-2 border-gray-200 px-4 py-3 has-[:checked]:border-primary-500 has-[:checked]:bg-primary-50">
                  <input
                    type="radio"
                    name="variante-chorizo"
                    checked={varianteModalChorizo === "picante"}
                    onChange={() => setVarianteModalChorizo("picante")}
                    className="h-4 w-4 text-primary-600"
                  />
                  <span className="text-sm font-medium text-gray-900">Picante</span>
                </label>
              </fieldset>
            )}
            {(productoRequiereChorizoYArepa(modalProductoChorizo) ||
              productoRequiereSoloTipoArepaPeto(modalProductoChorizo)) && (
              <fieldset
                className={`space-y-3 ${
                  productoRequiereSoloTipoArepaPeto(modalProductoChorizo)
                    ? "mt-5"
                    : "mt-6 border-t border-gray-100 pt-5"
                }`}
              >
                <legend className="mb-2 block text-sm font-semibold text-gray-800">
                  Arepa
                </legend>
                <label className="flex cursor-pointer items-center gap-3 rounded-lg border-2 border-gray-200 px-4 py-3 has-[:checked]:border-primary-500 has-[:checked]:bg-primary-50">
                  <input
                    type="radio"
                    name="variante-arepa-combo"
                    checked={varianteModalArepa === "arepa_queso"}
                    onChange={() => setVarianteModalArepa("arepa_queso")}
                    className="h-4 w-4 text-primary-600"
                  />
                  <span className="text-sm font-medium text-gray-900">{etiquetaArepaCombo("arepa_queso")}</span>
                </label>
                <label className="flex cursor-pointer items-center gap-3 rounded-lg border-2 border-gray-200 px-4 py-3 has-[:checked]:border-primary-500 has-[:checked]:bg-primary-50">
                  <input
                    type="radio"
                    name="variante-arepa-combo"
                    checked={varianteModalArepa === "queso_bocadillo"}
                    onChange={() => setVarianteModalArepa("queso_bocadillo")}
                    className="h-4 w-4 text-primary-600"
                  />
                  <span className="text-sm font-medium text-gray-900">{etiquetaArepaCombo("queso_bocadillo")}</span>
                </label>
              </fieldset>
            )}
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setModalProductoChorizo(null)}
                className="flex-1 rounded-lg border border-gray-300 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarAgregarChorizoModal}
                className="flex-1 rounded-lg bg-primary-600 py-2.5 text-sm font-semibold text-white hover:bg-primary-700"
              >
                Agregar a la cuenta
              </button>
            </div>
          </div>
        </div>
      )}

      {modalProductoBebida && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-bebida-title"
        >
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setModalProductoBebida(null)}
            aria-hidden="true"
          />
          <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl">
            <h2 id="modal-bebida-title" className="text-lg font-semibold text-gray-900">
              Selecciona el tamaño
            </h2>
            <p className="mt-1 text-sm text-gray-600 line-clamp-2">{modalProductoBebida.descripcion}</p>
            <fieldset className="mt-5 space-y-3">
              <legend className="mb-2 block text-sm font-semibold text-gray-800">Tamaño de la bebida</legend>
              {(modalProductoBebida.variantes ?? []).map((opt) => {
                const precio =
                  typeof opt.precioVenta === "number"
                    ? opt.precioVenta
                    : modalProductoBebida.preciosPorVariante?.[opt.clave] ?? modalProductoBebida.precioUnitario;
                return (
                  <label
                    key={opt.clave}
                    className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border-2 border-gray-200 px-4 py-3 has-[:checked]:border-primary-500 has-[:checked]:bg-primary-50"
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="variante-bebida"
                        checked={varianteModalBebida === opt.clave}
                        onChange={() => setVarianteModalBebida(opt.clave)}
                        className="h-4 w-4 text-primary-600"
                      />
                      <span className="text-sm font-medium text-gray-900">{opt.etiqueta}</span>
                    </div>
                    <span className="text-sm font-semibold text-primary-700">
                      ${Number(precio ?? 0).toLocaleString("es-CO")}
                    </span>
                  </label>
                );
              })}
            </fieldset>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setModalProductoBebida(null)}
                className="flex-1 rounded-lg border border-gray-300 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!varianteModalBebida}
                onClick={confirmarAgregarBebidaModal}
                className="flex-1 rounded-lg bg-primary-600 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
              >
                Agregar a la cuenta
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Detalle del turno (cierre de caja) */}
      {showModalCierreTurno && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-turno-title"
        >
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowModalCierreTurno(false)}
            aria-hidden="true"
          />
          <div className="relative max-h-[90vh] w-full max-w-lg overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <h2 id="modal-turno-title" className="text-lg font-semibold text-gray-900">
                Detalle del turno
              </h2>
              <button
                type="button"
                onClick={() => setShowModalCierreTurno(false)}
                className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                aria-label="Cerrar"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="max-h-[calc(90vh-8rem)] overflow-y-auto px-6 py-4">
              {/* Info del turno */}
              <div className="mb-4 rounded-lg bg-gray-50 p-4 text-sm">
                <p className="font-medium text-gray-900">Maria Chorizos</p>
                <p className="mt-1 text-gray-600">
                  Inicio:{" "}
                  {fechaHoraColombia(turnoInicio, {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
                <p className="text-gray-600">Fin: —</p>
                <p className="mt-1 text-gray-600">
                  Atribución del turno:{" "}
                  <span className="font-medium text-gray-900">{cajeroTurnoActivo?.nombreDisplay ?? "—"}</span>
                </p>
                <p className="text-gray-600">
                  Sesión POS: <span className="font-medium text-gray-800">{user?.email ?? "—"}</span>
                </p>
              </div>

              {/* Ventas (expandible) */}
              <div className="mb-4 rounded-lg border border-gray-200">
                <button
                  type="button"
                  onClick={() => setDetalleVentasExpandido((v) => !v)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left font-medium text-gray-900"
                >
                  Ventas
                  <span className="text-gray-500">
                    {detalleVentasExpandido ? "Ocultar detalle" : "Ver detalle"}
                  </span>
                </button>
                {detalleVentasExpandido && (
                  <div className="border-t border-gray-100 px-4 py-3 text-sm text-gray-600">
                    <p>Total base inicial de caja: {baseInicialCaja.toLocaleString("es-CO", { minimumFractionDigits: 2 })}</p>
                    <p className="mt-1">Tickets locales en turno: {ventasTurnoActivales.length}</p>
                    <p className="mt-2 font-medium text-gray-800">Medios de pago (suma por ticket)</p>
                    <p className="mt-1">Efectivo: {mediosTurnoModal.efectivo.toLocaleString("es-CO", { minimumFractionDigits: 2 })}</p>
                    <p className="mt-1">Tarjeta / datáfono: {mediosTurnoModal.tarjeta.toLocaleString("es-CO", { minimumFractionDigits: 2 })}</p>
                    <p className="mt-1">Pagos en línea: {mediosTurnoModal.pagosLinea.toLocaleString("es-CO", { minimumFractionDigits: 2 })}</p>
                    <p className="mt-1">Otros: {mediosTurnoModal.otros.toLocaleString("es-CO", { minimumFractionDigits: 2 })}</p>
                  </div>
                )}
              </div>

              {/* Ingresos y retiros */}
              <div className="mb-4 rounded-lg border border-gray-200 p-4 text-sm">
                <p className="font-medium text-gray-900">Ingresos y retiros</p>
                <p className="mt-1 text-gray-600">Total ingreso de efectivo: $ {totalIngresoEfectivo.toLocaleString("es-CO", { minimumFractionDigits: 2 })}</p>
                <p className="mt-1 text-gray-600">Total retiro de efectivo: $ {totalRetiroEfectivo.toLocaleString("es-CO", { minimumFractionDigits: 2 })}</p>
              </div>

              {/* Resumen cierre */}
              {(() => {
                const decTar = valoresCierreCajaSegunVentas.tarjeta;
                const decLin = valoresCierreCajaSegunVentas.pagosLinea;
                const decOtr = valoresCierreCajaSegunVentas.otros;
                const totalIngresado = valoresCierreCajaSegunVentas.totalCierreLocal;
                const totalEsperado = valoresCierreCajaSegunVentas.totalCierreSistema;
                const diferencia = totalIngresado - totalEsperado;
                const cuadreExacto = Math.abs(diferencia) < 0.005;
                const haySobrante = diferencia > 0.005;
                const claseDiferencia = cuadreExacto
                  ? "text-emerald-800 font-medium"
                  : haySobrante
                    ? "text-amber-800 font-medium"
                    : "text-red-600 font-medium";
                const fmtCop = (n: number) => n.toLocaleString("es-CO", { minimumFractionDigits: 2 });
                const espVentasEfectivo = mediosTurnoModal.efectivo;
                const netoMovimientosEfectivo = valoresCierreCajaSegunVentas.netoMovimientosEfectivo;
                const esperadoEfectivoEnCaja = valoresCierreCajaSegunVentas.efectivoEsperadoCaja;
                return (
                  <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm">
                    <div className="rounded-md border border-emerald-200/80 bg-emerald-50/40 p-3 text-xs leading-relaxed text-gray-800">
                      <p className="font-semibold text-emerald-900">Efectivo esperado en caja</p>
                      <p className="mt-1 text-gray-600">
                        Se calcula con base inicial + ventas en efectivo + ingresos de efectivo - retiros de efectivo.
                      </p>
                      <ul className="mt-2 space-y-1.5 border-t border-emerald-200/60 pt-2">
                        <li className="flex flex-wrap justify-between gap-x-2 gap-y-0.5">
                          <span className="text-gray-700">Base inicial</span>
                          <span className="font-medium tabular-nums text-gray-900">$ {fmtCop(baseInicialCaja)}</span>
                        </li>
                        <li className="flex flex-wrap justify-between gap-x-2 gap-y-0.5">
                          <span className="text-gray-700">+ Ventas en efectivo</span>
                          <span className="font-medium tabular-nums text-gray-900">$ {fmtCop(espVentasEfectivo)}</span>
                        </li>
                        <li className="flex flex-wrap justify-between gap-x-2 gap-y-0.5">
                          <span className="text-gray-700">
                            {netoMovimientosEfectivo >= 0 ? "+ Neto ingresos / retiros" : "- Neto ingresos / retiros"}
                          </span>
                          <span className="font-medium tabular-nums text-gray-900">$ {fmtCop(Math.abs(netoMovimientosEfectivo))}</span>
                        </li>
                        <li className="flex flex-wrap justify-between gap-x-2 gap-y-0.5 border-t border-emerald-200/50 pt-1.5 font-semibold text-emerald-950">
                          <span>= Efectivo esperado en gaveta</span>
                          <span className="tabular-nums">$ {fmtCop(esperadoEfectivoEnCaja)}</span>
                        </li>
                      </ul>
                    </div>

                    <div className="mt-3 rounded-md border border-gray-200 bg-white p-3 text-xs">
                      <p className="font-semibold text-gray-900">Otros medios esperados</p>
                      <p className="mt-2 flex justify-between">
                        <span className="text-gray-600">Tarjeta / datáfono</span>
                        <span className="font-medium">$ {fmtCop(decTar)}</span>
                      </p>
                      <p className="mt-1 flex justify-between">
                        <span className="text-gray-600">Pagos en línea</span>
                        <span className="font-medium">$ {fmtCop(decLin)}</span>
                      </p>
                      <p className="mt-1 flex justify-between">
                        <span className="text-gray-600">Otros medios</span>
                        <span className="font-medium">$ {fmtCop(decOtr)}</span>
                      </p>
                    </div>

                    <p className="mt-2 flex justify-between text-gray-600">
                      <span>Ventas a crédito (referencia)</span>
                      <span>$ {ventasCredito.toLocaleString("es-CO", { minimumFractionDigits: 2 })}</span>
                    </p>
                    <p className="mt-1 text-xs text-gray-500">Se muestra como referencia y no se suma al cierre de caja.</p>
                  </div>
                );
              })()}

              {/* Historial precuentas eliminadas */}
              <div className="mt-4 rounded-lg border border-gray-200 p-4 text-sm">
                <p className="font-medium text-gray-900">Historial de Precuentas eliminadas</p>
                <p className="mt-2 text-gray-600">Total Precuentas eliminadas: {precuentasEliminadasCount}</p>
                <p className="mt-1 text-gray-600">Núm. de productos eliminados: {productosEliminadosCount}</p>
                <p className="mt-1 text-gray-600">Valor de productos eliminados: $ {valorProductosEliminados.toLocaleString("es-CO", { minimumFractionDigits: 2 })}</p>
                <p className="mt-2 text-xs text-gray-500">Este valor no afectará el total del cierre de turno</p>
              </div>
            </div>
            <div className="flex gap-3 border-t border-gray-200 bg-gray-50 px-6 py-4">
              <button
                type="button"
                onClick={() => setShowModalCierreTurno(false)}
                className="flex-1 rounded-lg border border-blue-300 bg-white py-2.5 text-sm font-medium text-blue-700 hover:bg-blue-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void abrirModalInformeCierreCorreo()}
                className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Cerrar turno y enviar por email
              </button>
            </div>
          </div>
        </div>
      )}

      <ModalInformeCierreCorreo
        open={modalInformeCierreCorreoAbierto}
        onClose={() => !procesandoCierreTurno && setModalInformeCierreCorreoAbierto(false)}
        para={emailInformeCierrePara}
        onParaChange={setEmailInformeCierrePara}
        cc={emailInformeCierreCc}
        onCcChange={setEmailInformeCierreCc}
        defaultsLoading={cargandoDefaultsInformeCorreo}
        submitting={procesandoCierreTurno}
        onConfirm={() => void confirmarInformeCierreYcerrarTurno()}
        errorMsg={errorInformeCierreCorreo}
      />
      <TurnoCierreExitoPremiumModal
        open={modalExitoCierreTurno != null}
        titulo={modalExitoCierreTurno?.titulo ?? "Turno cerrado con éxito"}
        lineas={modalExitoCierreTurno?.lineas ?? []}
        onClose={() => setModalExitoCierreTurno(null)}
      />

      {/* Área central + cuenta a cobrar (en columna en móvil, fila en escritorio) */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden pl-52 lg:flex-row">
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto pt-0">
        <div className="p-4 sm:p-5 lg:p-4">
          <MetasRetosCajaProvider puntoVenta={user.puntoVenta} uid={user.uid}>
            <PosCajaPremiumHeader puntoVenta={user.puntoVenta} etiquetaModulo={tituloModulo} />
            {!esContador && turnoAbierto ? (
              <PosLigaTurnoYMotivacion
                apiBaseUrl={getWmsPublicBaseUrl()}
                puntoVenta={user.puntoVenta ?? undefined}
                getToken={getIdTokenCajaMensajes}
                pollMs={20000}
                fraseIntervalMs={10000}
              />
            ) : null}
            {esContador ? (
            moduloActivo === "ultimosRecibos" ? (
              <UltimosRecibosModule
                uid={user.uid}
                email={user.email}
                puntoVenta={user.puntoVenta ?? ""}
                turnoSesionId=""
                turnoAbierto={false}
                turnoInicio={null}
                soloConsultaContador
              />
            ) : moduloActivo === "metasBonificaciones" ? (
              <MetasBonificacionesModule puntoVenta={user.puntoVenta} uid={user.uid} />
            ) : (
              <div className="space-y-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800">
                  <p>
                    Cuenta <strong>contador invitado</strong> · punto de venta{" "}
                    <strong className="text-slate-900">{user.puntoVenta ?? "—"}</strong>. No podés operar caja ni turnos;
                    usá <strong>Últimos recibos</strong> en el menú para ver recibos de este equipo o{" "}
                    <strong>Reportes</strong> para el resumen.
                  </p>
                </div>
                <CajeroReportesDashboard
                  uid={user.uid}
                  puntoVenta={user.puntoVenta}
                  mostrarDetalleErrorNube
                  turnoActivo={null}
                />
              </div>
            )
          ) : moduloActivo === "ventas" ? (
            <div className="space-y-4">
              {!turnoAbierto && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center">
                  <p className="text-sm font-medium text-amber-800">
                    El turno está cerrado. Debe abrir un turno para poder vender.
                  </p>
                  <p className="mt-1 text-xs text-amber-700">
                    Use el botón «Turno cerrado» en el menú izquierdo para abrir un nuevo turno.
                  </p>
                </div>
              )}
              {/* Pestañas de pre-cuenta */}
              <div
                data-pos-tutorial="precuentas"
                className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
              >
                <span className="mr-2 text-sm font-medium text-gray-500">Pre-cuenta activa:</span>
                {precuentas.map((p) => (
                  <span
                    key={p.id}
                    className={`mr-2 inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 ${
                      activePrecuentaId === p.id
                        ? "border-brand-yellow bg-brand-yellow/20"
                        : "border-gray-200 bg-white"
                    }`}
                  >
                    {editingPrecuentaId === p.id ? (
                      <>
                        <input
                          type="text"
                          value={editingNombre}
                          onChange={(e) => setEditingNombre(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") guardarNombrePrecuenta(p.id);
                            if (e.key === "Escape") {
                              setEditingPrecuentaId(null);
                              setEditingNombre("");
                            }
                          }}
                          onBlur={() => guardarNombrePrecuenta(p.id)}
                          className="w-36 rounded border border-gray-300 px-2 py-0.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-200"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => guardarNombrePrecuenta(p.id)}
                          className="rounded p-0.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                          aria-label="Guardar nombre"
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => setActivePrecuentaId(p.id)}
                          className="text-left text-sm font-medium text-gray-900"
                        >
                          {p.nombre}
                        </button>
                        <button
                          type="button"
                          onClick={() => iniciarEdicionNombre(p.id)}
                          className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                          aria-label="Editar nombre"
                          title="Editar nombre"
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                        {precuentas.length > 1 && (
                          <button
                            type="button"
                            onClick={(e) => cerrarPrecuenta(p.id, e)}
                            className="rounded p-0.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                            aria-label="Anular pre-cuenta"
                            title="Anular pre-cuenta"
                          >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </>
                    )}
                  </span>
                ))}
                <button
                  type="button"
                  onClick={agregarPrecuenta}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-dashed border-gray-300 text-gray-500 hover:border-brand-yellow hover:text-gray-700"
                  aria-label="Nueva pre-cuenta"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              </div>

              {/* Catálogo de productos */}
              <div
                data-pos-tutorial="catalogo"
                className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
              >
                <h2 className="mb-3 text-lg font-semibold text-gray-800">Catálogo de productos</h2>
                <p className="mb-4 text-sm text-gray-500">
                  Productos disponibles para venta (origen: WMS — Productos POS)
                </p>
                <input
                  type="text"
                  value={busquedaCatalogo}
                  onChange={(e) => setBusquedaCatalogo(e.target.value)}
                  placeholder="Buscar por código, descripción o categoría..."
                  className="mb-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
                {catalogoLoading && (
                  <div className="flex justify-center py-8">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
                  </div>
                )}
                {catalogoError && (
                  <div className="rounded-lg border border-brand-yellow/40 bg-brand-yellow/10 p-4 text-sm text-gray-700">
                    <p className="font-medium">{catalogoError}</p>
                    <p className="mt-1 text-gray-600">Más abajo podés ver la venta acumulada del turno si ya hay cobros.</p>
                    <button
                      type="button"
                      onClick={cargarCatalogo}
                      className="mt-3 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Reintentar carga del catálogo
                    </button>
                  </div>
                )}
                {!catalogoLoading && !catalogoError && (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                    {catalogosFiltrados.map((p) => {
                      const chorizoConArepa = productoRequiereChorizoYArepa(p);
                      const soloChorizoPan = productoRequiereSoloChorizoPan(p);
                      const soloArepaPetoTipo = productoRequiereSoloTipoArepaPeto(p);
                      const bebidaConTamano = productoRequiereTamanoBebida(p);
                      const qty = itemsCuentaActiva
                        .filter((i) => i.producto.sku === p.sku)
                        .reduce((s, i) => s + i.cantidad, 0);
                      return (
                        <button
                          key={p.sku}
                          type="button"
                          onClick={() => onClicProductoCatalogo(p)}
                          disabled={!turnoAbierto}
                          className="flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-gray-50/50 text-left transition-shadow hover:border-primary-300 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-400 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:shadow-none"
                        >
                          <div className="relative aspect-[5/4] w-full bg-gray-200">
                            {qty > 0 && (
                              <span className="absolute left-1 top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-emerald-500 px-0.5 text-[10px] font-bold text-white shadow">
                                {qty}
                              </span>
                            )}
                            {p.urlImagen ? (
                              <img
                                src={p.urlImagen}
                                alt={p.descripcion}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-4xl text-gray-400">
                                —
                              </div>
                            )}
                          </div>
                          <div className="flex flex-1 flex-col p-2">
                            <span className="text-[10px] font-medium uppercase tracking-wide text-gray-500 sm:text-xs">
                              {p.sku}
                            </span>
                            <p className="mt-0.5 line-clamp-2 text-[11px] font-medium leading-snug text-gray-900 sm:text-xs">
                              {p.descripcion}
                            </p>
                            {p.categoria && (
                              <p className="mt-0.5 text-[10px] text-gray-500 sm:text-[11px]">{p.categoria}</p>
                            )}
                            <p className="mt-1.5 text-xs font-semibold text-primary-600 sm:text-sm">
                              ${Number(p.precioUnitario).toLocaleString("es-CO")}
                              {p.unidad ? ` / ${p.unidad}` : ""}
                            </p>
                            {bebidaConTamano && (
                              <p className="mt-1 text-[10px] font-medium leading-tight text-sky-800 sm:text-[11px]">
                                {p.variantes?.length === 1
                                  ? "1 tamano disponible"
                                  : `${p.variantes?.length ?? 0} tamanos disponibles`}
                              </p>
                            )}
                            {chorizoConArepa && (
                              <p className="mt-1 text-[10px] font-medium leading-tight text-amber-800 sm:text-[11px]">
                                Chorizo + tipo de arepa
                              </p>
                            )}
                            {soloChorizoPan && (
                              <p className="mt-1 text-[10px] font-medium leading-tight text-amber-800 sm:text-[11px]">
                                Picante o Tradicional
                              </p>
                            )}
                            {soloArepaPetoTipo && (
                              <p className="mt-1 text-[10px] font-medium leading-tight text-amber-800 sm:text-[11px]">
                                Queso o queso y bocadillo
                              </p>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
                {!catalogoLoading && !catalogoError && catalogosFiltrados.length === 0 && (
                  <p className="py-6 text-center text-sm text-gray-500">
                    {busquedaCatalogo.trim() ? "No hay productos que coincidan con la búsqueda." : "No hay productos en el catálogo."}
                  </p>
                )}
              </div>

              {/* Venta acumulada del turno — debajo del catálogo */}
              <div
                data-pos-tutorial="valor-dia"
                className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
              >
                <h2 className="text-lg font-semibold text-gray-800">Venta acumulada del turno</h2>
                <p className="mt-1 text-sm text-gray-600">
                  Total cobrado en esta caja desde que abriste el turno (suma de todas las pre-cuentas). Se actualiza con cada
                  venta confirmada.
                </p>
                <div
                  className={`mt-4 rounded-xl border-2 px-4 py-5 text-center ${
                    turnoAbierto ? "border-gray-200 bg-gray-50" : "border-amber-200 bg-amber-50/60"
                  }`}
                >
                  <p className="text-3xl font-bold tabular-nums text-gray-900 md:text-4xl">
                    ${" "}
                    {totalVentasEnTurno.toLocaleString("es-CO", {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0,
                    })}
                  </p>
                  {!turnoAbierto ? (
                    <p className="mt-3 text-xs font-medium text-amber-900">
                      Turno cerrado: abrí turno para acumular ventas y ver el total aquí.
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          ) : moduloActivo === "ultimosRecibos" ? (
            <UltimosRecibosModule
              uid={user.uid}
              email={user.email}
              puntoVenta={user.puntoVenta ?? ""}
              turnoSesionId={turnoSesionId}
              turnoAbierto={turnoAbierto}
              turnoInicio={turnoAbierto ? turnoInicio : null}
              onAnulacionExitosa={(v) => {
                if (turnoAbierto && v.turnoSesionId?.trim() === turnoSesionId.trim()) {
                  setTotalVentasEnTurno((prev) => {
                    const next = Math.max(0, prev - v.total);
                    totalVentasEnTurnoRef.current = next;
                    return next;
                  });
                  void (async () => {
                    const t = await auth?.currentUser?.getIdToken();
                    if (t) await wmsTurnosSincronizarSilent(t, totalVentasEnTurnoRef.current);
                  })();
                }
              }}
            />
          ) : moduloActivo === "turnos" ? (
            <TurnosHistorialModule
              uid={user.uid}
              puntoVenta={user.puntoVenta ?? ""}
              turnoActivo={
                turnoAbierto && cajeroTurnoActivo
                  ? {
                      inicio: turnoInicio,
                      cajeroNombre: cajeroTurnoActivo.nombreDisplay,
                      turnoSesionId,
                      totalVentasAcumuladoWms: totalVentasEnTurno,
                    }
                  : null
              }
            />
          ) : moduloActivo === "cargueInventario" ? (
            <CargueInventarioManualPanel puntoVenta={user.puntoVenta} uid={user.uid} email={user.email} />
          ) : moduloActivo === "inventarios" ? (
            <InventarioPosModule puntoVenta={user.puntoVenta} uid={user.uid} email={user.email} />
          ) : moduloActivo === "metasBonificaciones" ? (
            <MetasBonificacionesModule puntoVenta={user.puntoVenta} uid={user.uid} />
          ) : moduloActivo === "reportes" ? (
            <CajeroReportesDashboard
              uid={user.uid}
              puntoVenta={user.puntoVenta}
              turnoActivo={{
                abierto: turnoAbierto,
                totalIngresoEfectivo,
                totalRetiroEfectivo,
                movimientosCaja,
                onRegistrarMovimiento: registrarMovimientoCaja,
              }}
            />
          ) : moduloActivo === "domicilios" ? (
            <PosDomiciliosModule puntoVenta={user.puntoVenta} />
          ) : moduloActivo === "mas" ? (
            <ConfiguracionMasModule puntoVenta={user.puntoVenta} uid={user.uid} role={user.role} />
          ) : (
            <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
              <p className="text-center text-gray-500">
                Módulo <strong>{tituloModulo}</strong>. Contenido en desarrollo.
              </p>
            </div>
          )}
          </MetasRetosCajaProvider>
        </div>
      </main>

      {/* Sidebar derecho — Cuenta a cobrar (solo en Ventas; visible también en móvil debajo del catálogo) */}
      <aside
        data-pos-tutorial="cuenta-cobrar"
        className={`flex min-h-0 w-full flex-shrink-0 flex-col border-t border-gray-200 bg-white lg:w-72 lg:border-l lg:border-t-0 xl:w-80 ${
          moduloActivo === "ventas" ? "" : "hidden"
        }`}
      >
        <div className="border-b border-gray-100 px-4 py-3">
          <h2 className="text-base font-semibold text-gray-900">Cuenta a cobrar</h2>
          <p className="mt-0.5 text-xs text-gray-500">
            {precuentas.find((p) => p.id === activePrecuentaId)?.nombre} · {user.puntoVenta}
          </p>
          <div className="mt-3">
            <label htmlFor="tipo-comprobante-sidebar" className="mb-1 flex items-center gap-1 text-xs font-medium text-gray-700">
              Tipo de comprobante <span className="text-red-500" aria-hidden>*</span>
            </label>
            <select
              id="tipo-comprobante-sidebar"
              value={tipoComprobante}
              onChange={(e) => setTipoComprobante(e.target.value as TipoComprobante)}
              className="w-full rounded-lg border border-primary-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
            >
              <option value="documento_interno">Doc. interno</option>
              <option value="factura_electronica">Factura electrónica de venta</option>
            </select>
            <p className="mt-1 text-[11px] leading-snug text-gray-500">
              {tipoComprobante === "factura_electronica"
                ? "Al cobrar se envía a la DIAN vía Alegra si habilitaste el punto en Más → Habilitaciones DIAN → Facturación electrónica."
                : "Doc. interno no reemplaza una factura electrónica."}
            </p>
          </div>
          <div className="mt-3">
            <label htmlFor="vendedor-sidebar" className="mb-1 flex items-center gap-1 text-xs font-medium text-gray-700">
              Vendedor <span className="text-red-500" aria-hidden>*</span>
            </label>
            <select
              id="vendedor-sidebar"
              disabled
              value="v1"
              className="w-full cursor-not-allowed rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700"
            >
              <option value="v1">{vendedorEtiqueta}</option>
            </select>
            <p className="mt-0.5 text-[11px] text-gray-400">Quien opera el turno en caja.</p>
          </div>
          <div className="mt-3">
            <SeleccionClienteVenta
              clienteActivo={clienteActivoPrecuenta}
              onChange={(c) =>
                setClientePorPrecuenta((prev) => ({
                  ...prev,
                  [activePrecuentaId]: c,
                }))
              }
              clientesGuardados={clientesPosLista}
              onCrearClick={() => setShowModalCrearCliente(true)}
              disabled={!turnoAbierto}
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {itemsCuentaActiva.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <svg className="mb-3 h-12 w-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <p className="text-sm text-gray-500">Aún no tienes productos en el carrito</p>
              <p className="mt-1 text-xs text-gray-400">Haz clic en un producto del catálogo para agregarlo</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {itemsCuentaActiva.map((it) => {
                const lineTotal = totalLineaItem(it);
                const pUnit = it.precioUnitarioOverride ?? it.producto.precioUnitario;
                return (
                  <li
                    key={it.lineId}
                    className="rounded-lg border border-gray-100 bg-gray-50/80 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900">{it.producto.descripcion}</p>
                        {it.varianteChorizo && (
                          <p className="mt-0.5 text-xs font-semibold text-primary-700">
                            Chorizo: {etiquetaVarianteChorizo(it.varianteChorizo)}
                          </p>
                        )}
                        {it.varianteArepaCombo && (
                          <p className="mt-0.5 text-xs font-semibold text-primary-700">
                            Arepa: {etiquetaArepaCombo(it.varianteArepaCombo)}
                          </p>
                        )}
                        <p className="mt-0.5 text-xs text-gray-500">
                          Cod. {it.producto.sku} · P. unit. $ {Number(pUnit).toLocaleString("es-CO")}
                          {it.precioUnitarioOverride != null ? " · editado" : ""}
                        </p>
                      </div>
                      <div className="flex flex-shrink-0 gap-0.5">
                        <button
                          type="button"
                          onClick={() => setItemEditando(it)}
                          className="rounded p-1 text-gray-500 hover:bg-sky-50 hover:text-sky-700"
                          title="Editar ítem"
                          aria-label="Editar ítem"
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                            />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => quitarItem(it.lineId)}
                          className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                          aria-label="Quitar ítem"
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center gap-1 rounded border border-gray-200 bg-white">
                        <button
                          type="button"
                          onClick={() => cambiarCantidad(it.lineId, -1)}
                          className="flex h-8 w-8 items-center justify-center text-gray-600 hover:bg-gray-100"
                          aria-label="Menos"
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                          </svg>
                        </button>
                        <span className="min-w-[2rem] text-center text-sm font-medium tabular-nums">
                          {it.cantidad}
                        </span>
                        <button
                          type="button"
                          onClick={() => cambiarCantidad(it.lineId, 1)}
                          className="flex h-8 w-8 items-center justify-center text-gray-600 hover:bg-gray-100"
                          aria-label="Más"
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                        </button>
                      </div>
                      <span className="text-sm font-semibold text-gray-900">
                        $ {lineTotal.toLocaleString("es-CO")}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="border-t border-gray-200 bg-white px-4 py-4">
          {sidebarResumenExpandido && itemsCuentaActiva.length > 0 && (
            <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50/90 px-3 py-3 text-sm shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wide text-sky-900">Resumen de la cuenta</p>
              <dl className="mt-2 space-y-1.5 text-sky-950">
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-600">Cliente</dt>
                  <dd className="max-w-[55%] text-right font-medium leading-snug">
                    {clienteActivoPrecuenta.nombreDisplay}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-600">Comprobante</dt>
                  <dd className="font-medium text-right">{etiquetaTipoComprobanteTicket(tipoComprobante)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-600">Vendedor</dt>
                  <dd className="max-w-[55%] text-right font-medium leading-snug">{vendedorEtiqueta}</dd>
                </div>
              </dl>
              <div className="mt-3 max-h-44 overflow-y-auto rounded-lg border border-white bg-white">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-gray-500">
                      <th className="py-2 pl-2 font-semibold">Producto</th>
                      <th className="py-2 text-center font-semibold">Cant.</th>
                      <th className="py-2 pr-2 text-right font-semibold">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itemsCuentaActiva.map((it) => {
                      const sub = totalLineaItem(it);
                      const detalleVariante = detalleVarianteTicketLinea(it);
                      return (
                        <tr key={it.lineId} className="border-b border-gray-50 last:border-0">
                          <td className="py-2 pl-2 font-medium text-gray-800">
                            {it.producto.descripcion}
                            {detalleVariante ? (
                              <span className="block text-[11px] font-normal text-gray-500">({detalleVariante})</span>
                            ) : null}
                          </td>
                          <td className="py-2 text-center tabular-nums text-gray-700">{it.cantidad}</td>
                          <td className="py-2 pr-2 text-right tabular-nums font-medium text-gray-900">
                            $ {sub.toLocaleString("es-CO")}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-600">Total</span>
            <span className="text-lg font-bold text-gray-900">
              $ {totalCuentaActiva.toLocaleString("es-CO")}
            </span>
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex gap-2">
            <button
              type="button"
              disabled={
                aplicandoParaLlevar || itemsCuentaActiva.length === 0 || !turnoAbierto || cobrando
              }
              onClick={() => void handleProductoParaLlevar()}
              className="flex flex-1 items-center justify-center rounded-lg border border-blue-200 bg-white py-2.5 text-sm font-semibold text-blue-700 shadow-sm transition-colors hover:bg-blue-50 disabled:opacity-45 disabled:pointer-events-none"
            >
              {aplicandoParaLlevar ? "Aplicando…" : "Producto para llevar"}
            </button>
            <button
              type="button"
              disabled={itemsCuentaActiva.length === 0}
              onClick={() => setSidebarResumenExpandido((v) => !v)}
              className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-blue-200 bg-white py-2.5 text-sm font-semibold text-blue-700 shadow-sm transition-colors hover:bg-blue-50 disabled:opacity-45 disabled:pointer-events-none"
            >
              {sidebarResumenExpandido ? (
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
              ) : (
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              )}
              {sidebarResumenExpandido ? "Ocultar resumen" : "Ver resumen"}
            </button>
            </div>
            <p className="text-[11px] leading-snug text-gray-500">
              Descuenta en inventario 1 bolsa de papel y 1 sticker de domicilio. Si no hay variables{" "}
              <code className="rounded bg-gray-100 px-0.5">NEXT_PUBLIC_POS_SKU_*</code>, el POS busca ítems en el catálogo
              por nombre; para mayor precisión configurá los SKU en el despliegue.
            </p>
          </div>

          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={vaciarCuenta}
              disabled={itemsCuentaActiva.length === 0 || cobrando || aplicandoParaLlevar}
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg border border-blue-200 bg-white text-blue-600 shadow-sm transition-colors hover:bg-blue-50 disabled:opacity-45 disabled:pointer-events-none"
              title="Vaciar cuenta"
              aria-label="Vaciar cuenta"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
            <button
              type="button"
              disabled={cobrando || itemsCuentaActiva.length === 0 || !turnoAbierto}
              onClick={abrirRegistrarPago}
              className="flex min-h-11 flex-1 items-center justify-center rounded-lg bg-emerald-600 px-3 py-2.5 text-sm font-bold text-white shadow-md transition-colors hover:bg-emerald-700 disabled:opacity-50 disabled:pointer-events-none"
            >
              {cobrando ? "Cobrando…" : `Cobrar $ ${totalCuentaActiva.toLocaleString("es-CO")}`}
            </button>
          </div>
        </div>
      </aside>
      </div>

      {user?.puntoVenta && !esContador && (
        <CrearClientePosModal
          open={showModalCrearCliente}
          onClose={() => setShowModalCrearCliente(false)}
          puntoVenta={user.puntoVenta}
          uid={user.uid}
          onCreado={(doc) => {
            setClientesPosLista((prev) => [doc, ...prev.filter((x) => x.id !== doc.id)]);
            setClientePorPrecuenta((prev) => ({
              ...prev,
              [activePrecuentaId]: {
                id: doc.id,
                nombreDisplay: nombreDisplayCliente(doc),
                tipoIdentificacion: doc.tipoIdentificacion,
                numeroIdentificacion: doc.numeroIdentificacion,
              },
            }));
          }}
        />
      )}

      <EdicionItemCuentaModal
        open={itemEditando != null}
        onClose={() => setItemEditando(null)}
        item={itemEditando}
        onGuardar={guardarItemCuentaEditado}
      />

      {!esContador && (
        <RegistrarPagoPanel
          open={registrarPagoAbierto}
          onClose={() => {
            if (!cobrando) setRegistrarPagoAbierto(false);
          }}
          numProductos={itemsCuentaActiva.reduce((s, i) => s + i.cantidad, 0)}
          clienteNombre={clienteActivoPrecuenta.nombreDisplay}
          subtotal={totalCuentaActiva}
          descuento={0}
          iva={0}
          totalBruto={totalCuentaActiva}
          totalAPagar={totalCuentaActiva}
          cobrando={cobrando}
          onConfirmar={handleConfirmarRegistrarPago}
          onAntesActivarClienteFrecuente={antesActivarClienteFrecuente}
          stickerFidelizacionConfigurado={Boolean(skuStickerFidelizacion())}
        />
      )}

      <ModalCobroSinInternet
        open={modalCobroSinInternetAbierto}
        onGuardarEnCaja={() => cerrarModalCobroSinInternet(true)}
        onVolver={() => cerrarModalCobroSinInternet(false)}
      />

      <TicketPrevisualizacionModal
        open={previsualizacionCobro != null}
        ticket={previsualizacionCobro?.ticket ?? null}
        cancelandoTransaccion={cancelandoTransaccionVistaPrevia}
        onImprimir={() => {
          const pack = previsualizacionCobro;
          if (!pack) return;
          setPrevisualizacionCobro(null);
          void (async () => {
            if (pack.ensamblePendiente && pack.ensamblePendiente.lineas.length > 0) {
              await ejecutarAplicarVentaEnsambleWmsDesdeBody(pack.ensamblePendiente);
            }
            await ejecutarImpresionPostCobro(pack.ticket);
          })();
        }}
        onCancelarTransaccion={() => void handleCancelarTransaccionVistaPrevia()}
      />

      <CobroImpresionCelebracionOverlay open={cobroImpresionOverlayOpen} />

      <PosGebBienvenidaModal
        open={posGebBienvenidaAbierta}
        onExperienced={() => {
          if (!user?.uid) return;
          writePosGebOnboarding(user.uid, {
            version: 1,
            answeredAt: new Date().toISOString(),
            isNewUser: false,
          });
          setPosGebBienvenidaAbierta(false);
        }}
        onNewUser={() => {
          if (!user?.uid) return;
          writePosGebOnboarding(user.uid, {
            version: 1,
            answeredAt: new Date().toISOString(),
            isNewUser: true,
            tutorialCompleted: false,
          });
          setPosGebBienvenidaAbierta(false);
          setPosGebTutorialAbierto(true);
          setPosGebTutorialPaso(0);
        }}
      />

      <PosGebTutorialOverlay
        open={posGebTutorialAbierto}
        steps={pasosTutorialPosGeb}
        stepIndex={posGebTutorialPaso}
        onStepIndexChange={setPosGebTutorialPaso}
        onComplete={finalizarTutorialPosGeb}
        onNavigateModule={handleTutorialNavigatePosGeb}
        esContador={esContador}
      />

      <PosGebAyudaMotorModal
        open={posGebAyudaAbierta}
        onClose={() => setPosGebAyudaAbierta(false)}
        onIrAModulo={handleAyudaIrAPosGeb}
        esContador={esContador}
        onReiniciarBienvenida={() => {
          if (user?.uid) clearPosGebOnboarding(user.uid);
          setPosGebAyudaAbierta(false);
          window.location.reload();
        }}
      />
    </div>
  );
}
