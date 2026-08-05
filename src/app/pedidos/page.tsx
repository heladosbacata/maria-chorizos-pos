"use client";

import Image from "next/image";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { pedidoIdChatClave } from "@/lib/pos-domicilios-pv-clave";
import { getCatalogoPOS } from "@/lib/catalogo-pos";
import { DEFAULT_COSTO_DOMICILIO_COP, DEFAULT_UMBRAL_GRATIS_COP } from "@/lib/pos-domicilios-tarifa-defaults";
import {
  catalogoDomiciliosPorSkuIgual,
  normalizarCatalogoDomiciliosPorSku,
  productoHabilitadoEnDomiciliosPunto,
} from "@/lib/pos-domicilios-catalogo-sku";
import {
  estaEnHorarioDomiciliosConfig,
  textoHorarioDomiciliosCliente,
} from "@/lib/pos-domicilios-horario";
import {
  horarioSemanalVacioDefault,
  normalizarHorarioSemanalDomicilios,
  type HorarioSemanalDomicilios,
} from "@/lib/pos-domicilios-horario-semanal";
import { comprimirComprobanteTransferenciaParaChat } from "@/lib/pos-domicilios-chat-imagen";
import { domicilioCancelarCliente } from "@/lib/pos-domicilios-api";
import { enviarMensajeChatDomicilio, listarMensajesChatDomicilio } from "@/lib/pos-domicilios-chat-api";
import { pedidoPuedeCancelarsePorCliente, type PedidoDomicilio } from "@/types/pos-domicilios";
import { LOGO_ORG_URL, MASCOTA_DOMICILIOS_URL } from "@/lib/brand";
import MediosTransferenciaClienteModal from "@/components/MediosTransferenciaClienteModal";
import PedidosClubMillasCheckout, {
  type PedidosClubMillasVinculo,
} from "@/components/PedidosClubMillasCheckout";
import PuntoCerradoPremiumView from "@/components/PuntoCerradoPremiumView";
import { consultarTurnoCajaAbierto } from "@/lib/pos-punto-turno-presencia";
import { PosDomiciliosChatBurbuja } from "@/components/PosDomiciliosChatBurbuja";
import { normalizarMediosTransferencia } from "@/lib/pos-domicilios-medios-transferencia";
import {
  activarNotificacionesPedidoDomicilio,
  esIosSafariSinPwa,
  pedidoYaTeniasPushLocal,
  pedidosPushSoportadoEnEsteNavegador,
  permisoNotificacionesPedidos,
} from "@/lib/pedidos-push-client";
import {
  esEstadoTerminalPedidoDomicilio,
  guardarBorradorCarritoPedidos,
  guardarClientePreferidoPedidos,
  guardarSesionPedidoDomicilio,
  leerBorradorCarritoPedidos,
  leerClientePreferidoPedidos,
  leerSesionPedidoDomicilio,
  limpiarBorradorCarritoPedidos,
  limpiarSesionPedidoDomicilio,
  resumenDesdePedidoApi,
  telefonoDomicilioNorm,
} from "@/lib/pos-domicilios-pedido-sesion";
import {
  filtrarCatalogoPorTab,
  subtituloTarjetaCatalogoPedidos,
  tabCatalogoDeProducto,
  TABS_CATALOGO_PEDIDOS,
  type TabCatalogoPedidos,
} from "@/lib/pos-pedidos-catalogo-tabs";
import { Bike, Store } from "lucide-react";
import {
  MEDIOS_TRANSFERENCIA_VACIOS,
  type MediosTransferenciaConfig,
} from "@/types/pos-domicilios-medios-transferencia";
import type { ProductoPOS } from "@/types";
import type { MensajeChatDomicilio } from "@/types/pos-domicilios-chat";
import {
  OPCIONES_SELECCION_SALSA_UI,
  esTokenSalsaPedido,
  etiquetaTokenSalsaPedido,
  productoEsPaqueteArepa,
  productoRequiereSalsaFavorita,
  productoRequiereSoloTipoArepaPeto,
  type TokenSalsaPedido,
} from "@/lib/chorizo-variante-pos";
import {
  descripcionBebidaParaUi,
  unificarAguaBrisaEnCatalogo,
  variantesBebidaParaUi,
} from "@/lib/bebida-variantes-display";

export const dynamic = "force-dynamic";

type MetodoPago = "efectivo" | "transferencia" | "datafono";
type CanalPedido = "web" | "qr";
type TipoEntregaPedido = "domicilio" | "recogida";

const CLUB_MILLAS_URL = "https://maria-chorizos-wms.vercel.app/club-de-millas/mi-plan";
/** Sync menú domicilios ↔ caja (productos habilitados/deshabilitados). */
const INTERVALO_SYNC_CONFIG_DOMICILIOS_MS = 8_000;

function abrirClubMillasEnVentanaEmergente(): void {
  if (typeof window === "undefined") return;
  window.open(
    CLUB_MILLAS_URL,
    "club_millas_maria_chorizos",
    "noopener,noreferrer,width=1120,height=820,scrollbars=yes,resizable=yes"
  );
}
/** Resumen fijado al confirmar el pedido (para el chat y reglas de comprobante). */
type ResumenPedidoChatCliente = {
  lineasItems: string[];
  total: number;
  metodoPago: MetodoPago;
  direccion: string;
  referencia?: string;
  tipoEntrega: TipoEntregaPedido;
  puntoVenta: string;
};

type EstadoPedidoDomicilio =
  | "NUEVO"
  | "ACEPTADO"
  | "EN_PREPARACION"
  | "LISTO_PARA_DESPACHO"
  | "EN_ENTREGA"
  | "ENTREGADO"
  | "RECHAZADO"
  | "CANCELADO";

function formatoMoneda(valor: number): string {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(
    valor
  );
}

function etiquetaMetodoPagoCliente(m: MetodoPago): string {
  if (m === "transferencia") return "Transferencia";
  if (m === "datafono") return "Datáfono";
  return "Efectivo";
}

function formatoHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--:--";
  return new Intl.DateTimeFormat("es-CO", { hour: "2-digit", minute: "2-digit" }).format(d);
}

function textoNormalizado(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Etiqueta única de categoría (evita duplicados tipo Basicos / Básicos). */
const ETIQUETA_CATEGORIA_BEBIDAS = "Bebidas";
const ETIQUETA_CATEGORIA_COMPLEMENTOS = "Complementos";

function canonizarEtiquetaCategoria(c: string): string {
  const raw = c.trim();
  if (!raw) return "";
  const n = textoNormalizado(raw);
  if (n === "basicos") return "Básicos";
  if (n === "bebidas" || n === "bebida") return ETIQUETA_CATEGORIA_BEBIDAS;
  if (n === "complementos" || n === "complemento" || n === "adicionales" || n === "extras") {
    return ETIQUETA_CATEGORIA_COMPLEMENTOS;
  }
  return raw;
}

function categoriaProducto(p: ProductoPOS): string {
  return canonizarEtiquetaCategoria(p.categoria ?? "") || "Especialidades";
}

function productoEsBebidas(p: ProductoPOS): boolean {
  const cat = categoriaProducto(p);
  if (cat === ETIQUETA_CATEGORIA_BEBIDAS) return true;
  const t = textoNormalizado(`${p.descripcion} ${p.categoria ?? ""}`);
  return /gaseosa|limonada|jugo|bebida|agua|soda|malteada/.test(t);
}

function productoEsComboCatalogo(p: ProductoPOS): boolean {
  return /combo/.test(textoNormalizado(`${p.descripcion} ${p.categoria ?? ""}`));
}

function productoEsPaqueteCatalogo(p: ProductoPOS): boolean {
  return /paquete/.test(textoNormalizado(`${p.descripcion} ${p.categoria ?? ""}`));
}

function productoEsBasicos(p: ProductoPOS): boolean {
  return categoriaProducto(p) === "Básicos";
}

/** Visible en menú de domicilios si el punto lo tiene habilitado (default ON). */
function productoVisibleEnCatalogoDomicilios(
  p: ProductoPOS,
  catalogoDomiciliosPorSku: Record<string, boolean>
): boolean {
  return productoHabilitadoEnDomiciliosPunto(p.sku, catalogoDomiciliosPorSku);
}

function primeraImagenProducto(p: ProductoPOS): string | null {
  const url = (p.urlImagen ?? "").trim();
  if (!url) return null;
  return url;
}

function imagenProductoOptimizable(src: string): boolean {
  if (src.startsWith("/")) return true;
  try {
    const u = new URL(src);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

type VarianteUi = {
  key: string;
  label: string;
  precio: number;
};

type CarritoLinea = {
  lineKey: string;
  p: ProductoPOS;
  cantidad: number;
  varianteKey: string | null;
  varianteLabel: string | null;
  salsaKey: TokenSalsaPedido | null;
  salsaLabel: string | null;
  precioUnitarioLinea: number;
};

const VARIANTE_BASE_KEY = "__base";
const SALSA_KEY_PREFIX = "salsa:";

function keyLineaPedido(
  sku: string,
  varianteKey: string | null,
  salsaKey: TokenSalsaPedido | null = null
): string {
  const base = `${sku}::${varianteKey ?? VARIANTE_BASE_KEY}`;
  if (!salsaKey) return base;
  return `${base}::${SALSA_KEY_PREFIX}${salsaKey}`;
}

function parseKeyLineaPedido(lineKey: string): {
  sku: string;
  varianteKey: string | null;
  salsaKey: TokenSalsaPedido | null;
} {
  const parts = lineKey.split("::");
  const sku = (parts[0] ?? "").trim();
  const vk = (parts[1] ?? VARIANTE_BASE_KEY).trim();
  const salsaRaw = (parts[2] ?? "").trim();
  const salsaToken = salsaRaw.startsWith(SALSA_KEY_PREFIX)
    ? salsaRaw.slice(SALSA_KEY_PREFIX.length)
    : "";
  return {
    sku,
    varianteKey: vk && vk !== VARIANTE_BASE_KEY ? vk : null,
    salsaKey: esTokenSalsaPedido(salsaToken) ? salsaToken : null,
  };
}

function etiquetaLineaPedido(varianteLabel: string | null, salsaLabel: string | null): string | null {
  const parts = [varianteLabel, salsaLabel].filter(Boolean) as string[];
  return parts.length ? parts.join(" · ") : null;
}

function textoVarianteNorm(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Precio de una opción de arepa peto, resolviendo claves/etiquetas del WMS. */
function precioOpcionArepaPeto(p: ProductoPOS, tipo: "queso_bocadillo" | "arepa_queso"): number {
  const preciosMap = p.preciosPorVariante ?? {};
  const variantes = Array.isArray(p.variantes) ? p.variantes : [];
  const match = (pred: (t: string) => boolean): number | null => {
    for (const v of variantes) {
      const t = textoVarianteNorm(`${v.clave ?? ""} ${v.etiqueta ?? ""}`);
      if (!pred(t)) continue;
      const pr = v.precioVenta ?? preciosMap[(v.clave ?? "").trim()];
      if (typeof pr === "number" && Number.isFinite(pr)) return pr;
    }
    for (const [key, pr] of Object.entries(preciosMap)) {
      if (!pred(textoVarianteNorm(key))) continue;
      if (typeof pr === "number" && Number.isFinite(pr)) return pr;
    }
    return null;
  };

  if (tipo === "queso_bocadillo") {
    return (
      match((t) => t.includes("bocadillo")) ??
      match((t) => t.includes("queso_bocadillo")) ??
      p.precioUnitario
    );
  }
  return (
    match((t) => t.includes("peto") && !t.includes("bocadillo")) ??
    match((t) => (t.includes("arepa_queso") || t.includes("arepa de queso")) && !t.includes("bocadillo")) ??
    match((t) => t.includes("peto_queso")) ??
    p.precioUnitario
  );
}

/**
 * Variantes del producto en el menú de domicilios.
 * Arepa de peto: solo 2 opciones (como en caja), aunque el WMS mande 3.
 * Paquetes de arepas: sin variantes (el nombre ya dice queso / bocadillo).
 * Bebidas: dedupe + tamaño del nombre (ej. 600 ml) como variante.
 */
function opcionesVariantesProducto(p: ProductoPOS): VarianteUi[] {
  // Paquete arepa queso / paquete arepa queso+bocadillo: productos distintos, sin selector.
  if (productoEsPaqueteArepa(p)) return [];

  if (productoRequiereSoloTipoArepaPeto(p)) {
    return [
      {
        key: "queso_bocadillo",
        label: "Arepa de queso y Bocadillo",
        precio: precioOpcionArepaPeto(p, "queso_bocadillo"),
      },
      {
        key: "arepa_queso",
        label: "Arepa de queso (Peto)",
        precio: precioOpcionArepaPeto(p, "arepa_queso"),
      },
    ];
  }

  if (productoEsBebidas(p)) {
    return variantesBebidaParaUi(p).map((v) => ({
      key: v.clave,
      label: v.etiqueta,
      precio: v.precioVenta ?? p.precioUnitario,
    }));
  }

  const out: VarianteUi[] = [];
  const preciosMap = p.preciosPorVariante ?? {};
  const seenKeys = new Set<string>();
  const seenLabels = new Set<string>();
  /** arepa_queso y peto_queso son la misma arepa (legado WMS). */
  const canonKey = (key: string): string => {
    const n = textoVarianteNorm(key);
    if (n === "peto_queso" || n === "arepa_queso") return "arepa_queso";
    return key.trim();
  };
  /** Misma etiqueta visible = misma opción (p. ej. dos claves WMS con "250 ml"). */
  const canonLabel = (label: string): string =>
    textoVarianteNorm(label)
      .replace(/\s+/g, " ")
      .replace(/(\d)\s*ml\b/g, "$1 ml");
  const pushVar = (keyRaw: string, labelRaw: string, precio: number) => {
    const key = canonKey(keyRaw);
    if (!key || seenKeys.has(key)) return;
    let label = (labelRaw || keyRaw).trim();
    const ln = textoVarianteNorm(label);
    if (key === "arepa_queso" || ln === "arepa de queso" || (ln.includes("peto") && !ln.includes("bocadillo"))) {
      label = "Arepa de queso (Peto)";
    }
    const labelKey = canonLabel(label);
    if (labelKey && seenLabels.has(labelKey)) return;
    seenKeys.add(key);
    if (labelKey) seenLabels.add(labelKey);
    out.push({ key, label, precio: Number.isFinite(precio) ? precio : p.precioUnitario });
  };

  if (Array.isArray(p.variantes) && p.variantes.length > 0) {
    for (const v of p.variantes) {
      const key = (v.clave ?? "").trim();
      if (!key) continue;
      const label = (v.etiqueta ?? key).trim();
      const precio = v.precioVenta ?? preciosMap[key] ?? p.precioUnitario;
      pushVar(key, label, typeof precio === "number" ? precio : p.precioUnitario);
    }
    return out;
  }
  const keys = Object.keys(preciosMap);
  for (const key of keys) {
    const precio = preciosMap[key];
    if (!key.trim() || !Number.isFinite(precio)) continue;
    pushVar(key.trim(), key.trim(), precio as number);
  }
  return out;
}

function estadoEtiqueta(estado: EstadoPedidoDomicilio | null): string {
  if (!estado) return "Recibido";
  if (estado === "NUEVO") return "Recibido";
  if (estado === "ACEPTADO") return "Aceptado";
  if (estado === "EN_PREPARACION") return "En preparacion";
  if (estado === "LISTO_PARA_DESPACHO") return "Listo para despacho";
  if (estado === "EN_ENTREGA") return "En camino";
  if (estado === "ENTREGADO") return "Entregado";
  if (estado === "CANCELADO") return "Cancelado";
  return "Rechazado";
}

function estadoPaso(estado: EstadoPedidoDomicilio | null): number {
  if (!estado || estado === "NUEVO") return 1;
  if (estado === "ACEPTADO") return 2;
  if (estado === "EN_PREPARACION") return 3;
  if (estado === "LISTO_PARA_DESPACHO") return 4;
  if (estado === "EN_ENTREGA") return 5;
  if (estado === "ENTREGADO") return 6;
  return 0;
}

/** Semáforo en tiempo real: rojo espera · ámbar cocina · verde en camino/entregado. */
function semaforoEstadoPedido(estado: EstadoPedidoDomicilio | null): {
  color: "rojo" | "ambar" | "verde" | "apagado";
  label: string;
  hint: string;
} {
  if (!estado || estado === "NUEVO") {
    return { color: "rojo", label: "En espera", hint: "El punto todavía no acepta su pedido" };
  }
  if (estado === "ACEPTADO" || estado === "EN_PREPARACION" || estado === "LISTO_PARA_DESPACHO") {
    return { color: "ambar", label: "En cocina", hint: "Ya le estamos preparando su pedido" };
  }
  if (estado === "EN_ENTREGA") {
    return { color: "verde", label: "En camino", hint: "Ya salió pa' donde usted" };
  }
  if (estado === "ENTREGADO") {
    return { color: "verde", label: "Entregado", hint: "¡Buen provecho!" };
  }
  return { color: "apagado", label: estadoEtiqueta(estado), hint: "Pedido finalizado" };
}

function rangoEtaEstado(estado: EstadoPedidoDomicilio | null, minutosTranscurridos: number): string {
  if (estado === "ENTREGADO") return "Pedido entregado";
  if (estado === "RECHAZADO") return "Pedido rechazado";
  if (estado === "CANCELADO") return "Pedido cancelado";
  const objetivoBase =
    estado === "NUEVO"
      ? 42
      : estado === "ACEPTADO"
        ? 36
        : estado === "EN_PREPARACION"
          ? 30
          : estado === "LISTO_PARA_DESPACHO"
            ? 20
            : estado === "EN_ENTREGA"
              ? 10
              : 42;
  const restante = Math.max(3, objetivoBase - Math.max(0, minutosTranscurridos));
  const desde = Math.max(2, restante - 4);
  const hasta = restante + 6;
  return `${desde} - ${hasta} min`;
}

type VarianteMotivacionEstado = "exito" | "entrega" | "rechazo";

function textoMotivacionCambioEstado(
  estado: EstadoPedidoDomicilio,
  rechazoMotivo?: string | null
): {
  titulo: string;
  subtitulo: string;
  variante: VarianteMotivacionEstado;
  confeti: boolean;
} | null {
  switch (estado) {
    case "NUEVO":
      return null;
    case "ACEPTADO":
      return {
        titulo: "¡Su pedido fue aceptado!",
        subtitulo: "El equipo ya está trabajando en su orden, a la orden.",
        variante: "exito",
        confeti: true,
      };
    case "EN_PREPARACION":
      return {
        titulo: "¡En la cocina!",
        subtitulo: "Le estamos preparando su pedido con todo el sabor.",
        variante: "exito",
        confeti: true,
      };
    case "LISTO_PARA_DESPACHO":
      return {
        titulo: "¡Listo pa' salir!",
        subtitulo: "Su pedido ya está listo para despacho.",
        variante: "exito",
        confeti: true,
      };
    case "EN_ENTREGA":
      return {
        titulo: "¡Va en camino!",
        subtitulo: "Prepárese pa' disfrutar algo bien rico.",
        variante: "entrega",
        confeti: true,
      };
    case "ENTREGADO":
      return {
        titulo: "¡Pedido entregado!",
        subtitulo: "Gracias por preferir María Chorizos. ¡Buen provecho!",
        variante: "entrega",
        confeti: true,
      };
    case "RECHAZADO":
      return {
        titulo: "Pedido no disponible",
        subtitulo: rechazoMotivo?.trim()
          ? `Motivo: ${rechazoMotivo.trim()}`
          : "Si tiene dudas, escríbanos por el chat. Con mucho gusto le ayudamos.",
        variante: "rechazo",
        confeti: false,
      };
    case "CANCELADO":
      return {
        titulo: "Pedido cancelado",
        subtitulo: rechazoMotivo?.trim()
          ? rechazoMotivo.trim()
          : "Canceló su pedido. Puede armar uno nuevo cuando quiera.",
        variante: "rechazo",
        confeti: false,
      };
    default:
      return null;
  }
}

function PedidosConfetiCambioEstado({ burstKey }: { burstKey: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => ({
        id: i,
        leftPct: ((i * 37 + burstKey) % 100) / 100,
        delayS: ((i % 9) * 0.035).toFixed(3),
        durationS: (2.1 + (i % 6) * 0.12).toFixed(2),
        driftPx: -55 + ((i * 23 + burstKey) % 110),
        hue: (i * 47 + (burstKey % 360)) % 360,
        sizePx: 6 + (i % 4),
      })),
    [burstKey]
  );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {pieces.map((p) => (
        <span
          key={p.id}
          className="pedidos-estado-confetti-piece absolute top-0 rounded-sm"
          style={{
            left: `${p.leftPct * 100}%`,
            width: p.sizePx,
            height: Math.round(p.sizePx * 1.1),
            animationDelay: `${p.delayS}s`,
            animationDuration: `${p.durationS}s`,
            backgroundColor: `hsl(${p.hue} 82% 58%)`,
            ["--pde-drift" as string]: `${p.driftPx}px`,
          }}
        />
      ))}
    </div>
  );
}

function PedidosOverlayMotivacionEstado({
  titulo,
  subtitulo,
  variante,
  mostrarConfeti,
  burstKey,
}: {
  titulo: string;
  subtitulo: string;
  variante: VarianteMotivacionEstado;
  mostrarConfeti: boolean;
  burstKey: number;
}) {
  const cardClass =
    variante === "rechazo"
      ? "border-rose-200 bg-gradient-to-br from-rose-50 to-white text-rose-950"
      : variante === "entrega"
        ? "border-emerald-200 bg-gradient-to-br from-emerald-50 via-cyan-50 to-white text-emerald-950"
        : "border-amber-200 bg-gradient-to-br from-amber-50 via-white to-cyan-50 text-cyan-950";

  const iconWrap =
    variante === "rechazo"
      ? "bg-rose-100 text-rose-700"
      : variante === "entrega"
        ? "bg-emerald-100 text-emerald-700"
        : "bg-amber-100 text-amber-700";

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center p-5 sm:p-8"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]" aria-hidden />
      {mostrarConfeti ? <PedidosConfetiCambioEstado burstKey={burstKey} /> : null}
      <div
        className={`relative z-10 w-full max-w-sm rounded-3xl border-2 px-5 py-7 shadow-2xl sm:px-7 sm:py-8 ${cardClass} animate-pedidos-estado-motiv-pop`}
      >
        <div
          className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl ${iconWrap} ${variante !== "rechazo" ? "animate-pedidos-estado-motiv-halo" : ""}`}
          aria-hidden
        >
          {variante === "rechazo" ? (
            <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          ) : variante === "entrega" ? (
            <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          ) : (
            <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
          )}
        </div>
        <h2 className="text-center text-xl font-black leading-tight sm:text-2xl">{titulo}</h2>
        <p className="mt-2 text-center text-sm font-semibold leading-snug opacity-90">{subtitulo}</p>
      </div>
    </div>
  );
}

function sugerenciaScore(
  p: ProductoPOS,
  carritoSkus: Set<string>,
  categoriasCarrito: Set<string>
): number {
  if (carritoSkus.has(p.sku)) return -999;
  const texto = textoNormalizado(`${p.descripcion} ${p.categoria ?? ""}`);
  let s = 0;
  if (/gaseosa|limonada|jugo|bebida|agua|soda|cerveza/.test(texto)) s += 5;
  if (/salsa|chimichurri|aji|ajo/.test(texto)) s += 4;
  if (/papa|arepa|ensalada|extra|postre/.test(texto)) s += 3;
  const cat = categoriaProducto(p);
  if (categoriasCarrito.size > 0 && !categoriasCarrito.has(cat)) s += 2;
  if (p.precioUnitario > 0 && p.precioUnitario <= 12000) s += 1;
  return s;
}

function porcentajeProgresoDomicilioGratis(subtotal: number, metaGratisCop: number): number {
  const meta = metaGratisCop > 0 ? metaGratisCop : DEFAULT_UMBRAL_GRATIS_COP;
  if (subtotal <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((subtotal / meta) * 100)));
}

function PedidosLandingClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const puntoVenta = (searchParams?.get("puntoVenta") ?? "Punto Demo App").trim();
  const pedidoIdEnUrl = pedidoIdChatClave(searchParams?.get("pedidoId") ?? "");
  const canalQuery = (searchParams?.get("canal") ?? "web").trim().toLowerCase();
  const canal: CanalPedido = canalQuery === "qr" ? "qr" : "web";

  const [catalogo, setCatalogo] = useState<ProductoPOS[]>([]);
  const [loadingCatalogo, setLoadingCatalogo] = useState(false);
  const [errorCatalogo, setErrorCatalogo] = useState<string | null>(null);
  const [cantidades, setCantidades] = useState<Record<string, number>>({});
  const [varianteSeleccionadaPorSku, setVarianteSeleccionadaPorSku] = useState<Record<string, string>>({});
  const [salsaSeleccionadaPorSku, setSalsaSeleccionadaPorSku] = useState<
    Record<string, TokenSalsaPedido>
  >({});
  const [cliente, setCliente] = useState("");
  const [telefono, setTelefono] = useState("");
  const [direccion, setDireccion] = useState("");
  const [referencia, setReferencia] = useState("");
  const [metodoPago, setMetodoPago] = useState<MetodoPago>("efectivo");
  const [tipoEntrega, setTipoEntrega] = useState<TipoEntregaPedido>("recogida");
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [pedidoCreadoId, setPedidoCreadoId] = useState<string | null>(null);
  const [pedidoCreadoEnIso, setPedidoCreadoEnIso] = useState<string | null>(null);
  const [estadoPedido, setEstadoPedido] = useState<EstadoPedidoDomicilio | null>(null);
  const [rechazoMotivoPedido, setRechazoMotivoPedido] = useState<string | null>(null);
  const [estadoPedidoLoading, setEstadoPedidoLoading] = useState(false);
  const [ahoraMs, setAhoraMs] = useState(Date.now());
  const [tabCatalogo, setTabCatalogo] = useState<TabCatalogoPedidos>("basicos");
  const [carruselIdx, setCarruselIdx] = useState(0);
  const [alertaClienteToast, setAlertaClienteToast] = useState<string | null>(null);
  const [chatVista, setChatVista] = useState<"cerrado" | "minimizado" | "expandido">("cerrado");
  const [chatMensajes, setChatMensajes] = useState<MensajeChatDomicilio[]>([]);
  const [chatTexto, setChatTexto] = useState("");
  const [chatCargando, setChatCargando] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatEnviando, setChatEnviando] = useState(false);
  const [etiquetaClienteChat, setEtiquetaClienteChat] = useState("");
  const [animacionCambioEstadoPedido, setAnimacionCambioEstadoPedido] = useState<{
    key: number;
    titulo: string;
    subtitulo: string;
    variante: VarianteMotivacionEstado;
    confeti: boolean;
  } | null>(null);
  const [resaltarTarjetaEstadoPedido, setResaltarTarjetaEstadoPedido] = useState(false);
  const [pushPedidosActivando, setPushPedidosActivando] = useState(false);
  const [pushPedidosMensaje, setPushPedidosMensaje] = useState<string | null>(null);
  const [pushPedidosExito, setPushPedidosExito] = useState(false);
  const [pushPedidosNavOk, setPushPedidosNavOk] = useState(false);
  const [modalPushPedidoAbierto, setModalPushPedidoAbierto] = useState(false);
  const [modalHistorialAbierto, setModalHistorialAbierto] = useState(false);
  const [historialTelefono, setHistorialTelefono] = useState("");
  const [historialLoading, setHistorialLoading] = useState(false);
  const [historialError, setHistorialError] = useState<string | null>(null);
  const [historialPedidos, setHistorialPedidos] = useState<PedidoDomicilio[]>([]);
  const [guardarDatosCliente, setGuardarDatosCliente] = useState(true);
  const [clubMillasVinculo, setClubMillasVinculo] = useState<PedidosClubMillasVinculo | null>(null);
  /** Modal obligatorio al confirmar: cédula / registro Club de Millas. */
  const [modalClubMillasConfirmacion, setModalClubMillasConfirmacion] = useState(false);
  const sesionRestauradaRef = useRef(false);
  const pushPromptEstadosRef = useRef<Set<string>>(new Set());
  const [carritoModalAbierto, setCarritoModalAbierto] = useState(false);
  const [modalConfirmarSoloRecogida, setModalConfirmarSoloRecogida] = useState(false);
  /** El cliente debe elegir recogida o domicilio en el modal antes de armar el pedido. */
  const [tipoEntregaElegido, setTipoEntregaElegido] = useState(false);
  const [modalCancelarPedidoAbierto, setModalCancelarPedidoAbierto] = useState(false);
  const [motivoCancelacionPedido, setMotivoCancelacionPedido] = useState("");
  const [cancelandoPedido, setCancelandoPedido] = useState(false);
  const [mensajeCancelacionPedido, setMensajeCancelacionPedido] = useState<string | null>(null);
  const [chatMensajesNoLeidos, setChatMensajesNoLeidos] = useState(0);
  const [chatResumenColapsado, setChatResumenColapsado] = useState(false);
  const [pedidoResumenChat, setPedidoResumenChat] = useState<ResumenPedidoChatCliente | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const ultimoMensajePosIdRef = useRef<string | null>(null);
  const chatComprobanteInputRef = useRef<HTMLInputElement | null>(null);
  const chatFotoCamaraInputRef = useRef<HTMLInputElement | null>(null);
  const chatFotoGaleriaInputRef = useRef<HTMLInputElement | null>(null);
  const checkoutRef = useRef<HTMLDivElement | null>(null);
  const rastreadorPedidoRef = useRef<HTMLElement | null>(null);
  const estadoPedidoAnteriorRef = useRef<EstadoPedidoDomicilio | null>(null);
  const [tarifaDomicilio, setTarifaDomicilio] = useState({
    costoDomicilioCop: DEFAULT_COSTO_DOMICILIO_COP,
    umbralGratisCop: DEFAULT_UMBRAL_GRATIS_COP,
    domiciliosHabilitados: true,
    recogerEnTiendaHabilitado: true,
    domicilioConDomiciliarioHabilitado: false,
    domiciliosHoraInicio: "07:00",
    domiciliosHoraFin: "22:00",
    domiciliosHorarioSemanal: horarioSemanalVacioDefault(),
    mediosTransferencia: { ...MEDIOS_TRANSFERENCIA_VACIOS } as MediosTransferenciaConfig,
    catalogoDomiciliosPorSku: {} as Record<string, boolean>,
  });
  const [modalMediosTransferenciaCliente, setModalMediosTransferenciaCliente] = useState(false);
  /** Fuerza reevaluación del horario local (Colombia) sin depender solo del fetch periódico. */
  const [tickHorarioRecepcion, setTickHorarioRecepcion] = useState(0);
  /** null = consultando al WMS; true/false = turno de caja abierto/cerrado. */
  const [turnoCajaAbierto, setTurnoCajaAbierto] = useState<boolean | null>(null);

  const tienePedidoVinculado = Boolean(pedidoCreadoId || pedidoIdEnUrl);

  const pedidoEnCurso = useMemo(() => {
    if (!pedidoCreadoId) return false;
    if (!estadoPedido) return true;
    return estadoPedido !== "ENTREGADO" && estadoPedido !== "RECHAZADO" && estadoPedido !== "CANCELADO";
  }, [pedidoCreadoId, estadoPedido]);

  /** Pedido terminado (rechazado/cancelado/entregado): ya no bloquea armar uno nuevo. */
  const pedidoFinalizado = useMemo(
    () => Boolean(pedidoCreadoId && estadoPedido && esEstadoTerminalPedidoDomicilio(estadoPedido)),
    [pedidoCreadoId, estadoPedido]
  );

  const puedeCancelarPedido = useMemo(() => {
    if (!pedidoCreadoId || !estadoPedido) return false;
    return pedidoPuedeCancelarsePorCliente(estadoPedido);
  }, [pedidoCreadoId, estadoPedido]);

  const vapidPublicPedidos = useMemo(() => process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? "", []);

  const sincronizarPedidoEnUrl = useCallback(
    (pedidoId: string | null) => {
      if (typeof window === "undefined") return;
      const params = new URLSearchParams(window.location.search);
      if (pedidoId) params.set("pedidoId", pedidoIdChatClave(pedidoId));
      else params.delete("pedidoId");
      const qs = params.toString();
      router.replace(qs ? `/pedidos?${qs}` : "/pedidos", { scroll: false });
    },
    [router]
  );

  /** Libera el pedido terminado para que el cliente pueda armar uno nuevo. */
  const liberarPedidoParaNuevo = useCallback(() => {
    limpiarSesionPedidoDomicilio(puntoVenta);
    setPedidoCreadoId(null);
    sincronizarPedidoEnUrl(null);
    setEstadoPedido(null);
    setRechazoMotivoPedido(null);
    setPedidoCreadoEnIso(null);
    setPedidoResumenChat(null);
    setChatMensajes([]);
    setChatError(null);
    setChatVista("cerrado");
    setChatMensajesNoLeidos(0);
    setMensaje(null);
    setAnimacionCambioEstadoPedido(null);
    setModalCancelarPedidoAbierto(false);
    setModalPushPedidoAbierto(false);
    estadoPedidoAnteriorRef.current = null;
    ultimoMensajePosIdRef.current = null;
    setTipoEntregaElegido(false);
    setClubMillasVinculo(null);
    setModalClubMillasConfirmacion(false);
    const pref = leerClientePreferidoPedidos(puntoVenta);
    if (pref?.nombre) setCliente(pref.nombre);
    if (pref?.telefono) {
      setTelefono(pref.telefono);
      setHistorialTelefono(pref.telefono);
    }
  }, [puntoVenta, sincronizarPedidoEnUrl]);

  useEffect(() => {
    sesionRestauradaRef.current = false;
    // Al entrar o cambiar de punto, el cliente debe volver a elegir recogida/domicilio.
    setTipoEntregaElegido(false);
  }, [puntoVenta]);

  useEffect(() => {
    if (!pedidoIdEnUrl) return;
    setPedidoCreadoId((prev) => (prev === pedidoIdEnUrl ? prev : pedidoIdEnUrl));
    setChatVista((v) => (v === "cerrado" ? "minimizado" : v));
  }, [pedidoIdEnUrl]);

  /** Prefill nombre/teléfono, carrito borrador y restaurar pedido activo sin pedidoId en URL. */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const pref = leerClientePreferidoPedidos(puntoVenta);
    if (pref) {
      if (pref.nombre) setCliente((c) => c || pref.nombre);
      if (pref.telefono) {
        setTelefono((t) => t || pref.telefono);
        setHistorialTelefono((t) => t || pref.telefono);
      }
    }
    const borrador = leerBorradorCarritoPedidos(puntoVenta);
    if (borrador && !pedidoIdEnUrl) {
      setCantidades((prev) => (Object.keys(prev).length ? prev : borrador.cantidades));
      // Restauramos preferencias del borrador, pero NO marcamos entrega como elegida:
      // al refrescar / abrir de nuevo el modal de recogida vs domicilio debe aparecer.
      setTipoEntrega(borrador.tipoEntrega);
      setMetodoPago(borrador.metodoPago);
      if (borrador.direccion) setDireccion((d) => d || borrador.direccion);
      if (borrador.referencia) setReferencia((r) => r || borrador.referencia);
    }
    if (pedidoIdEnUrl || sesionRestauradaRef.current) return;
    sesionRestauradaRef.current = true;
    const sesion = leerSesionPedidoDomicilio(puntoVenta);
    if (!sesion?.pedidoId) return;
    let cancelled = false;
    void (async () => {
      const aplicarDesdeSesion = (estado?: PedidoDomicilio["estado"] | null, row?: PedidoDomicilio) => {
        sincronizarPedidoEnUrl(sesion.pedidoId);
        setPedidoCreadoId(sesion.pedidoId);
        if (estado) setEstadoPedido(estado);
        if (row?.creadoEnIso) setPedidoCreadoEnIso(row.creadoEnIso);
        else if (sesion.creadoEnIso) setPedidoCreadoEnIso(sesion.creadoEnIso);
        setRechazoMotivoPedido(row?.rechazoMotivo ?? null);
        setEtiquetaClienteChat(row?.cliente || sesion.cliente || "Cliente");
        const resumen =
          sesion.resumen ??
          (row
            ? resumenDesdePedidoApi({
                items: row.items,
                total: row.total,
                metodoPago: row.metodoPago,
                direccion: row.direccion,
                referencia: row.referencia,
                puntoVenta: row.puntoVenta,
              })
            : undefined);
        if (resumen) {
          setPedidoResumenChat({
            lineasItems: resumen.lineasItems,
            total: resumen.total,
            metodoPago: resumen.metodoPago,
            direccion: resumen.direccion,
            referencia: resumen.referencia,
            tipoEntrega: resumen.tipoEntrega,
            puntoVenta: resumen.puntoVenta,
          });
        }
        setChatVista("minimizado");
        if (row?.cliente || sesion.cliente) setCliente(row?.cliente || sesion.cliente);
        if (row?.telefono || sesion.telefono) {
          const tel = telefonoDomicilioNorm(row?.telefono || sesion.telefono) || row?.telefono || sesion.telefono;
          setTelefono(tel);
        }
      };

      try {
        const url = `/api/pos_domicilios?${new URLSearchParams({ puntoVenta }).toString()}`;
        const res = await fetch(url, { method: "GET", cache: "no-store" });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          data?: PedidoDomicilio[];
        };
        if (cancelled) return;
        if (!res.ok) {
          // Red/API falló: no borrar sesión; mostrar pedido guardado en el dispositivo.
          aplicarDesdeSesion(null);
          return;
        }
        const row = (json.data ?? []).find((x) => pedidoIdChatClave(x.id) === sesion.pedidoId);
        if (row && esEstadoTerminalPedidoDomicilio(row.estado)) {
          limpiarSesionPedidoDomicilio(puntoVenta);
          sincronizarPedidoEnUrl(null);
          setPedidoCreadoId(null);
          return;
        }
        // Si el listado aún no trae el pedido, igual restauramos desde localStorage.
        aplicarDesdeSesion(row?.estado ?? null, row);
      } catch {
        if (!cancelled) aplicarDesdeSesion(null);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Solo al montar / cambiar punto
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puntoVenta]);

  /** Persistí carrito en borrador para que no se pierda al salir de la app. */
  useEffect(() => {
    if (pedidoCreadoId) return;
    const t = window.setTimeout(() => {
      guardarBorradorCarritoPedidos(puntoVenta, {
        cantidades,
        tipoEntrega,
        metodoPago,
        direccion,
        referencia,
      });
    }, 400);
    return () => window.clearTimeout(t);
  }, [cantidades, tipoEntrega, metodoPago, direccion, referencia, puntoVenta, pedidoCreadoId]);

  /** Si hay pedidoId en URL, hidratar resumen desde sesión o API. */
  useEffect(() => {
    if (!pedidoIdEnUrl) return;
    const sesion = leerSesionPedidoDomicilio(puntoVenta);
    if (sesion?.pedidoId === pedidoIdEnUrl && sesion.resumen && !pedidoResumenChat) {
      setPedidoResumenChat({
        lineasItems: sesion.resumen.lineasItems,
        total: sesion.resumen.total,
        metodoPago: sesion.resumen.metodoPago,
        direccion: sesion.resumen.direccion,
        referencia: sesion.resumen.referencia,
        tipoEntrega: sesion.resumen.tipoEntrega,
        puntoVenta: sesion.resumen.puntoVenta,
      });
      if (sesion.cliente) setEtiquetaClienteChat(sesion.cliente);
    }
  }, [pedidoIdEnUrl, puntoVenta, pedidoResumenChat]);

  useEffect(() => {
    setPushPedidosNavOk(pedidosPushSoportadoEnEsteNavegador());
  }, []);

  const refrescarTarifaDomicilio = useCallback(async () => {
    try {
      const qs = new URLSearchParams({
        puntoVenta,
        _ts: String(Date.now()),
      });
      const url = `/api/pos_domicilios_config?${qs.toString()}`;
      const res = await fetch(url, {
        method: "GET",
        cache: "no-store",
        headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        costoDomicilioCop?: number;
        umbralGratisCop?: number;
        domiciliosHabilitados?: boolean;
        recogerEnTiendaHabilitado?: boolean;
        domicilioConDomiciliarioHabilitado?: boolean;
        domiciliosHoraInicio?: string;
        domiciliosHoraFin?: string;
        domiciliosHorarioSemanal?: HorarioSemanalDomicilios;
        mediosTransferencia?: MediosTransferenciaConfig;
        catalogoDomiciliosPorSku?: unknown;
      };
      if (!res.ok || json.ok === false) return;
      const costo =
        typeof json.costoDomicilioCop === "number" && Number.isFinite(json.costoDomicilioCop) && json.costoDomicilioCop >= 0
          ? Math.round(json.costoDomicilioCop)
          : DEFAULT_COSTO_DOMICILIO_COP;
      const umbral =
        typeof json.umbralGratisCop === "number" && Number.isFinite(json.umbralGratisCop) && json.umbralGratisCop > 0
          ? Math.round(json.umbralGratisCop)
          : DEFAULT_UMBRAL_GRATIS_COP;
      const domiciliosHabilitados = typeof json.domiciliosHabilitados === "boolean" ? json.domiciliosHabilitados : true;
      const recogerEnTiendaHabilitado =
        typeof json.recogerEnTiendaHabilitado === "boolean" ? json.recogerEnTiendaHabilitado : true;
      const domicilioConDomiciliarioHabilitado =
        typeof json.domicilioConDomiciliarioHabilitado === "boolean"
          ? json.domicilioConDomiciliarioHabilitado
          : false;
      const domiciliosHoraInicio =
        typeof json.domiciliosHoraInicio === "string" && json.domiciliosHoraInicio.trim() ? json.domiciliosHoraInicio.trim() : "07:00";
      const domiciliosHoraFin =
        typeof json.domiciliosHoraFin === "string" && json.domiciliosHoraFin.trim() ? json.domiciliosHoraFin.trim() : "22:00";
      const domiciliosHorarioSemanal = normalizarHorarioSemanalDomicilios(
        json.domiciliosHorarioSemanal,
        horarioSemanalVacioDefault()
      );
      const catalogoDomiciliosPorSku = normalizarCatalogoDomiciliosPorSku(json.catalogoDomiciliosPorSku);
      const mediosTransferencia = normalizarMediosTransferencia(json.mediosTransferencia);
      setTarifaDomicilio((prev) => {
        if (
          prev.costoDomicilioCop === costo &&
          prev.umbralGratisCop === umbral &&
          prev.domiciliosHabilitados === domiciliosHabilitados &&
          prev.recogerEnTiendaHabilitado === recogerEnTiendaHabilitado &&
          prev.domicilioConDomiciliarioHabilitado === domicilioConDomiciliarioHabilitado &&
          prev.domiciliosHoraInicio === domiciliosHoraInicio &&
          prev.domiciliosHoraFin === domiciliosHoraFin &&
          catalogoDomiciliosPorSkuIgual(prev.catalogoDomiciliosPorSku, catalogoDomiciliosPorSku) &&
          JSON.stringify(prev.domiciliosHorarioSemanal) === JSON.stringify(domiciliosHorarioSemanal) &&
          JSON.stringify(prev.mediosTransferencia) === JSON.stringify(mediosTransferencia)
        ) {
          return prev;
        }
        return {
          costoDomicilioCop: costo,
          umbralGratisCop: umbral,
          domiciliosHabilitados,
          recogerEnTiendaHabilitado,
          domicilioConDomiciliarioHabilitado,
          domiciliosHoraInicio,
          domiciliosHoraFin,
          domiciliosHorarioSemanal,
          mediosTransferencia,
          catalogoDomiciliosPorSku,
        };
      });
    } catch {
      /* se mantienen defaults */
    }
  }, [puntoVenta]);

  useEffect(() => {
    void refrescarTarifaDomicilio();
    const t = window.setInterval(() => {
      void refrescarTarifaDomicilio();
    }, INTERVALO_SYNC_CONFIG_DOMICILIOS_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refrescarTarifaDomicilio();
    };
    const onFocus = () => {
      void refrescarTarifaDomicilio();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, [refrescarTarifaDomicilio]);

  /** Si el cajero deshabilita un SKU, quitarlo del carrito del cliente sin esperar refresh. */
  useEffect(() => {
    if (pedidoCreadoId) return;
    const mapa = tarifaDomicilio.catalogoDomiciliosPorSku;
    setCantidades((prev) => {
      let changed = false;
      const next: Record<string, number> = {};
      for (const [lineKey, cantidad] of Object.entries(prev)) {
        const { sku } = parseKeyLineaPedido(lineKey);
        if (!productoHabilitadoEnDomiciliosPunto(sku, mapa)) {
          changed = true;
          continue;
        }
        next[lineKey] = cantidad;
      }
      if (!changed) return prev;
      Promise.resolve().then(() => {
        setMensaje(
          "Algunos productos ya no están disponibles para domicilio y se quitaron del carrito."
        );
      });
      return next;
    });
  }, [tarifaDomicilio.catalogoDomiciliosPorSku, pedidoCreadoId]);

  const tipoEntregaPreferidoPorConfig = useCallback((): TipoEntregaPedido => {
    if (tarifaDomicilio.recogerEnTiendaHabilitado) return "recogida";
    if (tarifaDomicilio.domicilioConDomiciliarioHabilitado) return "domicilio";
    return "recogida";
  }, [tarifaDomicilio.recogerEnTiendaHabilitado, tarifaDomicilio.domicilioConDomiciliarioHabilitado]);

  // tipoEntrega lo controlan el header (chips) y el Paso 1.

  const mostrarOpcionRecogida = tarifaDomicilio.recogerEnTiendaHabilitado;
  const mostrarOpcionDomicilio = tarifaDomicilio.domicilioConDomiciliarioHabilitado;
  const elegirTipoEntrega = mostrarOpcionRecogida && mostrarOpcionDomicilio;
  const soloRecogidaEnTienda = mostrarOpcionRecogida && !mostrarOpcionDomicilio;
  const soloDomicilio = !mostrarOpcionRecogida && mostrarOpcionDomicilio;

  const subtituloLandingPedidos =
    "Estás a un solo click de probar el mejor chorizo santarrosano de todo Colombia, te ahorramos el viaje hasta Santa Rosa de Cabal.";

  useEffect(() => {
    if (tipoEntrega === "domicilio" && metodoPago === "datafono") {
      setMetodoPago("efectivo");
    }
  }, [tipoEntrega, metodoPago]);

  useEffect(() => {
    if (tipoEntrega === "recogida") setDireccion("");
  }, [tipoEntrega]);

  const cambiarMetodoPagoCliente = useCallback((valor: MetodoPago) => {
    setMetodoPago(valor);
    if (valor === "transferencia") {
      setModalMediosTransferenciaCliente(true);
    }
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      setTickHorarioRecepcion((n) => n + 1);
    }, 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    // Mientras hay pedido en curso no hace falta reconsultar el turno cada 30s.
    if (pedidoEnCurso) return;
    let cancel = false;
    const verificarTurno = async () => {
      try {
        const abierto = await consultarTurnoCajaAbierto(puntoVenta);
        if (!cancel) setTurnoCajaAbierto(abierto);
      } catch {
        if (!cancel) setTurnoCajaAbierto(false);
      }
    };
    setTurnoCajaAbierto(null);
    void verificarTurno();
    const t = window.setInterval(() => void verificarTurno(), 30_000);
    return () => {
      cancel = true;
      window.clearInterval(t);
    };
  }, [puntoVenta, pedidoEnCurso]);

  const recepcionPedidosWebOk = useMemo(() => {
    void tickHorarioRecepcion;
    if (turnoCajaAbierto === false) return false;
    if (!tarifaDomicilio.domiciliosHabilitados) return false;
    return estaEnHorarioDomiciliosConfig(tarifaDomicilio);
  }, [
    tickHorarioRecepcion,
    turnoCajaAbierto,
    tarifaDomicilio.domiciliosHabilitados,
    tarifaDomicilio.domiciliosHorarioSemanal,
    tarifaDomicilio.domiciliosHoraInicio,
    tarifaDomicilio.domiciliosHoraFin,
  ]);

  const avisoBloqueoRecepcion = useMemo(() => {
    void tickHorarioRecepcion;
    if (recepcionPedidosWebOk) return null;
    if (!tarifaDomicilio.domiciliosHabilitados) {
      return "En este momento no estamos recibiendo pedidos por web ni QR. Puede intentar más tarde o comunicarse directo al local.";
    }
    return `Estamos fuera del horario de atención para pedidos en línea. ${textoHorarioDomiciliosCliente(tarifaDomicilio)}`;
  }, [
    tickHorarioRecepcion,
    recepcionPedidosWebOk,
    tarifaDomicilio.domiciliosHabilitados,
    tarifaDomicilio.domiciliosHorarioSemanal,
    tarifaDomicilio.domiciliosHoraInicio,
    tarifaDomicilio.domiciliosHoraFin,
  ]);

  useEffect(() => {
    let cancelled = false;
    setLoadingCatalogo(true);
    setErrorCatalogo(null);
    void getCatalogoPOS(null, puntoVenta)
      .then((res) => {
        if (cancelled) return;
        if (!res.ok || !res.productos?.length) {
          setCatalogo([]);
          setErrorCatalogo(res.message ?? "No se pudo cargar el catálogo.");
          return;
        }
        setCatalogo(res.productos.filter((p) => Number.isFinite(p.precioUnitario) && p.precioUnitario > 0));
      })
      .catch(() => {
        if (!cancelled) setErrorCatalogo("No fue posible cargar los productos.");
      })
      .finally(() => {
        if (!cancelled) setLoadingCatalogo(false);
      });
    return () => {
      cancelled = true;
    };
  }, [puntoVenta]);

  useEffect(() => {
    if (catalogo.length === 0) return;
    setVarianteSeleccionadaPorSku((prev) => {
      const next = { ...prev };
      for (const p of catalogo) {
        if (next[p.sku]) continue;
        const vars = opcionesVariantesProducto(p);
        if (vars.length > 0) next[p.sku] = vars[0].key;
      }
      return next;
    });
  }, [catalogo]);

  const catalogoVisible = useMemo(
    () =>
      unificarAguaBrisaEnCatalogo(
        catalogo.filter((p) =>
          productoVisibleEnCatalogoDomicilios(p, tarifaDomicilio.catalogoDomiciliosPorSku)
        )
      ),
    [catalogo, tarifaDomicilio.catalogoDomiciliosPorSku]
  );

  const productosPorTab = useMemo(() => {
    const counts = Object.fromEntries(TABS_CATALOGO_PEDIDOS.map((t) => [t.id, 0])) as Record<
      TabCatalogoPedidos,
      number
    >;
    for (const p of catalogoVisible) {
      counts[tabCatalogoDeProducto(p)] += 1;
    }
    return {
      counts,
      lista: filtrarCatalogoPorTab(catalogoVisible, tabCatalogo),
    };
  }, [catalogoVisible, tabCatalogo]);

  useEffect(() => {
    if ((productosPorTab.counts[tabCatalogo] ?? 0) > 0) return;
    const first = TABS_CATALOGO_PEDIDOS.find((t) => (productosPorTab.counts[t.id] ?? 0) > 0);
    if (first) setTabCatalogo(first.id);
  }, [productosPorTab.counts, tabCatalogo]);

  const itemsCarrito = useMemo<CarritoLinea[]>(() => {
    const porSku = new Map(catalogo.map((p) => [p.sku, p]));
    const out: CarritoLinea[] = [];
    for (const [lineKey, cantidad] of Object.entries(cantidades)) {
      if (!Number.isFinite(cantidad) || cantidad <= 0) continue;
      const { sku, varianteKey, salsaKey } = parseKeyLineaPedido(lineKey);
      const p = porSku.get(sku);
      if (!p) continue;
      const variantes = opcionesVariantesProducto(p);
      const variante = varianteKey ? variantes.find((v) => v.key === varianteKey) : null;
      const precioUnitarioLinea = variante?.precio ?? p.precioUnitario;
      const salsaLabel = salsaKey ? etiquetaTokenSalsaPedido(salsaKey) : null;
      out.push({
        lineKey,
        p,
        cantidad,
        varianteKey: variante?.key ?? null,
        varianteLabel: variante?.label ?? null,
        salsaKey,
        salsaLabel,
        precioUnitarioLinea,
      });
    }
    return out;
  }, [catalogo, cantidades]);

  const subtotal = useMemo(
    () => itemsCarrito.reduce((acc, x) => acc + x.cantidad * x.precioUnitarioLinea, 0),
    [itemsCarrito]
  );
  const faltanteDomicilioGratis = useMemo(
    () => Math.max(0, tarifaDomicilio.umbralGratisCop - subtotal),
    [subtotal, tarifaDomicilio.umbralGratisCop]
  );
  const progresoDomicilioGratis = useMemo(
    () => porcentajeProgresoDomicilioGratis(subtotal, tarifaDomicilio.umbralGratisCop),
    [subtotal, tarifaDomicilio.umbralGratisCop]
  );
  const costoDomicilio = useMemo(() => {
    if (tipoEntrega === "recogida") return 0;
    if (subtotal <= 0) return 0;
    if (subtotal >= tarifaDomicilio.umbralGratisCop) return 0;
    return tarifaDomicilio.costoDomicilioCop;
  }, [subtotal, tipoEntrega, tarifaDomicilio.umbralGratisCop, tarifaDomicilio.costoDomicilioCop]);
  const total = subtotal + costoDomicilio;

  const totalItems = useMemo(() => itemsCarrito.reduce((acc, x) => acc + x.cantidad, 0), [itemsCarrito]);
  const minutosTranscurridosPedido = useMemo(() => {
    if (!pedidoCreadoEnIso) return 0;
    const t = new Date(pedidoCreadoEnIso).getTime();
    if (Number.isNaN(t)) return 0;
    return Math.max(0, Math.round((ahoraMs - t) / 60000));
  }, [pedidoCreadoEnIso, ahoraMs]);

  const etaPedido = useMemo(
    () => rangoEtaEstado(estadoPedido, minutosTranscurridosPedido),
    [estadoPedido, minutosTranscurridosPedido]
  );

  const combosSugeridos = useMemo(() => {
    const carritoSkus = new Set(itemsCarrito.map((x) => x.p.sku));
    const packs = catalogoVisible.filter(
      (p) => (productoEsComboCatalogo(p) || productoEsPaqueteCatalogo(p)) && !carritoSkus.has(p.sku)
    );
    const bebidas = catalogoVisible.filter((p) => productoEsBebidas(p) && !carritoSkus.has(p.sku));
    const pack = packs[0] ?? null;
    const bebida = bebidas[0] ?? null;
    const out: Array<{
      id: string;
      titulo: string;
      descripcion: string;
      skus: string[];
      ahorro: number;
    }> = [];
    if (pack && bebida) {
      out.push({
        id: "combo-pack-bebida",
        titulo: "Combo recomendado",
        descripcion: `${pack.descripcion} + ${bebida.descripcion}`,
        skus: [pack.sku, bebida.sku],
        ahorro: 2000,
      });
    }
    return out;
  }, [catalogoVisible, itemsCarrito]);

  const subirCantidad = (
    sku: string,
    varianteKey: string | null = null,
    salsaKey: TokenSalsaPedido | null = null
  ) => {
    const p = catalogo.find((x) => x.sku === sku);
    if (p && productoRequiereSalsaFavorita(p) && !salsaKey) {
      setMensaje(
        "Indique si desea salsa (ajo, chimichurri o ambas) o sin salsas antes de agregar el producto."
      );
      return;
    }
    const lineKey = keyLineaPedido(sku, varianteKey, salsaKey);
    setMensaje(null);
    setCantidades((prev) => ({ ...prev, [lineKey]: (prev[lineKey] ?? 0) + 1 }));
  };

  const bajarCantidad = (
    sku: string,
    varianteKey: string | null = null,
    salsaKey: TokenSalsaPedido | null = null
  ) => {
    const lineKey = keyLineaPedido(sku, varianteKey, salsaKey);
    setCantidades((prev) => {
      const actual = prev[lineKey] ?? 0;
      if (actual <= 1) {
        const { [lineKey]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [lineKey]: actual - 1 };
    });
  };

  const eliminarLineaCarrito = (lineKey: string) => {
    setCantidades((prev) => {
      const { [lineKey]: _, ...rest } = prev;
      return rest;
    });
  };

  const agregarComboSugerido = (skus: string[]) => {
    if (!Array.isArray(skus) || skus.length === 0) return;
    setCantidades((prev) => {
      const next = { ...prev };
      for (const sku of skus) {
        const p = catalogo.find((x) => x.sku === sku);
        if (!p) continue;
        const vars = opcionesVariantesProducto(p);
        const varKey = varianteSeleccionadaPorSku[p.sku] ?? (vars[0]?.key ?? null);
        const salsaKey = productoRequiereSalsaFavorita(p)
          ? salsaSeleccionadaPorSku[p.sku] ?? null
          : null;
        if (productoRequiereSalsaFavorita(p) && !salsaKey) continue;
        const lk = keyLineaPedido(p.sku, varKey, salsaKey);
        next[lk] = (next[lk] ?? 0) + 1;
      }
      return next;
    });
  };

  const slidesCarrusel = useMemo(() => {
    const slides: { id: string; titulo: string; texto: string; cta?: string; accion?: "combo" | "club" }[] = [];
    if (tipoEntrega === "domicilio") {
      slides.push({
        id: "domi-gratis",
        titulo: faltanteDomicilioGratis > 0 ? "Domicilio gratis cerquita" : "¡Domicilio gratis!",
        texto:
          faltanteDomicilioGratis > 0
            ? `Le faltan ${formatoMoneda(faltanteDomicilioGratis)} pa' que el envío le salga sin costo.`
            : "Ya alcanzó el monto pa' domicilio gratis en este pedido.",
      });
    } else {
      slides.push({
        id: "recogida",
        titulo: "Recogida en tienda",
        texto: "Sin costo de envío. Pase por el punto cuando esté listo.",
      });
    }
    if (combosSugeridos[0]) {
      slides.push({
        id: "combo",
        titulo: combosSugeridos[0].titulo,
        texto: combosSugeridos[0].descripcion,
        cta: "Agregar combo",
        accion: "combo",
      });
    }
    slides.push({
      id: "club",
      titulo: "Acumule millas en cada pedido",
      texto: "Sume millas con su factura y canjee beneficios en el Club de millas.",
      cta: "Ver mi plan",
      accion: "club",
    });
    return slides;
  }, [tipoEntrega, faltanteDomicilioGratis, combosSugeridos]);

  useEffect(() => {
    if (slidesCarrusel.length <= 1) return;
    const id = window.setInterval(() => {
      setCarruselIdx((i) => (i + 1) % slidesCarrusel.length);
    }, 4500);
    return () => window.clearInterval(id);
  }, [slidesCarrusel.length]);

  useEffect(() => {
    setCarruselIdx((i) => (slidesCarrusel.length ? i % slidesCarrusel.length : 0));
  }, [slidesCarrusel.length]);

  const validarPedidoAntesDeEnviar = (): boolean => {
    if (!tipoEntregaElegido) {
      setMensaje("Elija si desea recoger en tienda o domicilio para continuar.");
      return false;
    }
    if (!recepcionPedidosWebOk) {
      setMensaje(avisoBloqueoRecepcion ?? "En este momento no podemos recibir su pedido.");
      return false;
    }
    if (!itemsCarrito.length) {
      setMensaje("Agregue al menos un producto al carrito.");
      return false;
    }
    if (!cliente.trim() || !telefono.trim()) {
      setMensaje("Complete nombre y teléfono para continuar.");
      return false;
    }
    const telefonoDigitos = telefono.replace(/\D/g, "");
    if (telefonoDigitos.length !== 10) {
      setMensaje("El teléfono debe tener 10 dígitos (ej. celular en Colombia).");
      return false;
    }
    if (tipoEntrega === "recogida" && !tarifaDomicilio.recogerEnTiendaHabilitado) {
      setMensaje("En este momento solo aceptamos envío a domicilio en este punto.");
      return false;
    }
    if (tipoEntrega === "domicilio" && !tarifaDomicilio.domicilioConDomiciliarioHabilitado) {
      setMensaje("En este momento solo aceptamos recogida en tienda en este punto.");
      return false;
    }
    if (tipoEntrega === "domicilio" && !direccion.trim()) {
      setMensaje("Indique la dirección de entrega o elija pasar a recoger en la tienda.");
      return false;
    }
    const mapa = tarifaDomicilio.catalogoDomiciliosPorSku;
    const hayDeshabilitado = itemsCarrito.some(
      (x) => !productoHabilitadoEnDomiciliosPunto(x.p.sku, mapa)
    );
    if (hayDeshabilitado) {
      setMensaje(
        "Algunos productos de su carrito ya no están disponibles para domicilio. Revise el menú e intente de nuevo."
      );
      void refrescarTarifaDomicilio();
      return false;
    }
    const faltaSalsa = itemsCarrito.some(
      (x) => productoRequiereSalsaFavorita(x.p) && !x.salsaKey
    );
    if (faltaSalsa) {
      setMensaje(
        "Hay productos sin opción de salsa. Elija ajo, chimichurri, ambas o sin salsas."
      );
      return false;
    }
    return true;
  };

  const enviarPedido = async () => {
    if (enviando) return;
    if (!validarPedidoAntesDeEnviar()) return;
    // Siempre mostrar invitación Club de Millas al confirmar (cédula o registro en el mismo paso).
    setModalClubMillasConfirmacion(true);
  };

  const continuarTrasInvitacionMillas = async () => {
    if (enviando) return;
    setModalClubMillasConfirmacion(false);
    if (!validarPedidoAntesDeEnviar()) return;
    if (soloRecogidaEnTienda) {
      setModalConfirmarSoloRecogida(true);
      return;
    }
    await ejecutarEnvioPedido();
  };

  const ejecutarEnvioPedido = async () => {
    if (enviando) return;
    if (!validarPedidoAntesDeEnviar()) return;
    setModalConfirmarSoloRecogida(false);
    setModalClubMillasConfirmacion(false);
    setEnviando(true);
    setMensaje(null);
    setPedidoCreadoId(null);
    const telefonoDigitos = telefono.replace(/\D/g, "");
    const direccionFinal =
      tipoEntrega === "recogida"
        ? `Recoger en tienda — ${puntoVenta}`
        : direccion.trim();
    const refUsuario = referencia.trim();
    const partesRef: string[] = [];
    if (tipoEntrega === "recogida") partesRef.push("Entrega: recogida en tienda");
    if (refUsuario) partesRef.push(refUsuario);
    const referenciaFinal = partesRef.length > 0 ? partesRef.join(" · ") : undefined;
    const body = {
      puntoVenta,
      cliente: cliente.trim(),
      telefono: telefonoDigitos,
      direccion: direccionFinal,
      referencia: referenciaFinal,
      total: Math.round(total),
      metodoPago,
      canal,
      items: itemsCarrito.map((x) => {
        const detalle = etiquetaLineaPedido(x.varianteLabel, x.salsaLabel);
        return detalle
          ? `${x.cantidad}x ${descripcionBebidaParaUi(x.p)} (${detalle})`
          : `${x.cantidad}x ${descripcionBebidaParaUi(x.p)}`;
      }),
      tiempoObjetivoMin: 35,
      tipoEntrega,
      ...(clubMillasVinculo?.documento
        ? {
            clienteDocumento: clubMillasVinculo.documento,
            ...(clubMillasVinculo.socioId ? { clienteFrecuenteSocioId: clubMillasVinculo.socioId } : {}),
          }
        : {}),
    };
    try {
      const res = await fetch("/api/pos_domicilios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const raw = await res.text();
      let json = {} as { ok?: boolean; message?: string; pedido?: { id?: string }; error?: string };
      try {
        if (raw) json = JSON.parse(raw) as typeof json;
      } catch {
        /* cuerpo no JSON */
      }
      if (!res.ok || json.ok === false) {
        const detalle =
          (typeof json.message === "string" && json.message.trim()) ||
          (typeof json.error === "string" && json.error.trim()) ||
          (!res.ok ? `Respuesta del servidor (${res.status}).` : "");
        setMensaje(detalle || "No se pudo registrar el pedido.");
        setEnviando(false);
        return;
      }
      const lineasResumen = itemsCarrito.map((x) => {
        const detalle = etiquetaLineaPedido(x.varianteLabel, x.salsaLabel);
        return detalle
          ? `${x.cantidad}× ${descripcionBebidaParaUi(x.p)} (${detalle})`
          : `${x.cantidad}× ${descripcionBebidaParaUi(x.p)}`;
      });
      setPedidoResumenChat({
        lineasItems: lineasResumen,
        total: Math.round(total),
        metodoPago,
        direccion: direccionFinal,
        referencia: referenciaFinal,
        tipoEntrega,
        puntoVenta,
      });
      const nuevoId = json.pedido?.id ? pedidoIdChatClave(json.pedido.id) : null;
      setPedidoCreadoId(nuevoId);
      if (nuevoId) {
        sincronizarPedidoEnUrl(nuevoId);
        guardarSesionPedidoDomicilio({
          pedidoId: nuevoId,
          puntoVenta,
          cliente: cliente.trim(),
          telefono: telefonoDigitos,
          creadoEnIso: new Date().toISOString(),
          resumen: {
            lineasItems: lineasResumen,
            total: Math.round(total),
            metodoPago,
            direccion: direccionFinal,
            referencia: referenciaFinal,
            tipoEntrega,
            puntoVenta,
          },
        });
        if (guardarDatosCliente) {
          guardarClientePreferidoPedidos(puntoVenta, {
            nombre: cliente.trim(),
            telefono: telefonoDigitos,
          });
        }
        limpiarBorradorCarritoPedidos(puntoVenta);
      }
      setPedidoCreadoEnIso(new Date().toISOString());
      setEtiquetaClienteChat(cliente.trim() || "Cliente");
      setChatVista("minimizado");
      ultimoMensajePosIdRef.current = null;
      window.setTimeout(() => {
        rastreadorPedidoRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        setResaltarTarjetaEstadoPedido(true);
        window.setTimeout(() => setResaltarTarjetaEstadoPedido(false), 2400);
      }, 350);
      setChatMensajesNoLeidos(0);
      // Soft-ask profesional: solo si aún no autorizó (default). Si ya granted, el effect re-vincula.
      const perm = permisoNotificacionesPedidos();
      if (pedidosPushSoportadoEnEsteNavegador() && vapidPublicPedidos && perm === "default") {
        setModalPushPedidoAbierto(true);
      }
      setMensaje("Su pedido fue recibido. Muy pronto lo contactamos para confirmar.");
      setCantidades({});
      setCliente("");
      setTelefono("");
      setDireccion("");
      setReferencia("");
      setMetodoPago("efectivo");
      setTipoEntrega(tipoEntregaPreferidoPorConfig());
      setTipoEntregaElegido(false);
      setClubMillasVinculo(null);
      setEnviando(false);
    } catch {
      setMensaje("No se pudo enviar el pedido. Intenta nuevamente.");
      setEnviando(false);
    }
  };

  useEffect(() => {
    if (!pedidoCreadoId) {
      setChatMensajes([]);
      setChatError(null);
      setEstadoPedido(null);
      setRechazoMotivoPedido(null);
      setEtiquetaClienteChat("");
      setPedidoResumenChat(null);
      setChatResumenColapsado(false);
      setChatVista("cerrado");
      estadoPedidoAnteriorRef.current = null;
      ultimoMensajePosIdRef.current = null;
      setChatMensajesNoLeidos(0);
      setModalPushPedidoAbierto(false);
      setAnimacionCambioEstadoPedido(null);
      setResaltarTarjetaEstadoPedido(false);
      setPushPedidosMensaje(null);
      setPushPedidosExito(false);
      setPushPedidosActivando(false);
      return;
    }
    let activo = true;
    const procesarMensajes = (data: MensajeChatDomicilio[]) => {
      const mensajesPos = data.filter((m) => m.autor === "pos");
      const ultimoPos = mensajesPos.length > 0 ? mensajesPos[mensajesPos.length - 1]! : null;
      if (ultimoPos) {
        if (ultimoMensajePosIdRef.current === null) {
          ultimoMensajePosIdRef.current = ultimoPos.id;
        } else if (ultimoPos.id !== ultimoMensajePosIdRef.current) {
          ultimoMensajePosIdRef.current = ultimoPos.id;
          if (chatVista !== "expandido") {
            setChatMensajesNoLeidos((n) => n + 1);
            // Mostrar la pastilla del chat para que el cliente note el mensaje nuevo.
            if (chatVista === "cerrado") {
              setChatVista("minimizado");
            }
          }
          const preview =
            ultimoPos.tipoMensaje === "imagen" || ultimoPos.tipoMensaje === "comprobante"
              ? "Te enviaron una imagen en el chat."
              : ultimoPos.texto.trim().slice(0, 120) || "Tiene un mensaje nuevo del local.";
          setAlertaClienteToast(`Nuevo mensaje del local: ${preview}`);
          window.setTimeout(() => setAlertaClienteToast(null), 5000);
          try {
            if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
              navigator.vibrate([120, 60, 120, 60, 180, 80, 220]);
            }
          } catch {
            /* iOS / sin soporte */
          }
          void (async () => {
            try {
              if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
              const titulo = "María Chorizos — mensaje del local";
              const opts: NotificationOptions = {
                body: preview,
                tag: `chat-pedido-${pedidoCreadoId}`,
                renotify: true,
                icon: "/favicon.ico",
                // Android / SW: patrón de vibración al mostrar la notificación
                vibrate: [120, 60, 120, 60, 180],
              } as NotificationOptions;
              const reg =
                (typeof navigator !== "undefined" &&
                  navigator.serviceWorker &&
                  ((await navigator.serviceWorker.getRegistration("/pedidos-push-sw.js")) ||
                    (await navigator.serviceWorker.getRegistration()))) ||
                null;
              if (reg && typeof reg.showNotification === "function") {
                await reg.showNotification(titulo, opts);
              } else {
                new Notification(titulo, opts);
              }
            } catch {
              /* sin permiso activo o API no disponible */
            }
          })();
        }
      }
      setChatMensajes(data);
      setChatError(null);
    };
    const cargar = async (silencioso = false) => {
      if (!silencioso) setChatCargando(true);
      const res = await listarMensajesChatDomicilio(puntoVenta, pedidoCreadoId);
      if (!activo) return;
      if (!res.ok) {
        if (!silencioso) setChatError(res.message ?? "No fue posible cargar el chat.");
      } else {
        procesarMensajes(res.data);
      }
      if (!silencioso) setChatCargando(false);
    };
    void cargar(false);
    const timer = window.setInterval(() => {
      void cargar(true);
    }, 2000);
    return () => {
      activo = false;
      window.clearInterval(timer);
    };
  }, [pedidoCreadoId, puntoVenta, chatVista]);

  useEffect(() => {
    setPushPedidosExito(false);
    setPushPedidosMensaje(null);
  }, [pedidoCreadoId]);

  useEffect(() => {
    if (!pedidoCreadoId) return;
    const timer = window.setInterval(() => {
      setAhoraMs(Date.now());
    }, 30000);
    return () => {
      window.clearInterval(timer);
    };
  }, [pedidoCreadoId]);

  const cancelarPedidoCliente = useCallback(async () => {
    if (!pedidoCreadoId || cancelandoPedido) return;
    setCancelandoPedido(true);
    setMensajeCancelacionPedido(null);
    const motivo = motivoCancelacionPedido.trim() || undefined;
    const res = await domicilioCancelarCliente({
      puntoVenta,
      pedidoId: pedidoCreadoId,
      motivo,
    });
    setCancelandoPedido(false);
    if (!res.ok || !res.pedido) {
      setMensajeCancelacionPedido(res.message ?? "No fue posible cancelar el pedido.");
      return;
    }
    setEstadoPedido("CANCELADO");
    setRechazoMotivoPedido(res.pedido.rechazoMotivo ?? motivo ?? "Cancelado por el cliente");
    setModalCancelarPedidoAbierto(false);
    setMotivoCancelacionPedido("");
    setMensajeCancelacionPedido(null);
    setChatVista("expandido");
    const refresh = await listarMensajesChatDomicilio(puntoVenta, pedidoCreadoId);
    if (refresh.ok) setChatMensajes(refresh.data);
  }, [pedidoCreadoId, cancelandoPedido, motivoCancelacionPedido, puntoVenta]);

  const refrescarEstadoPedidoConSpinner = useCallback(async () => {
    const pid = pedidoCreadoId;
    if (!pid) return;
    setEstadoPedidoLoading(true);
    try {
      const url = `/api/pos_domicilios?${new URLSearchParams({ puntoVenta }).toString()}`;
      const res = await fetch(url, { method: "GET", cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        data?: Array<{ id?: string; estado?: EstadoPedidoDomicilio; creadoEnIso?: string; rechazoMotivo?: string }>;
      };
      const row = (json.data ?? []).find(
        (x) => pedidoIdChatClave(x.id ?? "") === pedidoIdChatClave(pid)
      );
      if (!row) {
        // Ya no está en bandeja (rechazado/eliminado): marcar finalizado para desbloquear.
        setEstadoPedido((prev) => (prev && esEstadoTerminalPedidoDomicilio(prev) ? prev : "RECHAZADO"));
        setRechazoMotivoPedido(
          (prev) => prev?.trim() || "El punto rechazó o cerró este pedido. Puede hacer uno nuevo."
        );
        limpiarSesionPedidoDomicilio(puntoVenta);
        return;
      }
      const estado = row.estado ?? null;
      if (estado) setEstadoPedido(estado);
      if (row.creadoEnIso) setPedidoCreadoEnIso(row.creadoEnIso);
      setRechazoMotivoPedido(typeof row.rechazoMotivo === "string" && row.rechazoMotivo.trim() ? row.rechazoMotivo.trim() : null);
      if (estado && esEstadoTerminalPedidoDomicilio(estado)) {
        limpiarSesionPedidoDomicilio(puntoVenta);
      }
    } finally {
      setEstadoPedidoLoading(false);
    }
  }, [pedidoCreadoId, puntoVenta]);

  useEffect(() => {
    if (!pedidoCreadoId) return;
    let activo = true;
    const cargarEstado = async (silencioso = false) => {
      if (!silencioso) setEstadoPedidoLoading(true);
      try {
        const url = `/api/pos_domicilios?${new URLSearchParams({ puntoVenta }).toString()}`;
        const res = await fetch(url, { method: "GET" });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          data?: PedidoDomicilio[];
        };
        if (!activo) return;
        const row = (json.data ?? []).find((x) => pedidoIdChatClave(x.id) === pedidoIdChatClave(pedidoCreadoId));
        if (!row) {
          // Pedido desapareció de la bandeja (p. ej. rechazado y limpiado): desbloquear cliente.
          setEstadoPedido((prev) => (prev && esEstadoTerminalPedidoDomicilio(prev) ? prev : "RECHAZADO"));
          setRechazoMotivoPedido(
            (prev) => prev?.trim() || "El punto rechazó o cerró este pedido. Puede hacer uno nuevo."
          );
          limpiarSesionPedidoDomicilio(puntoVenta);
          return;
        }
        const estado = row.estado ?? null;
        if (estado) setEstadoPedido(estado);
        if (row.creadoEnIso) setPedidoCreadoEnIso(row.creadoEnIso);
        setRechazoMotivoPedido(typeof row.rechazoMotivo === "string" && row.rechazoMotivo.trim() ? row.rechazoMotivo.trim() : null);
        if (!esEstadoTerminalPedidoDomicilio(row.estado)) {
          const resumen = resumenDesdePedidoApi(row);
          setPedidoResumenChat((prev) => prev ?? {
            lineasItems: resumen.lineasItems,
            total: resumen.total,
            metodoPago: resumen.metodoPago,
            direccion: resumen.direccion,
            referencia: resumen.referencia,
            tipoEntrega: resumen.tipoEntrega,
            puntoVenta: resumen.puntoVenta,
          });
          if (row.cliente) setEtiquetaClienteChat((prev) => prev || row.cliente);
          guardarSesionPedidoDomicilio({
            pedidoId: pedidoCreadoId,
            puntoVenta,
            cliente: row.cliente,
            telefono: telefonoDomicilioNorm(row.telefono) || row.telefono,
            creadoEnIso: row.creadoEnIso,
            resumen,
          });
        } else {
          limpiarSesionPedidoDomicilio(puntoVenta);
        }
      } finally {
        if (activo && !silencioso) setEstadoPedidoLoading(false);
      }
    };
    void cargarEstado(false);
    const timer = window.setInterval(() => {
      void cargarEstado(true);
    }, 6000);
    return () => {
      activo = false;
      window.clearInterval(timer);
    };
  }, [pedidoCreadoId, puntoVenta]);

  useEffect(() => {
    if (!pedidoCreadoId || !estadoPedido) return;
    const prev = estadoPedidoAnteriorRef.current;
    if (prev === estadoPedido) return;
    if (prev === null) {
      estadoPedidoAnteriorRef.current = estadoPedido;
      return;
    }
    estadoPedidoAnteriorRef.current = estadoPedido;
    setResaltarTarjetaEstadoPedido(true);
    const tPulse = window.setTimeout(() => setResaltarTarjetaEstadoPedido(false), 1400);
    const copy = textoMotivacionCambioEstado(estadoPedido, rechazoMotivoPedido);
    const sem = semaforoEstadoPedido(estadoPedido);
    setAlertaClienteToast(`${sem.label}: ${estadoEtiqueta(estadoPedido)}`);
    const tToast = window.setTimeout(() => setAlertaClienteToast(null), 4500);
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification(`María Chorizos · ${estadoEtiqueta(estadoPedido)}`, {
          body: copy?.subtitulo ?? sem.hint,
          tag: `pedido-estado-${pedidoCreadoId}`,
        });
      }
    } catch {
      /* ignore */
    }
    let tOverlay: number | undefined;
    if (copy) {
      const reduceMotion =
        typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      setAnimacionCambioEstadoPedido({
        key: Date.now(),
        titulo: copy.titulo,
        subtitulo: copy.subtitulo,
        variante: copy.variante,
        confeti: copy.confeti && !reduceMotion,
      });
      tOverlay = window.setTimeout(() => setAnimacionCambioEstadoPedido(null), reduceMotion ? 2200 : 3600);
    }
    // Reforzar opt-in solo si el permiso sigue en default (nunca reabrir si denied).
    if (
      (estadoPedido === "ACEPTADO" || estadoPedido === "EN_PREPARACION") &&
      !pushPedidosExito &&
      vapidPublicPedidos &&
      pushPedidosNavOk &&
      permisoNotificacionesPedidos() === "default"
    ) {
      const key = `${pedidoCreadoId}:${estadoPedido}`;
      if (!pushPromptEstadosRef.current.has(key)) {
        pushPromptEstadosRef.current.add(key);
        setModalPushPedidoAbierto(true);
      }
    }
    if (esEstadoTerminalPedidoDomicilio(estadoPedido)) {
      limpiarSesionPedidoDomicilio(puntoVenta);
    }
    return () => {
      window.clearTimeout(tPulse);
      window.clearTimeout(tToast);
      if (tOverlay) window.clearTimeout(tOverlay);
    };
  }, [
    estadoPedido,
    pedidoCreadoId,
    rechazoMotivoPedido,
    pushPedidosExito,
    vapidPublicPedidos,
    pushPedidosNavOk,
    puntoVenta,
  ]);

  const scrollChatAlFinal = useCallback((suave = true) => {
    const el = chatScrollRef.current;
    if (!el) return;
    window.requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: suave ? "smooth" : "auto" });
    });
  }, []);

  useEffect(() => {
    if (chatVista !== "expandido") return;
    scrollChatAlFinal(true);
  }, [chatMensajes, chatVista, scrollChatAlFinal]);

  useEffect(() => {
    if (chatMensajes.length > 0) setChatResumenColapsado(true);
  }, [chatMensajes.length]);

  const enviarMensajeCliente = async () => {
    if (!pedidoCreadoId || chatEnviando) return;
    const texto = chatTexto.trim();
    if (!texto) return;
    setChatEnviando(true);
    setChatError(null);
    const resp = await enviarMensajeChatDomicilio({
      puntoVenta,
      pedidoId: pedidoCreadoId,
      autor: "cliente",
      autorLabel: etiquetaClienteChat.trim() || "Cliente",
      texto,
      tipoMensaje: "texto",
    });
    if (!resp.ok) {
      setChatError(resp.message ?? "No se pudo enviar el mensaje.");
      setChatEnviando(false);
      return;
    }
    setChatTexto("");
    if (resp.mensaje) {
      setChatMensajes((prev) => (prev.some((m) => m.id === resp.mensaje!.id) ? prev : [...prev, resp.mensaje!]));
    }
    const refresh = await listarMensajesChatDomicilio(puntoVenta, pedidoCreadoId);
    if (refresh.ok) setChatMensajes(refresh.data);
    setChatEnviando(false);
  };

  const enviarAdjuntoImagenCliente = async (file: File, tipoMensaje: "comprobante" | "imagen") => {
    if (!pedidoCreadoId || chatEnviando) return;
    if (tipoMensaje === "comprobante" && pedidoResumenChat?.metodoPago !== "transferencia") {
      setChatError("El comprobante solo aplica cuando el pedido fue con pago por transferencia.");
      return;
    }
    setChatEnviando(true);
    setChatError(null);
    const comp = await comprimirComprobanteTransferenciaParaChat(file);
    if (!comp) {
      setChatError("No se pudo usar esa imagen. Pruebe con JPG o PNG, o una foto más liviana.");
      setChatEnviando(false);
      return;
    }
    const nota = chatTexto.trim();
    const textoPorDefecto = tipoMensaje === "imagen" ? "Foto adjunta." : "Comprobante de pago (transferencia).";
    const texto = nota || textoPorDefecto;
    const resp = await enviarMensajeChatDomicilio({
      puntoVenta,
      pedidoId: pedidoCreadoId,
      autor: "cliente",
      autorLabel: etiquetaClienteChat.trim() || "Cliente",
      texto,
      tipoMensaje,
      adjuntoDataUrl: comp.dataUrl,
      adjuntoNombre: comp.nombre,
    });
    if (!resp.ok) {
      setChatError(resp.message ?? "No se pudo enviar la imagen.");
      setChatEnviando(false);
      return;
    }
    setChatTexto("");
    if (resp.mensaje) {
      setChatMensajes((prev) => (prev.some((m) => m.id === resp.mensaje!.id) ? prev : [...prev, resp.mensaje!]));
    }
    const refresh = await listarMensajesChatDomicilio(puntoVenta, pedidoCreadoId);
    if (refresh.ok) setChatMensajes(refresh.data);
    setChatEnviando(false);
  };

  const onArchivoComprobanteChat = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (pedidoResumenChat?.metodoPago !== "transferencia") {
      setChatError("El comprobante de transferencia solo está disponible si eligió pago por transferencia.");
      return;
    }
    await enviarAdjuntoImagenCliente(file, "comprobante");
  };

  const onArchivoFotoChatCliente = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await enviarAdjuntoImagenCliente(file, "imagen");
  };

  const activarNotificacionesPedidoCelular = useCallback(async () => {
    if (!pedidoCreadoId || pushPedidosActivando) return;
    setPushPedidosActivando(true);
    setPushPedidosMensaje(null);
    const r = await activarNotificacionesPedidoDomicilio({
      vapidPublicKey: vapidPublicPedidos,
      puntoVenta,
      pedidoId: pedidoCreadoId,
    });
    setPushPedidosActivando(false);
    setPushPedidosMensaje(r.message ?? (r.ok ? "Listo." : "No se pudo activar."));
    setPushPedidosExito(Boolean(r.ok));
    if (r.ok) setModalPushPedidoAbierto(false);
  }, [pedidoCreadoId, pushPedidosActivando, vapidPublicPedidos, puntoVenta]);

  /** Si el permiso ya está concedido, re-vincula la suscripción a este pedido (sin diálogo nativo). */
  useEffect(() => {
    if (!pedidoCreadoId || !vapidPublicPedidos || !pushPedidosNavOk) return;
    if (permisoNotificacionesPedidos() !== "granted") return;
    if (pedidoYaTeniasPushLocal(pedidoCreadoId) && pushPedidosExito) return;
    let cancelado = false;
    void (async () => {
      const r = await activarNotificacionesPedidoDomicilio({
        vapidPublicKey: vapidPublicPedidos,
        puntoVenta,
        pedidoId: pedidoCreadoId,
        soloSiYaConcedido: true,
      });
      if (cancelado) return;
      if (r.ok) {
        setPushPedidosExito(true);
        setPushPedidosMensaje(r.message ?? "Avisos activos para este pedido.");
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [pedidoCreadoId, puntoVenta, vapidPublicPedidos, pushPedidosNavOk, pushPedidosExito]);

  const consultarHistorialPedidos = useCallback(async () => {
    const tel = telefonoDomicilioNorm(historialTelefono);
    if (tel.length < 7) {
      setHistorialError("Ingrese un teléfono válido (mín. 7 dígitos).");
      return;
    }
    setHistorialLoading(true);
    setHistorialError(null);
    try {
      const url = `/api/pos_domicilios_historial?${new URLSearchParams({
        puntoVenta,
        telefono: tel,
      }).toString()}`;
      const res = await fetch(url, { method: "GET", cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        data?: PedidoDomicilio[];
      };
      if (!res.ok || json.ok === false) {
        setHistorialPedidos([]);
        setHistorialError(json.message ?? "No se pudo cargar el historial.");
        return;
      }
      setHistorialPedidos(Array.isArray(json.data) ? json.data : []);
      if (guardarDatosCliente) {
        guardarClientePreferidoPedidos(puntoVenta, {
          nombre: cliente.trim() || leerClientePreferidoPedidos(puntoVenta)?.nombre || "",
          telefono: tel,
        });
      }
    } catch {
      setHistorialError("Error de red al consultar el historial.");
      setHistorialPedidos([]);
    } finally {
      setHistorialLoading(false);
    }
  }, [historialTelefono, puntoVenta, guardarDatosCliente, cliente]);

  const reabrirPedidoDesdeHistorial = useCallback(
    (p: PedidoDomicilio) => {
      const id = pedidoIdChatClave(p.id);
      if (esEstadoTerminalPedidoDomicilio(p.estado)) {
        // Solo consulta: no reabrir como activo
        setPedidoCreadoId(id);
        sincronizarPedidoEnUrl(id);
        setEstadoPedido(p.estado);
        setPedidoCreadoEnIso(p.creadoEnIso);
        setRechazoMotivoPedido(p.rechazoMotivo ?? null);
        setEtiquetaClienteChat(p.cliente);
        setPedidoResumenChat(resumenDesdePedidoApi(p));
        setChatVista("minimizado");
        setModalHistorialAbierto(false);
        window.setTimeout(() => {
          rastreadorPedidoRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 200);
        return;
      }
      guardarSesionPedidoDomicilio({
        pedidoId: id,
        puntoVenta: p.puntoVenta || puntoVenta,
        cliente: p.cliente,
        telefono: telefonoDomicilioNorm(p.telefono) || p.telefono,
        creadoEnIso: p.creadoEnIso,
        resumen: resumenDesdePedidoApi(p),
      });
      setPedidoCreadoId(id);
      sincronizarPedidoEnUrl(id);
      setEstadoPedido(p.estado);
      setPedidoCreadoEnIso(p.creadoEnIso);
      setRechazoMotivoPedido(p.rechazoMotivo ?? null);
      setEtiquetaClienteChat(p.cliente);
      setPedidoResumenChat(resumenDesdePedidoApi(p));
      setCliente(p.cliente);
      setTelefono(telefonoDomicilioNorm(p.telefono) || p.telefono);
      setChatVista("minimizado");
      setModalHistorialAbierto(false);
      window.setTimeout(() => {
        rastreadorPedidoRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 200);
    },
    [puntoVenta, sincronizarPedidoEnUrl]
  );

  const toggleChatCliente = () => {
    setChatVista((v) => {
      if (v === "expandido") return "minimizado";
      setChatMensajesNoLeidos(0);
      return "expandido";
    });
  };

  const abrirRastreadorPedido = useCallback(() => {
    setResaltarTarjetaEstadoPedido(true);
    window.setTimeout(() => setResaltarTarjetaEstadoPedido(false), 2200);
    rastreadorPedidoRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  useEffect(() => {
    if (chatVista === "expandido") setChatMensajesNoLeidos(0);
  }, [chatVista]);

  const bloqueActivarPushPedido = pedidoCreadoId ? (
    <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-orange-50 p-3.5 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-red-700">Avisos María Chorizos</p>
      <p className="mt-1 text-sm font-bold text-slate-900">
        Entérese aunque cierre el navegador o cambie de app
      </p>
      <p className="mt-1 text-xs leading-relaxed text-slate-600">
        Le avisamos cuando el local le escriba en el chat o cambie el estado de su pedido (aceptado, en
        preparación, listo, en camino).
      </p>
      {!vapidPublicPedidos ? (
        <p className="mt-2 text-xs text-slate-600">Las notificaciones no están disponibles en este momento.</p>
      ) : !pushPedidosNavOk || esIosSafariSinPwa() ? (
        <div className="mt-2 space-y-1.5 rounded-lg border border-amber-200 bg-white/80 px-3 py-2 text-xs text-amber-950">
          <p className="font-semibold">En iPhone / iPad:</p>
          <ol className="list-decimal space-y-0.5 pl-4 font-medium">
            <li>Toque Compartir en Safari</li>
            <li>Elija «Agregar a pantalla de inicio»</li>
            <li>Abra María Chorizos desde el ícono nuevo</li>
            <li>Vuelva a tocar «Permitir avisos»</li>
          </ol>
          <p className="pt-1 text-[11px] text-slate-600">En Android use Chrome para recibir los avisos.</p>
        </div>
      ) : pushPedidosExito ? (
        <p className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900">
          Avisos activados. Si María Chorizos le escribe o actualiza su pedido, le llegará una notificación.
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          <button
            type="button"
            disabled={pushPedidosActivando}
            onClick={() => void activarNotificacionesPedidoCelular()}
            className="w-full rounded-xl bg-gradient-to-r from-red-700 to-amber-500 px-3 py-3 text-sm font-black text-white shadow-md transition hover:from-red-800 hover:to-amber-600 disabled:opacity-60"
          >
            {pushPedidosActivando ? "Activando avisos…" : "Permitir avisos del pedido"}
          </button>
          {permisoNotificacionesPedidos() === "denied" ? (
            <p className="text-xs font-medium text-rose-700">
              Tiene las notificaciones bloqueadas. Actívelas en la configuración del sitio y vuelva a intentar.
            </p>
          ) : null}
          {pushPedidosMensaje ? (
            <p className={`text-xs font-medium ${pushPedidosExito ? "text-emerald-800" : "text-rose-700"}`}>
              {pushPedidosMensaje}
            </p>
          ) : null}
        </div>
      )}
    </div>
  ) : null;

  const renderContenidoCarrito = (listaMaxH = "max-h-64 sm:max-h-72") => (
    <>
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-gray-900">Tu pedido</h3>
        <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-[11px] font-semibold text-cyan-800">{totalItems} item(s)</span>
      </div>
      <ul className={`mt-3 space-y-3 overflow-auto pr-0.5 text-sm text-gray-700 ${listaMaxH}`}>
        {itemsCarrito.length === 0 ? (
          <li className="text-gray-500">Todavía no ha agregado productos.</li>
        ) : (
          itemsCarrito.map(({ lineKey, p, cantidad, varianteLabel, salsaLabel, salsaKey, precioUnitarioLinea, varianteKey }) => {
            const detalle = etiquetaLineaPedido(varianteLabel, salsaLabel);
            return (
            <li key={lineKey} className="rounded-xl border border-gray-100 bg-gray-50/80 p-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 font-semibold text-gray-900">
                    {descripcionBebidaParaUi(p)}
                    {detalle ? <span className="font-normal text-gray-600"> ({detalle})</span> : null}
                  </p>
                  <p className="mt-0.5 text-[11px] text-gray-500">{formatoMoneda(precioUnitarioLinea)} c/u</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <strong className="text-sm text-cyan-800">{formatoMoneda(cantidad * precioUnitarioLinea)}</strong>
                  <div className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-1 py-0.5">
                    <button
                      type="button"
                      aria-label="Quitar una unidad"
                      onClick={() => bajarCantidad(p.sku, varianteKey, salsaKey)}
                      className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-white text-sm font-bold text-gray-700 transition hover:bg-gray-100 active:scale-95"
                    >
                      -
                    </button>
                    <span className="min-w-[1.5rem] text-center text-sm font-bold">{cantidad}</span>
                    <button
                      type="button"
                      aria-label="Agregar una unidad"
                      onClick={() => subirCantidad(p.sku, varianteKey, salsaKey)}
                      className="flex h-7 w-7 items-center justify-center rounded-md bg-cyan-700 text-sm font-bold text-white transition hover:bg-cyan-800 active:scale-95"
                    >
                      +
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => eliminarLineaCarrito(lineKey)}
                    className="text-[11px] font-semibold text-rose-600 underline-offset-2 hover:text-rose-700 hover:underline"
                  >
                    Quitar del carrito
                  </button>
                </div>
              </div>
            </li>
            );
          })
        )}
      </ul>
      <div className="mt-3 space-y-1 rounded-xl bg-gray-50 p-3 text-xs text-gray-700">
        <div className="flex items-center justify-between">
          <span>Subtotal</span>
          <strong>{formatoMoneda(subtotal)}</strong>
        </div>
        <div className="flex items-center justify-between">
          <span>{tipoEntrega === "recogida" ? "Recogida en tienda" : "Envío a domicilio"}</span>
          <strong>
            {tipoEntrega === "recogida"
              ? "Sin costo"
              : costoDomicilio === 0
                ? "Gratis"
                : formatoMoneda(costoDomicilio)}
          </strong>
        </div>
        <div className="my-1 border-t border-gray-200" />
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-gray-900">Total</span>
          <strong className="text-cyan-700">{formatoMoneda(total)}</strong>
        </div>
      </div>
    </>
  );

  const renderTarjetaProductoCatalogo = (prod: ProductoPOS, idx: number) => {
    const variantes = opcionesVariantesProducto(prod);
    const varianteActivaKey = varianteSeleccionadaPorSku[prod.sku] ?? (variantes[0]?.key ?? null);
    const varianteActiva = varianteActivaKey ? variantes.find((v) => v.key === varianteActivaKey) : null;
    const precioMostrar = varianteActiva?.precio ?? prod.precioUnitario;
    const pideSalsa = productoRequiereSalsaFavorita(prod);
    const salsaActiva = salsaSeleccionadaPorSku[prod.sku] ?? null;
    const lineKey = keyLineaPedido(prod.sku, varianteActivaKey, pideSalsa ? salsaActiva : null);
    const cant = pideSalsa && !salsaActiva ? 0 : cantidades[lineKey] ?? 0;
    const img = primeraImagenProducto(prod);
    const usarImageOptimizada = img ? imagenProductoOptimizable(img) : false;
    return (
      <article
        key={prod.sku}
        className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md sm:rounded-2xl"
      >
        <div className="relative flex h-48 items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 sm:h-56 md:aspect-[4/3] md:h-auto">
          {img && usarImageOptimizada ? (
            <Image
              src={img}
              alt={prod.descripcion}
              fill
              sizes="(max-width: 640px) calc(100vw - 2rem), (max-width: 1280px) calc(50vw - 1.5rem), 360px"
              quality={68}
              priority={idx < 2}
              className="block bg-white object-contain object-center p-2 sm:p-3 md:bg-transparent md:object-cover md:p-0"
            />
          ) : img ? (
            <img
              src={img}
              alt={prod.descripcion}
              className="block max-h-full max-w-full bg-white object-contain object-center p-2 sm:p-3 md:h-full md:w-full md:max-h-none md:max-w-none md:bg-transparent md:object-cover md:p-0"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Image src={LOGO_ORG_URL} alt="Maria Chorizos" width={108} height={40} className="h-9 w-auto opacity-75" />
            </div>
          )}
          <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-white">
            {categoriaProducto(prod)}
          </span>
        </div>
        <div className="space-y-3 p-3 sm:p-3.5">
          <div>
            <p className="line-clamp-2 text-sm font-bold text-gray-900">{descripcionBebidaParaUi(prod)}</p>
            <p className="text-[11px] text-gray-500">{subtituloTarjetaCatalogoPedidos(prod)}</p>
          </div>
          {variantes.length > 0 ? (
            <div className="space-y-1">
              <p className="text-[11px] font-semibold text-gray-600">Escoja la variante</p>
              <div className="flex flex-wrap gap-1">
                {variantes.map((v) => {
                  const activo = v.key === varianteActivaKey;
                  return (
                    <button
                      key={`${prod.sku}-var-${v.key}`}
                      type="button"
                      onClick={() =>
                        setVarianteSeleccionadaPorSku((prev) => ({
                          ...prev,
                          [prod.sku]: v.key,
                        }))
                      }
                      className={`rounded-full border px-2 py-1 text-[11px] font-semibold transition ${
                        activo
                          ? "border-cyan-500 bg-cyan-600 text-white"
                          : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      {v.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
          {pideSalsa ? (
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold text-gray-600">
                Salsa favorita{" "}
                <span className="font-normal text-gray-500">(elija una opción)</span>
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {OPCIONES_SELECCION_SALSA_UI.map((op) => {
                  const activo = salsaActiva === op.token;
                  const esSin = op.token === "sin";
                  const esAmbas = op.token === "ajo+chimichurri";
                  return (
                    <button
                      key={`${prod.sku}-salsa-${op.token}`}
                      type="button"
                      onClick={() =>
                        setSalsaSeleccionadaPorSku((prev) => {
                          if (prev[prod.sku] === op.token) {
                            const { [prod.sku]: _, ...rest } = prev;
                            return rest;
                          }
                          return { ...prev, [prod.sku]: op.token };
                        })
                      }
                      className={`rounded-lg border px-2 py-2 text-left text-[11px] font-semibold leading-tight transition active:scale-[0.98] ${
                        activo
                          ? esSin
                            ? "border-slate-700 bg-slate-700 text-white shadow-sm"
                            : esAmbas
                              ? "border-orange-600 bg-orange-500 text-white shadow-sm"
                              : "border-amber-500 bg-amber-500 text-white shadow-sm"
                          : esSin
                            ? "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                            : esAmbas
                              ? "border-orange-300 bg-orange-50 text-orange-950 hover:bg-orange-100"
                              : "border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100"
                      }`}
                    >
                      {op.label}
                    </button>
                  );
                })}
              </div>
              {!salsaActiva ? (
                <p className="text-[10px] font-medium text-amber-800">
                  Elija ajo, chimichurri, ambas o sin salsas para agregar.
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-3">
            <p className="text-lg font-extrabold text-cyan-700">{formatoMoneda(precioMostrar)}</p>
            <div className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1">
              <button
                type="button"
                onClick={() => bajarCantidad(prod.sku, varianteActivaKey, pideSalsa ? salsaActiva : null)}
                disabled={pideSalsa && !salsaActiva}
                className="h-8 w-8 rounded-md border border-gray-200 bg-white text-base font-bold text-gray-700 transition hover:bg-gray-100 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                -
              </button>
              <span className="w-7 text-center text-base font-semibold">{cant}</span>
              <button
                type="button"
                onClick={() => subirCantidad(prod.sku, varianteActivaKey, pideSalsa ? salsaActiva : null)}
                disabled={pideSalsa && !salsaActiva}
                className="h-8 w-8 rounded-md bg-cyan-700 text-base font-bold text-white transition hover:bg-cyan-800 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                +
              </button>
            </div>
          </div>
        </div>
      </article>
    );
  };

  const renderResumenModoEntregaCheckout = () => (
    <div className="mt-3 rounded-xl border border-cyan-200 bg-cyan-50/60 px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-cyan-700">Modo de entrega</p>
          <p className="mt-0.5 text-sm font-extrabold text-cyan-950">
            {tipoEntrega === "recogida" ? "Recoger en la tienda" : "Envío a domicilio"}
          </p>
          <p className="mt-0.5 text-[11px] text-cyan-900/85">
            {tipoEntrega === "recogida"
              ? `Pasa por: ${puntoVenta}`
              : "Le llevamos el pedido a la dirección que indique abajo."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setTipoEntregaElegido(false)}
          className="shrink-0 rounded-lg border border-cyan-300 bg-white px-2 py-1 text-[10px] font-bold text-cyan-800 hover:bg-cyan-100"
        >
          Cambiar
        </button>
      </div>
    </div>
  );

  const renderRastreadorPedido = () => {
    if (!pedidoCreadoId) return null;
    const sem = semaforoEstadoPedido(estadoPedido);
    const luzClass =
      sem.color === "rojo"
        ? "bg-rose-500 shadow-[0_0_18px_rgba(244,63,94,0.65)]"
        : sem.color === "ambar"
          ? "bg-amber-400 shadow-[0_0_18px_rgba(251,191,36,0.7)]"
          : sem.color === "verde"
            ? "bg-emerald-500 shadow-[0_0_18px_rgba(16,185,129,0.65)]"
            : "bg-slate-400";
    return (
      <section
        ref={rastreadorPedidoRef}
        className={`scroll-mt-4 overflow-hidden rounded-2xl border-2 border-red-200 bg-gradient-to-br from-red-50 via-white to-amber-50 p-4 shadow-md transition-shadow sm:p-5 ${
          resaltarTarjetaEstadoPedido ? "animate-pedidos-estado-tarjeta-pulse ring-2 ring-amber-400/80" : ""
        }`}
        aria-label="Rastreador de pedido"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div
              className="flex flex-col items-center gap-1 rounded-2xl bg-slate-900 px-2.5 py-2"
              title="Semáforo del pedido"
              aria-label={`Semáforo: ${sem.label}`}
            >
              <span className={`h-3.5 w-3.5 rounded-full ${sem.color === "rojo" ? luzClass : "bg-rose-900/40"}`} />
              <span className={`h-3.5 w-3.5 rounded-full ${sem.color === "ambar" ? luzClass : "bg-amber-900/40"}`} />
              <span className={`h-3.5 w-3.5 rounded-full ${sem.color === "verde" ? luzClass : "bg-emerald-900/40"}`} />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-red-700">Estado en tiempo real</p>
              <h2 className="mt-1 text-xl font-black text-slate-900 sm:text-2xl">{sem.label}</h2>
              <p className="mt-1 text-sm font-semibold text-slate-700">
                {pedidoCreadoId} · {pedidoResumenChat?.tipoEntrega === "recogida" ? "Para recoger" : "A domicilio"}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">{sem.hint}</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className="rounded-full bg-red-700 px-3 py-1 text-xs font-bold text-white shadow-sm">
              {estadoPedidoLoading ? "Actualizando..." : estadoEtiqueta(estadoPedido)}
            </span>
            <button
              type="button"
              onClick={() => {
                setAhoraMs(Date.now());
                void refrescarEstadoPedidoConSpinner();
              }}
              disabled={estadoPedidoLoading}
              className="rounded-lg border border-red-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-red-900 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Actualizar
            </button>
          </div>
        </div>
        <p className="mt-3 text-sm font-semibold text-slate-800">ETA estimada: {etaPedido}</p>
        <div className="mt-4 grid grid-cols-6 gap-1.5">
          {Array.from({ length: 6 }).map((_, idx) => {
            const paso = idx + 1;
            const activo = estadoPaso(estadoPedido) >= paso;
            return (
              <span
                key={`rastreador-paso-${paso}`}
                className={`h-2.5 rounded-full transition ${activo ? "bg-red-600" : "bg-red-100"}`}
              />
            );
          })}
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] font-medium text-slate-600">
          <span>Recibido</span>
          <span className="text-center">Preparación</span>
          <span className="text-right">En camino</span>
        </div>
        {estadoPedido === "RECHAZADO" && rechazoMotivoPedido ? (
          <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold leading-snug text-rose-900">
            Motivo: {rechazoMotivoPedido}
          </p>
        ) : null}
        {estadoPedido === "CANCELADO" ? (
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold leading-snug text-amber-950">
            {rechazoMotivoPedido?.trim() || "Canceló este pedido."}
          </p>
        ) : null}
        {pedidoFinalizado ? (
          <div className="mt-4 space-y-2 border-t border-red-100 pt-4">
            <p className="text-sm font-semibold text-slate-800">
              {estadoPedido === "ENTREGADO"
                ? "¿Quiere pedir de nuevo?"
                : "Este pedido ya no está activo. Puede armar uno nuevo cuando quiera."}
            </p>
            <button
              type="button"
              onClick={liberarPedidoParaNuevo}
              className="w-full rounded-xl bg-gradient-to-r from-red-700 to-amber-500 px-3 py-3 text-sm font-black text-white shadow-md transition hover:from-red-800 hover:to-amber-600 active:scale-[0.99]"
            >
              Hacer un nuevo pedido
            </button>
          </div>
        ) : null}
        {puedeCancelarPedido ? (
          <div className="mt-4 border-t border-red-100 pt-4">
            <button
              type="button"
              onClick={() => {
                setMensajeCancelacionPedido(null);
                setModalCancelarPedidoAbierto(true);
              }}
              className="w-full rounded-xl border border-rose-300 bg-white px-3 py-2.5 text-sm font-bold text-rose-800 shadow-sm transition hover:bg-rose-50 active:scale-[0.99]"
            >
              Cancelar mi pedido
            </button>
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-slate-500">Se actualiza solo cada pocos segundos.</p>
          {vapidPublicPedidos && (pushPedidosNavOk || esIosSafariSinPwa()) && !pushPedidosExito ? (
            <button
              type="button"
              onClick={() => setModalPushPedidoAbierto(true)}
              className="rounded-lg bg-amber-400 px-2.5 py-1 text-[11px] font-bold text-red-950"
            >
              Activar avisos
            </button>
          ) : null}
        </div>
      </section>
    );
  };

  if (!tienePedidoVinculado) {
    if (turnoCajaAbierto === null) {
      return (
        <main className="flex min-h-screen items-center justify-center bg-[#0a0e1a] px-6">
          <p className="text-center text-sm text-slate-400 animate-pulse">Verificando disponibilidad del punto…</p>
        </main>
      );
    }
    if (!turnoCajaAbierto) {
      return <PuntoCerradoPremiumView puntoVenta={puntoVenta} />;
    }
  }

  return (
    <main
      className={`min-h-screen w-full overflow-x-hidden bg-slate-50 lg:pb-0 ${pedidoEnCurso ? "pb-40" : "pb-28"}`}
    >
      {alertaClienteToast ? (
        <div
          role="status"
          className="fixed inset-x-3 top-3 z-[120] mx-auto max-w-md rounded-2xl border border-amber-300 bg-slate-950/95 px-4 py-3 text-center text-sm font-bold text-amber-100 shadow-2xl backdrop-blur sm:inset-x-auto"
        >
          {alertaClienteToast}
        </div>
      ) : null}
      <section className="mx-auto max-w-6xl space-y-4 px-3 py-4 sm:px-4 sm:py-5 md:space-y-5 md:px-6 md:py-6">
        <header className="relative overflow-hidden rounded-2xl border-2 border-amber-300/80 bg-gradient-to-br from-red-700 via-red-600 to-amber-500 p-4 text-white shadow-xl md:rounded-3xl md:p-6">
          <div className="pointer-events-none absolute -right-8 -top-8 h-44 w-44 rounded-full bg-amber-300/30 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-16 left-10 h-40 w-40 rounded-full bg-yellow-200/25 blur-2xl" />

          <div className="relative flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
            <div className="flex min-w-0 flex-1 items-start gap-2.5 sm:gap-4">
              <div className="flex w-[4.5rem] shrink-0 flex-col items-center gap-1.5 sm:w-auto sm:gap-2 lg:w-auto">
                <div className="rounded-2xl bg-white p-1.5 shadow-lg ring-2 ring-amber-300/70 sm:p-2">
                  <Image
                    src={LOGO_ORG_URL}
                    alt="María Chorizos"
                    width={200}
                    height={200}
                    priority
                    className="h-14 w-14 rounded-xl object-contain sm:h-20 sm:w-20 md:h-24 md:w-24"
                  />
                </div>
                {/* Solo celular/tablet: mascota debajo del logo para acortar el banner */}
                <div className="relative flex w-full flex-col items-center rounded-2xl bg-black/35 p-1 ring-2 ring-amber-300/70 lg:hidden">
                  <img
                    src={MASCOTA_DOMICILIOS_URL}
                    alt="Personaje de domicilios María Chorizos"
                    className="h-[4.75rem] w-auto max-w-full object-contain drop-shadow-[0_6px_12px_rgba(0,0,0,0.35)] sm:h-28"
                    draggable={false}
                  />
                  <span className="-mt-0.5 rounded-full bg-amber-300 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-red-900 shadow-sm sm:text-[10px]">
                    Domicilios
                  </span>
                </div>
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-200 sm:text-[11px] sm:tracking-[0.22em]">
                  María Chorizos
                </p>
                <h1 className="mt-0.5 text-xl font-black leading-tight drop-shadow-sm sm:mt-1 sm:text-3xl md:text-4xl">
                  Pide fácil y Calma tu antojo.
                </h1>
                <p className="mt-1 max-w-xl text-xs leading-snug text-amber-50/95 sm:mt-1.5 sm:text-sm sm:leading-normal">
                  {subtituloLandingPedidos}
                </p>
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5 sm:mt-3 sm:gap-2">
                  <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-white/40 bg-black/20 px-2.5 py-1 text-[11px] font-semibold backdrop-blur-sm sm:px-3 sm:py-1.5 sm:text-xs">
                    <span className="inline-block h-2 w-2 rounded-full bg-lime-300" />
                    <span className="truncate">{puntoVenta}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setHistorialError(null);
                      setHistorialPedidos([]);
                      if (!historialTelefono && telefono) setHistorialTelefono(telefono);
                      setModalHistorialAbierto(true);
                    }}
                    className="rounded-full border border-white/45 bg-white/15 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur transition hover:bg-white/25 sm:px-3 sm:py-1.5 sm:text-xs"
                  >
                    Mis pedidos
                  </button>
                  {tipoEntregaElegido ? (
                    <button
                      type="button"
                      onClick={() => setTipoEntregaElegido(false)}
                      className="pedidos-entrega-chip pedidos-entrega-chip--on inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-300 via-yellow-300 to-amber-200 px-2.5 py-1 text-[11px] font-black text-red-950 shadow-[0_0_18px_rgba(251,191,36,0.45)] ring-2 ring-white/80 transition active:scale-95 sm:gap-2 sm:px-3 sm:py-1.5 sm:text-xs"
                      title="Cambiar tipo de entrega"
                    >
                      <span className="pedidos-entrega-chip-icon flex h-5 w-5 items-center justify-center rounded-full bg-red-700 text-amber-200 sm:h-6 sm:w-6">
                        {tipoEntrega === "domicilio" ? (
                          <Bike className="h-3 w-3 sm:h-3.5 sm:w-3.5" strokeWidth={2.4} aria-hidden />
                        ) : (
                          <Store className="h-3 w-3 sm:h-3.5 sm:w-3.5" strokeWidth={2.4} aria-hidden />
                        )}
                      </span>
                      <span>{tipoEntrega === "domicilio" ? "Domicilio" : "Recoger en tienda"}</span>
                      <span className="rounded-full bg-red-800/15 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-red-900">
                        Cambiar
                      </span>
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Desktop/large: mascota a la derecha del banner */}
            <div className="hidden shrink-0 justify-end lg:flex">
              <div className="relative flex flex-col items-center rounded-3xl bg-black/35 p-3 ring-2 ring-amber-300/80">
                <img
                  src={MASCOTA_DOMICILIOS_URL}
                  alt="Personaje de domicilios María Chorizos"
                  className="h-52 w-auto max-w-[13rem] object-contain drop-shadow-[0_8px_16px_rgba(0,0,0,0.35)]"
                  draggable={false}
                />
                <span className="-mt-1 rounded-full bg-amber-300 px-3 py-0.5 text-[10px] font-black uppercase tracking-wider text-red-900 shadow-sm">
                  Domicilios
                </span>
              </div>
            </div>
          </div>

          {/* Carrusel de promos en el banner (incluye Club de millas) */}
          {(() => {
            const slide = slidesCarrusel[carruselIdx % Math.max(slidesCarrusel.length, 1)];
            if (!slide) return null;
            return (
              <div className="relative mt-3 overflow-hidden rounded-2xl border border-amber-200/45 bg-black/30 shadow-md backdrop-blur-sm sm:mt-4">
                <div className="flex items-stretch gap-2.5 px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
                  <div className="flex min-w-0 flex-1 flex-col justify-center">
                    <p className="text-[9px] font-black uppercase tracking-[0.18em] text-amber-200 sm:text-[10px] sm:tracking-[0.2em]">
                      {slide.id === "club" ? "Club de millas" : "Promo"}
                    </p>
                    <p className="mt-0.5 text-sm font-black leading-snug text-white sm:text-base">{slide.titulo}</p>
                    <p className="mt-0.5 text-[11px] leading-snug text-amber-50/95 sm:text-xs">{slide.texto}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {slide.cta ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (slide.accion === "combo" && combosSugeridos[0]) {
                              agregarComboSugerido(combosSugeridos[0].skus);
                            } else if (slide.accion === "club") {
                              abrirClubMillasEnVentanaEmergente();
                            }
                          }}
                          className="rounded-lg bg-gradient-to-r from-amber-300 to-yellow-300 px-3 py-1.5 text-[11px] font-black text-red-950 shadow-sm transition hover:from-amber-200 hover:to-yellow-200 sm:rounded-xl sm:px-3.5 sm:py-2 sm:text-xs"
                        >
                          {slide.cta}
                        </button>
                      ) : null}
                      <div className="flex items-center gap-1">
                        {slidesCarrusel.map((s, i) => (
                          <button
                            key={s.id}
                            type="button"
                            aria-label={`Ir a promo ${i + 1}`}
                            aria-current={i === carruselIdx % slidesCarrusel.length ? "true" : undefined}
                            onClick={() => setCarruselIdx(i)}
                            className={`h-1.5 rounded-full transition ${
                              i === carruselIdx % slidesCarrusel.length
                                ? "w-5 bg-amber-300"
                                : "w-1.5 bg-white/40 hover:bg-white/60"
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-center justify-center">
                    {slide.id === "club" ? (
                      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-300 to-yellow-400 text-xl font-black text-red-900 shadow-inner sm:h-14 sm:w-14 sm:text-2xl">
                        ★
                      </span>
                    ) : (
                      <img
                        src={MASCOTA_DOMICILIOS_URL}
                        alt=""
                        aria-hidden
                        className="h-12 w-auto max-w-[3rem] object-contain drop-shadow-md sm:h-14 sm:max-w-[3.5rem]"
                        draggable={false}
                      />
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
        </header>

        {renderRastreadorPedido()}

        <section className={`grid gap-3 sm:grid-cols-2 ${elegirTipoEntrega ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
          <article className="rounded-xl border border-red-100 bg-white p-3 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-red-700/80">Tiempo estimado</p>
            <p className="mt-1 text-lg font-extrabold text-gray-900">35 - 45 min</p>
          </article>
          {elegirTipoEntrega ? (
            <article className="rounded-xl border border-red-100 bg-white p-3 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-red-700/80">Modo de entrega</p>
              <p className="mt-1 text-lg font-extrabold text-gray-900">Recogida o domicilio</p>
            </article>
          ) : null}
          <article className="rounded-xl border border-red-100 bg-white p-3 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-red-700/80">Pago seguro</p>
            <p className="mt-1 text-lg font-extrabold text-gray-900">Efectivo · Transferencia · Datáfono</p>
          </article>
          <article className="rounded-xl border border-amber-300 bg-gradient-to-br from-amber-50 to-yellow-50 p-3 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">Beneficio</p>
            <p className="mt-1 text-base font-extrabold leading-snug text-amber-950 sm:text-lg">
              {tipoEntrega === "recogida"
                ? "Sin costo de envío · por recoger en tienda"
                : subtotal >= tarifaDomicilio.umbralGratisCop
                  ? "Domicilio gratis aplicado · compras superiores a $100.000"
                  : "Envío gratis por compras superiores a $100.000"}
            </p>
          </article>
        </section>

        {tipoEntregaElegido || pedidoEnCurso ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-red-100 bg-white px-4 py-3 shadow-sm">
            <p className="text-sm font-semibold text-gray-800">
              Entrega:{" "}
              <span className="font-black text-red-700">
                {tipoEntrega === "domicilio" ? "Domicilio a su dirección" : `Recoger en ${puntoVenta}`}
              </span>
            </p>
            {!pedidoEnCurso ? (
              <button
                type="button"
                onClick={() => setTipoEntregaElegido(false)}
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-800 hover:bg-red-100"
              >
                Cambiar opción
              </button>
            ) : null}
          </div>
        ) : (
          <div className="rounded-2xl border-2 border-dashed border-amber-400 bg-gradient-to-br from-amber-50 to-orange-50 px-4 py-8 text-center shadow-sm">
            <p className="text-base font-black text-amber-950">¿Cómo desea recibir su pedido?</p>
            <p className="mt-1 text-sm text-amber-900/80">
              {pedidoFinalizado
                ? "Toque «Hacer un nuevo pedido» en el rastreador para volver a pedir."
                : "Elija en la ventana emergente para continuar armando su pedido."}
            </p>
          </div>
        )}

        {tipoEntregaElegido || pedidoEnCurso ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_360px] lg:gap-5">
          <section className="min-w-0 space-y-4">
            <div className="rounded-2xl border border-red-100 bg-white p-3 shadow-sm sm:p-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-red-700">Paso 2</p>
                <h2 className="text-lg font-bold text-gray-900">Catálogo de productos</h2>
                <p className="text-sm text-gray-500">
                  Escoja por categoría. Solo se muestran productos que el punto habilitó para domicilios.
                </p>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {TABS_CATALOGO_PEDIDOS.map((tab) => {
                  const n = productosPorTab.counts[tab.id] ?? 0;
                  const activo = tabCatalogo === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setTabCatalogo(tab.id)}
                      className={`rounded-full px-3 py-1.5 text-xs font-bold transition sm:text-sm ${
                        activo
                          ? "bg-red-700 text-white shadow-md"
                          : "border border-red-200 bg-white text-red-900 hover:bg-red-50"
                      }`}
                    >
                      {tab.label}
                      <span className={`ml-1.5 ${activo ? "text-amber-200" : "text-slate-400"}`}>{n}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            {loadingCatalogo ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, idx) => (
                  <article key={`skeleton-${idx}`} className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                    <div className="h-28 animate-pulse bg-slate-200 sm:h-32" />
                    <div className="space-y-3 p-3">
                      <div className="space-y-2">
                        <div className="h-3 w-3/4 animate-pulse rounded bg-slate-200" />
                        <div className="h-3 w-1/2 animate-pulse rounded bg-slate-200" />
                      </div>
                      <div className="flex items-end justify-between">
                        <div className="h-4 w-20 animate-pulse rounded bg-slate-200" />
                        <div className="h-8 w-24 animate-pulse rounded bg-slate-200" />
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : errorCatalogo ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-8 text-sm text-rose-700 shadow-sm">
                {errorCatalogo}
              </div>
            ) : (
              <div className="space-y-3">
                <h3 className="px-1 text-sm font-bold text-gray-900">
                  {TABS_CATALOGO_PEDIDOS.find((t) => t.id === tabCatalogo)?.label ?? "Productos"}
                </h3>
                {productosPorTab.lista.length > 0 ? (
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {productosPorTab.lista.map((prod, idx) => renderTarjetaProductoCatalogo(prod, idx))}
                  </div>
                ) : (
                  <article className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
                    No hay productos en esta categoría.
                    {tabCatalogo === "basicos"
                      ? " Si espera ver básicos, revise en caja que estén marcados como disponibles para domicilio."
                      : ""}
                  </article>
                )}
              </div>
            )}
          </section>

          <aside ref={checkoutRef} className="min-w-0 space-y-3 lg:sticky lg:top-4 lg:h-fit lg:space-y-4">
            <section className="scroll-mt-20 hidden overflow-hidden rounded-2xl border border-gray-200 bg-white p-3.5 shadow-sm sm:p-4 lg:block">
              {renderContenidoCarrito()}
            </section>

            <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white p-3.5 shadow-sm sm:p-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Paso 3</p>
              <h3 className="text-base font-bold text-gray-900">Sus datos y confirmación</h3>
              <p className="mt-1 text-xs text-gray-500">
                {tipoEntrega === "domicilio"
                  ? "Complete sus datos, acumule millas con su cédula (opcional) y la dirección de entrega."
                  : "Complete sus datos y, si desea, digite su cédula para acumular millas. Pasa a recoger en el punto."}
              </p>
              {avisoBloqueoRecepcion ? (
                <div
                  role="alert"
                  className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs font-medium text-amber-950"
                >
                  {avisoBloqueoRecepcion}
                </div>
              ) : null}
              {renderResumenModoEntregaCheckout()}
              {soloRecogidaEnTienda ? (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-2.5 text-xs font-semibold leading-relaxed text-amber-950">
                  Recuerde: este pedido es <strong>solo para recoger en tienda</strong>. No enviamos domicilio a su
                  dirección en este momento.
                </div>
              ) : null}
              <div className="mt-3 min-w-0 space-y-2">
                <input
                  value={cliente}
                  onChange={(e) => setCliente(e.target.value)}
                  placeholder="Nombre completo"
                  className="block w-full max-w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none ring-cyan-200 focus:border-cyan-500 focus:ring-2"
                />
                <input
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  placeholder="10 dígitos, ej. 3112345678"
                  inputMode="numeric"
                  autoComplete="tel"
                  maxLength={10}
                  className="block w-full max-w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none ring-cyan-200 focus:border-cyan-500 focus:ring-2"
                />
                <p className="text-[11px] text-gray-500">Ingrese exactamente 10 dígitos del número de contacto.</p>
                <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-3.5 w-3.5 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500"
                    checked={guardarDatosCliente}
                    onChange={(e) => setGuardarDatosCliente(e.target.checked)}
                  />
                  <span>
                    Guardar mi nombre y teléfono en este dispositivo para próximos pedidos e historial.
                  </span>
                </label>
                <PedidosClubMillasCheckout
                  puntoVenta={puntoVenta}
                  nombreCliente={cliente}
                  telefono={telefono}
                  totalPedido={Math.round(total)}
                  value={clubMillasVinculo}
                  onChange={setClubMillasVinculo}
                />
                {tipoEntrega === "domicilio" ? (
                  <input
                    value={direccion}
                    onChange={(e) => setDireccion(e.target.value)}
                    placeholder="Dirección de entrega"
                    className="block w-full max-w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none ring-cyan-200 focus:border-cyan-500 focus:ring-2"
                  />
                ) : null}
                <input
                  value={referencia}
                  onChange={(e) => setReferencia(e.target.value)}
                  placeholder={tipoEntrega === "domicilio" ? "Referencia de dirección (opcional)" : "Notas para recogida (opcional)"}
                  className="block w-full max-w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none ring-cyan-200 focus:border-cyan-500 focus:ring-2"
                />
                <select
                  value={metodoPago}
                  onChange={(e) => cambiarMetodoPagoCliente(e.target.value as MetodoPago)}
                  className="block w-full max-w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none ring-cyan-200 focus:border-cyan-500 focus:ring-2"
                >
                  <option value="efectivo">Pago en efectivo</option>
                  <option value="transferencia">Transferencia</option>
                  {tipoEntrega === "recogida" ? <option value="datafono">Datáfono</option> : null}
                </select>
                {metodoPago === "transferencia" ? (
                  <button
                    type="button"
                    onClick={() => setModalMediosTransferenciaCliente(true)}
                    className="block w-full max-w-full rounded-lg border border-cyan-300 bg-cyan-50 px-3 py-2 text-left text-xs font-semibold text-cyan-900 hover:bg-cyan-100"
                  >
                    Ver datos para transferir (Nequi, Bancolombia, Daviplata, Llave)
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void enviarPedido()}
                  disabled={enviando || !recepcionPedidosWebOk}
                  className="block w-full max-w-full rounded-lg bg-gradient-to-r from-red-700 to-amber-500 px-3 py-3 text-sm font-black text-white shadow-md transition hover:from-red-800 hover:to-amber-600 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {enviando
                    ? "Enviando pedido..."
                    : clubMillasVinculo
                      ? "Confirmar pedido y acumular millas"
                      : "Confirmar pedido · acumular millas"}
                </button>
                <p className="text-center text-[11px] font-medium text-slate-500">
                  Al confirmar le pediremos su cédula para el Club de Millas (o puede registrarse ahí mismo).
                </p>
              </div>
              {mensaje ? (
                <p className={`mt-3 text-xs ${pedidoCreadoId ? "text-emerald-700" : "text-rose-700"}`}>
                  {mensaje} {pedidoCreadoId ? `(${pedidoCreadoId})` : ""}
                </p>
              ) : null}
            </section>

            {pedidoCreadoId ? <section className="shadow-sm">{bloqueActivarPushPedido}</section> : null}
          </aside>
        </div>
        ) : null}

      </section>
      {pedidoEnCurso ? (
        <button
          type="button"
          onClick={abrirRastreadorPedido}
          className="fixed inset-x-3 bottom-[4.65rem] z-40 flex items-center justify-center gap-2 rounded-xl border-2 border-cyan-400 bg-gradient-to-r from-cyan-600 to-sky-600 px-4 py-3 text-sm font-bold text-white shadow-lg transition hover:from-cyan-700 hover:to-sky-700 active:scale-[0.99] lg:hidden"
        >
          <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
          Estado de mi pedido
          <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-bold">
            {estadoPedidoLoading ? "…" : estadoEtiqueta(estadoPedido)}
          </span>
        </button>
      ) : null}
      <div
        className={`fixed inset-x-3 bottom-3 z-40 flex gap-2 lg:hidden ${
          !pedidoEnCurso && !tipoEntregaElegido ? "pointer-events-none opacity-40" : ""
        }`}
      >
        <button
          type="button"
          onClick={() => setCarritoModalAbierto(true)}
          className="relative flex-1 rounded-xl bg-slate-900 px-3 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-black active:scale-[0.98]"
        >
          Ver carrito ({totalItems})
        </button>
        <button
          type="button"
          onClick={toggleChatCliente}
          className="relative flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-red-700 px-2 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:bg-red-800 active:scale-[0.98] sm:gap-2 sm:px-3 sm:py-3"
        >
          <img
            src={MASCOTA_DOMICILIOS_URL}
            alt=""
            aria-hidden
            className="h-8 w-auto max-w-[2rem] object-contain sm:h-9 sm:max-w-[2.25rem]"
            draggable={false}
          />
          <span className="truncate">
            {chatVista === "expandido" ? "Minimizar" : chatVista === "minimizado" ? "Abrir chat" : "Chat"}
          </span>
          {chatMensajesNoLeidos > 0 && chatVista !== "expandido" ? (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
              {chatMensajesNoLeidos > 9 ? "9+" : chatMensajesNoLeidos}
            </span>
          ) : null}
        </button>
      </div>
      <div className="fixed bottom-5 right-5 z-40 hidden flex-col items-end gap-2 lg:flex">
        {pedidoEnCurso ? (
          <button
            type="button"
            onClick={abrirRastreadorPedido}
            className="inline-flex items-center gap-2 rounded-full border-2 border-cyan-400 bg-gradient-to-r from-cyan-600 to-sky-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg transition hover:from-cyan-700 hover:to-sky-700 active:scale-[0.98]"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
            Estado de mi pedido
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px]">
              {estadoPedidoLoading ? "…" : estadoEtiqueta(estadoPedido)}
            </span>
          </button>
        ) : null}
        <button
          type="button"
          onClick={toggleChatCliente}
          className="inline-flex items-center gap-2 rounded-full bg-red-700 py-1.5 pl-1.5 pr-4 text-sm font-semibold text-white shadow-lg transition hover:bg-red-800 active:scale-[0.98]"
        >
          <img
            src={MASCOTA_DOMICILIOS_URL}
            alt=""
            aria-hidden
            className="h-9 w-auto max-w-[2.35rem] object-contain drop-shadow-sm"
            draggable={false}
          />
          {chatVista === "expandido" ? "Minimizar chat" : chatVista === "minimizado" ? "Abrir chat" : "Chat con el punto"}
          {chatMensajesNoLeidos > 0 && chatVista !== "expandido" ? (
            <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold">
              {chatMensajesNoLeidos > 9 ? "9+" : chatMensajesNoLeidos}
            </span>
          ) : null}
        </button>
      </div>
      {carritoModalAbierto ? (
        <div className="fixed inset-0 z-[95] flex items-center justify-center p-4 lg:hidden">
          <button
            type="button"
            aria-label="Cerrar carrito"
            className="absolute inset-0 bg-slate-950/55 backdrop-blur-[1px]"
            onClick={() => setCarritoModalAbierto(false)}
          />
          <div className="relative z-10 flex w-full max-w-md max-h-[min(88dvh,720px)] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-3">
              <h3 className="text-lg font-bold text-gray-900">Tu carrito</h3>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={() => setCarritoModalAbierto(false)}
                className="rounded-lg border border-gray-200 px-2.5 py-1 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cerrar
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-4">{renderContenidoCarrito("max-h-none")}</div>
            <div className="shrink-0 border-t border-gray-100 p-4">
              <button
                type="button"
                onClick={() => {
                  setCarritoModalAbierto(false);
                  window.setTimeout(() => {
                    document
                      .getElementById("pedidos-club-millas-checkout")
                      ?.scrollIntoView({ behavior: "smooth", block: "center" });
                    checkoutRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }, 80);
                }}
                className="w-full rounded-xl bg-cyan-700 px-4 py-3 text-sm font-bold text-white shadow-md transition hover:bg-cyan-800 active:scale-[0.98]"
              >
                Continuar · datos y Club de Millas
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {modalCancelarPedidoAbierto && pedidoCreadoId ? (
        <div className="fixed inset-0 z-[116] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Cerrar cancelación"
            className="absolute inset-0 bg-slate-950/65 backdrop-blur-[2px]"
            onClick={() => !cancelandoPedido && setModalCancelarPedidoAbierto(false)}
          />
          <div className="relative z-10 w-full max-w-md overflow-hidden rounded-3xl border-2 border-rose-200 bg-white p-5 shadow-2xl sm:p-6">
            <h2 className="text-center text-xl font-black text-rose-950">¿Cancelar su pedido?</h2>
            <p className="mt-2 text-center text-sm leading-relaxed text-slate-600">
              El punto de venta verá la cancelación al instante. Esta acción no se puede deshacer desde aquí.
            </p>
            <label className="mt-4 block">
              <span className="text-xs font-semibold text-slate-700">Motivo (opcional)</span>
              <textarea
                value={motivoCancelacionPedido}
                onChange={(e) => setMotivoCancelacionPedido(e.target.value)}
                rows={2}
                placeholder="Ej.: cambié de opinión, pedí por error..."
                disabled={cancelandoPedido}
                className="mt-1 w-full resize-y rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none ring-rose-200 focus:border-rose-400 focus:ring-2 disabled:opacity-60"
              />
            </label>
            {mensajeCancelacionPedido ? (
              <p className="mt-2 text-center text-xs font-medium text-rose-700">{mensajeCancelacionPedido}</p>
            ) : null}
            <div className="mt-5 space-y-2">
              <button
                type="button"
                onClick={() => void cancelarPedidoCliente()}
                disabled={cancelandoPedido}
                className="w-full rounded-xl bg-rose-700 px-4 py-3 text-sm font-black text-white shadow-lg transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {cancelandoPedido ? "Cancelando..." : "Sí, cancelar pedido"}
              </button>
              <button
                type="button"
                onClick={() => setModalCancelarPedidoAbierto(false)}
                disabled={cancelandoPedido}
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                Seguir con mi pedido
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {!pedidoEnCurso && !pedidoFinalizado && !tipoEntregaElegido && turnoCajaAbierto ? (
        <div className="fixed inset-0 z-[118] flex items-end justify-center p-3 sm:items-center sm:p-4">
          <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-[3px]" aria-hidden />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-tipo-entrega-titulo"
            className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border-2 border-amber-300 bg-gradient-to-br from-red-700 via-red-600 to-amber-500 p-0.5 shadow-2xl sm:max-w-lg sm:rounded-3xl sm:p-1"
          >
            <div className="max-h-[min(88dvh,560px)] overflow-y-auto rounded-[0.9rem] bg-gradient-to-br from-amber-50 via-white to-orange-50 px-3.5 py-3.5 sm:max-h-none sm:rounded-[1.35rem] sm:px-6 sm:py-5">
              <div className="flex items-center justify-center gap-3 sm:flex-col sm:gap-0">
                <img
                  src={MASCOTA_DOMICILIOS_URL}
                  alt=""
                  aria-hidden
                  className="h-12 w-auto shrink-0 object-contain drop-shadow-md sm:h-24 sm:h-auto md:h-28"
                  draggable={false}
                />
                <div className="min-w-0 text-left sm:mt-2 sm:text-center">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-red-700 sm:tracking-[0.22em] sm:text-[11px]">
                    María Chorizos
                  </p>
                  <div className="mt-1 inline-flex max-w-full items-center gap-1.5 rounded-full border border-red-200 bg-white px-2.5 py-1 shadow-sm sm:mt-2 sm:gap-2 sm:border-2 sm:px-3.5 sm:py-1.5">
                    <Store className="h-3.5 w-3.5 shrink-0 text-red-700 sm:h-4 sm:w-4" strokeWidth={2.4} aria-hidden />
                    <span className="truncate text-xs font-black text-red-950 sm:text-sm">{puntoVenta}</span>
                  </div>
                </div>
              </div>

              <h2
                id="modal-tipo-entrega-titulo"
                className="mt-3 text-center text-lg font-black leading-snug text-red-950 sm:mt-3 sm:text-2xl md:text-3xl"
              >
                ¿Cómo quiere recibir su pedido?
              </h2>
              <p className="mt-1 hidden text-center text-sm font-medium text-slate-600 sm:mt-2 sm:block">
                Pedido en <strong className="font-bold text-red-900">{puntoVenta}</strong>. Elija una opción
                para continuar.
              </p>

              <div className="mt-3 grid gap-2 sm:mt-5 sm:grid-cols-2 sm:gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setTipoEntrega("recogida");
                    setTipoEntregaElegido(true);
                  }}
                  className="group relative flex items-center gap-3 overflow-hidden rounded-xl border-2 border-amber-300 bg-gradient-to-br from-amber-100 to-yellow-50 px-3 py-2.5 text-left shadow-md transition hover:border-amber-500 hover:shadow-lg active:scale-[0.98] sm:flex-col sm:items-center sm:gap-3 sm:rounded-2xl sm:p-4 sm:text-center"
                >
                  <span className="pedidos-entrega-chip-icon flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-yellow-300 text-red-900 shadow-md sm:h-14 sm:w-14 sm:rounded-2xl sm:shadow-lg">
                    <Store className="h-5 w-5 sm:h-7 sm:w-7" strokeWidth={2.2} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[10px] font-black uppercase tracking-[0.14em] text-amber-800 sm:text-[11px] sm:tracking-[0.16em]">
                      Opción 1
                    </span>
                    <span className="mt-0.5 block text-sm font-black text-red-950 sm:text-base">
                      Recoger en tienda
                    </span>
                    <span className="mt-0.5 block text-[11px] font-medium leading-snug text-slate-600 sm:text-xs">
                      Sin costo de envío. Pase por este punto.
                    </span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setTipoEntrega("domicilio");
                    setMetodoPago((m) => (m === "datafono" ? "efectivo" : m));
                    setTipoEntregaElegido(true);
                  }}
                  className="group relative flex items-center gap-3 overflow-hidden rounded-xl border-2 border-red-300 bg-gradient-to-br from-red-50 to-amber-50 px-3 py-2.5 text-left shadow-md transition hover:border-red-500 hover:shadow-lg active:scale-[0.98] sm:flex-col sm:items-center sm:gap-3 sm:rounded-2xl sm:p-4 sm:text-center"
                >
                  <span className="pedidos-entrega-chip-icon flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-red-600 to-amber-500 text-white shadow-md sm:h-14 sm:w-14 sm:rounded-2xl sm:shadow-lg">
                    <Bike className="h-5 w-5 sm:h-7 sm:w-7" strokeWidth={2.2} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[10px] font-black uppercase tracking-[0.14em] text-red-700 sm:text-[11px] sm:tracking-[0.16em]">
                      Opción 2
                    </span>
                    <span className="mt-0.5 block text-sm font-black text-red-950 sm:text-base">Domicilio</span>
                    <span className="mt-0.5 block text-[11px] font-medium leading-snug text-slate-600 sm:text-xs">
                      Envío gratis por compras superiores a $100.000.
                    </span>
                  </span>
                </button>
              </div>

              <p className="mt-2.5 text-center text-[10px] font-semibold text-slate-500 sm:mt-4 sm:text-[11px]">
                Debe elegir una opción para continuar.
              </p>
            </div>
          </div>
        </div>
      ) : null}
      {modalClubMillasConfirmacion ? (
        <div className="fixed inset-0 z-[117] flex items-end justify-center p-3 sm:items-center sm:p-4">
          <button
            type="button"
            aria-label="Cerrar Club de Millas"
            className="absolute inset-0 bg-slate-950/70 backdrop-blur-[2px]"
            onClick={() => !enviando && setModalClubMillasConfirmacion(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-club-millas-titulo"
            className="relative z-10 flex max-h-[min(92dvh,720px)] w-full max-w-md flex-col overflow-hidden rounded-2xl border-2 border-amber-400 bg-white shadow-2xl sm:rounded-3xl"
          >
            <div className="shrink-0 border-b border-amber-200 bg-gradient-to-r from-red-700 via-red-600 to-amber-500 px-4 py-3.5 text-white sm:px-5">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-100">
                Paso final · Club de Millas
              </p>
              <h2 id="modal-club-millas-titulo" className="mt-1 text-lg font-black leading-tight sm:text-xl">
                Digite su cédula para acumular millas en esta compra
              </h2>
              <p className="mt-1 text-xs font-medium text-amber-50/95">
                Si no está registrado, puede afiliarse aquí mismo antes de confirmar el pedido.
              </p>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3.5 py-3.5 sm:px-5 sm:py-4">
              <PedidosClubMillasCheckout
                puntoVenta={puntoVenta}
                nombreCliente={cliente}
                telefono={telefono}
                totalPedido={Math.round(total)}
                value={clubMillasVinculo}
                onChange={setClubMillasVinculo}
              />
            </div>
            <div className="shrink-0 space-y-2 border-t border-amber-100 bg-amber-50/60 px-3.5 py-3 sm:px-5 sm:py-4">
              <button
                type="button"
                onClick={() => void continuarTrasInvitacionMillas()}
                disabled={enviando}
                className="w-full rounded-xl bg-gradient-to-r from-red-700 to-amber-500 px-4 py-3 text-sm font-black text-white shadow-md transition hover:from-red-800 hover:to-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {enviando
                  ? "Enviando pedido..."
                  : clubMillasVinculo
                    ? "Confirmar pedido y acumular millas"
                    : "Continuar sin acumular millas"}
              </button>
              <button
                type="button"
                onClick={() => setModalClubMillasConfirmacion(false)}
                disabled={enviando}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Volver a revisar mis datos
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {modalConfirmarSoloRecogida ? (
        <div className="fixed inset-0 z-[115] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Cerrar confirmación"
            className="absolute inset-0 bg-slate-950/65 backdrop-blur-[2px]"
            onClick={() => setModalConfirmarSoloRecogida(false)}
          />
          <div className="relative z-10 w-full max-w-md overflow-hidden rounded-3xl border-2 border-amber-300 bg-gradient-to-br from-amber-50 via-white to-orange-50 p-5 shadow-2xl sm:p-6">
            <p className="text-center text-4xl" aria-hidden>
              🏪
            </p>
            <h2 className="mt-2 text-center text-xl font-black text-amber-950 sm:text-2xl">¡Casi listo!</h2>
            <p className="mt-3 text-center text-sm font-semibold leading-relaxed text-amber-900/95">
              Por ahora en <strong>{puntoVenta}</strong> solo tenemos habilitada la{" "}
              <strong>recogida en tienda</strong>. Su pedido quedará listo pa&apos; que pase por el punto —{" "}
              <strong>no enviaremos domicilio a su dirección</strong> con este pedido.
            </p>
            <p className="mt-2 text-center text-xs font-medium text-amber-800/90">
              Si esto es lo que buscaba, confirme y le avisamos cuando quede en marcha.
            </p>
            <div className="mt-5 space-y-2">
              <button
                type="button"
                onClick={() => void ejecutarEnvioPedido()}
                disabled={enviando}
                className="w-full rounded-xl bg-gradient-to-r from-cyan-700 to-teal-700 px-4 py-3 text-sm font-black text-white shadow-lg transition hover:from-cyan-800 hover:to-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {enviando ? "Enviando pedido..." : "Entendido, confirmar pedido"}
              </button>
              <button
                type="button"
                onClick={() => setModalConfirmarSoloRecogida(false)}
                disabled={enviando}
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                Revisar mi pedido
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {modalPushPedidoAbierto && pedidoCreadoId ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Cerrar aviso de notificaciones"
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-[1px]"
            onClick={() => setModalPushPedidoAbierto(false)}
          />
          <div className="relative z-10 w-full max-w-sm space-y-4 overflow-hidden rounded-2xl border-2 border-amber-300 bg-white p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <img
                src={MASCOTA_DOMICILIOS_URL}
                alt=""
                aria-hidden
                className="h-14 w-auto shrink-0 object-contain"
                draggable={false}
              />
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-red-700">María Chorizos</p>
                <p className="mt-0.5 text-lg font-black leading-tight text-slate-900">
                  ¿Quiere que le avisemos?
                </p>
                <p className="mt-1.5 text-sm font-medium leading-snug text-slate-600">
                  Si cierra esta página o cambia de app, igual le llega cuando el local le escriba o actualice
                  su pedido <strong className="font-bold text-slate-800">{pedidoCreadoId}</strong>.
                </p>
              </div>
            </div>
            {bloqueActivarPushPedido}
            <button
              type="button"
              onClick={() => setModalPushPedidoAbierto(false)}
              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Ahora no
            </button>
          </div>
        </div>
      ) : null}
      {modalHistorialAbierto ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Cerrar historial"
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-[1px]"
            onClick={() => setModalHistorialAbierto(false)}
          />
          <div className="relative z-10 flex max-h-[90dvh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-cyan-200 bg-white shadow-2xl">
            <div className="border-b border-gray-100 px-4 py-3">
              <p className="text-lg font-bold text-gray-900">Mis pedidos</p>
              <p className="mt-1 text-xs text-gray-600">
                Consulte el historial de este punto con su número de celular.
              </p>
            </div>
            <div className="space-y-3 overflow-y-auto px-4 py-3">
              <div className="flex gap-2">
                <input
                  value={historialTelefono}
                  onChange={(e) => setHistorialTelefono(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  placeholder="Teléfono (10 dígitos)"
                  inputMode="numeric"
                  className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-200"
                />
                <button
                  type="button"
                  disabled={historialLoading}
                  onClick={() => void consultarHistorialPedidos()}
                  className="shrink-0 rounded-lg bg-cyan-700 px-3 py-2 text-sm font-bold text-white hover:bg-cyan-800 disabled:opacity-60"
                >
                  {historialLoading ? "…" : "Buscar"}
                </button>
              </div>
              {historialError ? <p className="text-xs font-medium text-rose-700">{historialError}</p> : null}
              {!historialLoading && historialPedidos.length === 0 && !historialError ? (
                <p className="text-xs text-gray-500">Ingrese su teléfono y toque Buscar.</p>
              ) : null}
              <ul className="space-y-2">
                {historialPedidos.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => reabrirPedidoDesdeHistorial(p)}
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-left transition hover:border-cyan-300 hover:bg-cyan-50"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-gray-900">{p.id}</p>
                          <p className="mt-0.5 text-[11px] text-gray-600">
                            {new Date(p.creadoEnIso).toLocaleString("es-CO")} · {estadoEtiqueta(p.estado)}
                          </p>
                          <p className="mt-1 line-clamp-2 text-[11px] text-gray-500">
                            {(p.items ?? []).slice(0, 3).join(" · ")}
                          </p>
                        </div>
                        <strong className="shrink-0 text-sm text-cyan-800">{formatoMoneda(p.total)}</strong>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div className="border-t border-gray-100 px-4 py-3">
              <button
                type="button"
                onClick={() => setModalHistorialAbierto(false)}
                className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {chatVista === "expandido" ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4">
          <button
            type="button"
            aria-label="Minimizar chat"
            className="absolute inset-0 bg-slate-950/55 backdrop-blur-[1px]"
            onClick={() => setChatVista("minimizado")}
          />
          <section className="relative z-10 flex h-[min(92dvh,860px)] max-h-[96dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-cyan-200 bg-white shadow-2xl ring-1 ring-cyan-500/20">
            <header className="flex shrink-0 items-start justify-between gap-2 rounded-t-2xl bg-cyan-700 px-4 py-3 text-white">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">Chat de pedido</p>
                <p className="text-[11px] text-cyan-100">
                  {pedidoCreadoId ? `Pedido ${pedidoCreadoId}` : "Primero confirme su pedido para chatear"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  title="Minimizar chat y seguir viendo el menú"
                  onClick={() => setChatVista("minimizado")}
                  className="rounded-lg border border-white/35 bg-white/10 px-2 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"
                >
                  <span className="sr-only">Minimizar chat</span>
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                <button
                  type="button"
                  title="Cerrar chat"
                  onClick={() => setChatVista("cerrado")}
                  className="rounded-lg border border-white/35 bg-white/10 px-2 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"
                >
                  <span className="sr-only">Cerrar chat</span>
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </header>
            {pedidoResumenChat && pedidoCreadoId ? (
              <div className="shrink-0 border-b border-emerald-200/80 bg-emerald-50/60 px-3 py-2">
                <button
                  type="button"
                  onClick={() => setChatResumenColapsado((v) => !v)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-left text-[11px] font-bold text-emerald-900 shadow-sm transition hover:bg-emerald-50"
                >
                  <span>
                    Resumen del pedido · {formatoMoneda(pedidoResumenChat.total)}
                  </span>
                  <svg
                    className={`h-4 w-4 shrink-0 transition-transform ${chatResumenColapsado ? "" : "rotate-180"}`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    aria-hidden
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {!chatResumenColapsado ? (
                  <div className="mt-2 space-y-2 rounded-xl border border-white/80 bg-white p-2.5 text-[11px] leading-relaxed text-slate-800 shadow-sm">
                    <ul className="space-y-0.5">
                      {pedidoResumenChat.lineasItems.map((linea, i) => (
                        <li key={`resumen-item-${i}`} className="flex gap-1.5">
                          <span className="text-emerald-600" aria-hidden>
                            •
                          </span>
                          <span>{linea}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="border-t border-slate-100 pt-2 font-bold text-slate-900">
                      Pago: {etiquetaMetodoPagoCliente(pedidoResumenChat.metodoPago)} ·{" "}
                      {pedidoResumenChat.tipoEntrega === "recogida" ? "Recogida en tienda" : "Envío a domicilio"}
                    </p>
                    {pedidoResumenChat.metodoPago === "transferencia" ? (
                      <p>
                        Transferencia:{" "}
                        <button
                          type="button"
                          onClick={() => setModalMediosTransferenciaCliente(true)}
                          className="font-bold text-cyan-800 underline underline-offset-2 hover:text-cyan-950"
                        >
                          ver cuentas
                        </button>
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
            <div
              ref={chatScrollRef}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[#e5ddd5] scroll-smooth"
            >
              <div className="space-y-2 px-3 py-2 pb-3">
                {!pedidoCreadoId ? (
                  <p className="text-xs text-slate-600">Cuando confirmes el pedido, este chat quedará activo.</p>
                ) : chatCargando ? (
                  <p className="text-xs text-slate-600">Cargando mensajes...</p>
                ) : (
                  <>
                    {chatMensajes.length === 0 ? (
                      <p className="rounded-lg bg-white/90 px-3 py-2 text-center text-[11px] text-slate-600 shadow-sm">
                        Aún no hay mensajes del punto. Cuando respondan, aparecerán aquí debajo del resumen.
                      </p>
                    ) : (
                      chatMensajes.map((m) => {
                        const esCliente = m.autor === "cliente";
                        return (
                          <PosDomiciliosChatBurbuja
                            key={m.id}
                            mensaje={m}
                            esPropio={esCliente}
                            horaFormateada={formatoHora(m.creadoEnIso)}
                          />
                        );
                      })
                    )}
                  </>
                )}
              </div>
            </div>
            <div className="shrink-0 border-t border-slate-200/90 bg-[#f0f2f5] px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2">
              {pedidoCreadoId ? (
                <>
                  <input
                    ref={chatComprobanteInputRef}
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/webp"
                    className="hidden"
                    onChange={(ev) => void onArchivoComprobanteChat(ev)}
                  />
                  <input
                    ref={chatFotoCamaraInputRef}
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/webp"
                    capture="environment"
                    className="hidden"
                    onChange={(ev) => void onArchivoFotoChatCliente(ev)}
                  />
                  <input
                    ref={chatFotoGaleriaInputRef}
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/webp"
                    className="hidden"
                    onChange={(ev) => void onArchivoFotoChatCliente(ev)}
                  />
                  <div className="flex items-end gap-1.5">
                    <div className="flex shrink-0 items-center gap-0.5 pb-0.5">
                      <button
                        type="button"
                        title="Tomar foto"
                        aria-label="Tomar foto"
                        disabled={chatEnviando}
                        onClick={() => chatFotoCamaraInputRef.current?.click()}
                        className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                        </svg>
                      </button>
                      <button
                        type="button"
                        title="Galería"
                        aria-label="Adjuntar desde galería"
                        disabled={chatEnviando}
                        onClick={() => chatFotoGaleriaInputRef.current?.click()}
                        className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                          />
                        </svg>
                      </button>
                      {pedidoResumenChat?.metodoPago === "transferencia" ? (
                        <button
                          type="button"
                          title="Adjuntar comprobante de transferencia"
                          aria-label="Comprobante de transferencia"
                          disabled={chatEnviando}
                          onClick={() => chatComprobanteInputRef.current?.click()}
                          className="flex h-10 w-10 items-center justify-center rounded-full border border-amber-300 bg-amber-50 text-amber-900 shadow-sm transition hover:bg-amber-100 active:scale-95 disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                            />
                          </svg>
                        </button>
                      ) : null}
                    </div>
                    <textarea
                      value={chatTexto}
                      onChange={(e) => setChatTexto(e.target.value)}
                      placeholder="Mensaje"
                      disabled={!pedidoCreadoId}
                      rows={1}
                      className="max-h-36 min-h-[44px] flex-1 resize-y rounded-3xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm leading-snug text-slate-900 shadow-inner outline-none ring-emerald-500/30 placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-100"
                    />
                    <button
                      type="button"
                      title="Enviar"
                      aria-label="Enviar mensaje"
                      onClick={() => void enviarMensajeCliente()}
                      disabled={!pedidoCreadoId || chatEnviando || !chatTexto.trim()}
                      className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white shadow-md transition hover:bg-emerald-700 active:scale-95 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
                    >
                      {chatEnviando ? (
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      ) : (
                        <svg className="h-5 w-5 translate-x-px" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                          <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                        </svg>
                      )}
                    </button>
                  </div>
                  <p className="mt-1 px-1 text-center text-[10px] text-slate-500">
                    {pedidoResumenChat?.metodoPago === "transferencia"
                      ? "Foto o galería para cualquier imagen · el recibo solo si paga por transferencia."
                      : "Puede enviar fotos con la cámara o la galería."}
                  </p>
                </>
              ) : (
                <p className="px-2 pb-2 text-center text-[11px] text-slate-500">Confirme el pedido para escribir.</p>
              )}
              {chatError ? <p className="mt-1 px-2 text-center text-xs text-rose-600">{chatError}</p> : null}
            </div>
          </section>
        </div>
      ) : null}
      {chatVista === "minimizado" ? (
        <div
          className={`fixed inset-x-3 z-50 md:inset-x-auto md:right-5 md:w-[360px] md:max-w-[calc(100vw-2rem)] ${
            pedidoEnCurso ? "bottom-[8.5rem] md:bottom-28" : "bottom-24 md:bottom-20"
          }`}
        >
          <div className="flex items-stretch overflow-hidden rounded-2xl border border-cyan-200 bg-white shadow-2xl ring-1 ring-cyan-500/15">
            <div className="flex shrink-0 items-end bg-gradient-to-b from-cyan-50 to-sky-50 px-1.5 pb-1 pt-2 sm:px-2">
              <img
                src={MASCOTA_DOMICILIOS_URL}
                alt=""
                aria-hidden
                className="h-11 w-auto max-w-[2.75rem] object-contain drop-shadow-sm sm:h-14 sm:max-w-[3.25rem]"
                draggable={false}
              />
            </div>
            <button
              type="button"
              onClick={() => setChatVista("expandido")}
              className="min-w-0 flex-1 px-3 py-3 text-left transition hover:bg-cyan-50/90 active:bg-cyan-100/80 sm:px-4"
            >
              <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-800">Chat minimizado</p>
              <p className="mt-0.5 truncate text-sm font-bold text-slate-900">
                {pedidoCreadoId ? `Pedido ${pedidoCreadoId}` : "Pedidos"}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-600">Toque para volver al chat con el punto</p>
            </button>
            <button
              type="button"
              aria-label="Cerrar chat"
              title="Cerrar chat"
              onClick={() => setChatVista("cerrado")}
              className="shrink-0 border-l border-cyan-100 px-3.5 text-lg font-light leading-none text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"
            >
              ×
            </button>
          </div>
        </div>
      ) : null}
      {animacionCambioEstadoPedido ? (
        <PedidosOverlayMotivacionEstado
          key={animacionCambioEstadoPedido.key}
          titulo={animacionCambioEstadoPedido.titulo}
          subtitulo={animacionCambioEstadoPedido.subtitulo}
          variante={animacionCambioEstadoPedido.variante}
          mostrarConfeti={animacionCambioEstadoPedido.confeti}
          burstKey={animacionCambioEstadoPedido.key}
        />
      ) : null}
      <MediosTransferenciaClienteModal
        open={modalMediosTransferenciaCliente}
        onClose={() => setModalMediosTransferenciaCliente(false)}
        medios={tarifaDomicilio.mediosTransferencia}
      />
    </main>
  );
}

export default function PedidosLandingPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-slate-50 p-6 text-sm text-slate-600">Cargando pedidos...</main>}>
      <PedidosLandingClient />
    </Suspense>
  );
}
