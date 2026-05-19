"use client";

import Image from "next/image";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useSearchParams } from "next/navigation";
import { getCatalogoPOS } from "@/lib/catalogo-pos";
import { DEFAULT_COSTO_DOMICILIO_COP, DEFAULT_UMBRAL_GRATIS_COP } from "@/lib/pos-domicilios-tarifa-defaults";
import { estaEnVentanaHoraria, textoHorarioAtencionCliente } from "@/lib/pos-domicilios-horario";
import { comprimirComprobanteTransferenciaParaChat } from "@/lib/pos-domicilios-chat-imagen";
import { enviarMensajeChatDomicilio, listarMensajesChatDomicilio } from "@/lib/pos-domicilios-chat-api";
import { LOGO_ORG_URL } from "@/lib/brand";
import { PosDomiciliosChatBurbuja } from "@/components/PosDomiciliosChatBurbuja";
import { activarNotificacionesPedidoDomicilio, pedidosPushSoportadoEnEsteNavegador } from "@/lib/pedidos-push-client";
import type { ProductoPOS } from "@/types";
import type { MensajeChatDomicilio } from "@/types/pos-domicilios-chat";

export const dynamic = "force-dynamic";

type MetodoPago = "efectivo" | "transferencia" | "datafono";
type CanalPedido = "web" | "qr";
type TipoEntregaPedido = "domicilio" | "recogida";

const CLUB_MILLAS_URL = "https://maria-chorizos-wms.vercel.app/club-de-millas/mi-plan";

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
  | "RECHAZADO";

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

function categoriaProducto(p: ProductoPOS): string {
  const c = (p.categoria ?? "").trim();
  return c || "Especialidades";
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
  precioUnitarioLinea: number;
};

const VARIANTE_BASE_KEY = "__base";

function keyLineaPedido(sku: string, varianteKey: string | null): string {
  return `${sku}::${varianteKey ?? VARIANTE_BASE_KEY}`;
}

function parseKeyLineaPedido(lineKey: string): { sku: string; varianteKey: string | null } {
  const [skuRaw, varianteRaw] = lineKey.split("::");
  const sku = (skuRaw ?? "").trim();
  const vk = (varianteRaw ?? VARIANTE_BASE_KEY).trim();
  return { sku, varianteKey: vk && vk !== VARIANTE_BASE_KEY ? vk : null };
}

function opcionesVariantesProducto(p: ProductoPOS): VarianteUi[] {
  const out: VarianteUi[] = [];
  const preciosMap = p.preciosPorVariante ?? {};
  if (Array.isArray(p.variantes) && p.variantes.length > 0) {
    for (const v of p.variantes) {
      const key = (v.clave ?? "").trim();
      if (!key) continue;
      const label = (v.etiqueta ?? key).trim();
      const precio = v.precioVenta ?? preciosMap[key] ?? p.precioUnitario;
      out.push({ key, label, precio: Number.isFinite(precio) ? precio : p.precioUnitario });
    }
    return out;
  }
  const keys = Object.keys(preciosMap);
  for (const key of keys) {
    const precio = preciosMap[key];
    if (!key.trim() || !Number.isFinite(precio)) continue;
    out.push({ key: key.trim(), label: key.trim(), precio });
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

function rangoEtaEstado(estado: EstadoPedidoDomicilio | null, minutosTranscurridos: number): string {
  if (estado === "ENTREGADO") return "Pedido entregado";
  if (estado === "RECHAZADO") return "Pedido rechazado";
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

function textoMotivacionCambioEstado(estado: EstadoPedidoDomicilio): {
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
        titulo: "¡Tu pedido fue aceptado!",
        subtitulo: "El equipo ya está trabajando en tu orden.",
        variante: "exito",
        confeti: true,
      };
    case "EN_PREPARACION":
      return {
        titulo: "¡En la cocina!",
        subtitulo: "Estamos preparando tu pedido con esmero.",
        variante: "exito",
        confeti: true,
      };
    case "LISTO_PARA_DESPACHO":
      return {
        titulo: "¡Listo para salir!",
        subtitulo: "Tu pedido está listo para despacho.",
        variante: "exito",
        confeti: true,
      };
    case "EN_ENTREGA":
      return {
        titulo: "¡Va en camino!",
        subtitulo: "Preparate para disfrutar algo rico.",
        variante: "entrega",
        confeti: true,
      };
    case "ENTREGADO":
      return {
        titulo: "¡Pedido entregado!",
        subtitulo: "Gracias por elegir Maria Chorizos.",
        variante: "entrega",
        confeti: true,
      };
    case "RECHAZADO":
      return {
        titulo: "Pedido no disponible",
        subtitulo: "Si tenés dudas, escribinos por el chat.",
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

function esBebidaProducto(p: ProductoPOS): boolean {
  const t = textoNormalizado(`${p.descripcion} ${p.categoria ?? ""}`);
  return /gaseosa|limonada|jugo|bebida|agua|soda|malteada/.test(t);
}

function esPrincipalProducto(p: ProductoPOS): boolean {
  const t = textoNormalizado(`${p.descripcion} ${p.categoria ?? ""}`);
  return /chorizo|choripan|combo|parrilla|paquete/.test(t);
}

function esComplementoProducto(p: ProductoPOS): boolean {
  const t = textoNormalizado(`${p.descripcion} ${p.categoria ?? ""}`);
  return /arepa|papa|salsa|chimichurri|aji|ajo|ensalada/.test(t);
}

function porcentajeProgresoDomicilioGratis(subtotal: number, metaGratisCop: number): number {
  const meta = metaGratisCop > 0 ? metaGratisCop : DEFAULT_UMBRAL_GRATIS_COP;
  if (subtotal <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((subtotal / meta) * 100)));
}

function PedidosLandingClient() {
  const searchParams = useSearchParams();
  const puntoVenta = (searchParams?.get("puntoVenta") ?? "Punto Demo App").trim();
  const canalQuery = (searchParams?.get("canal") ?? "web").trim().toLowerCase();
  const canal: CanalPedido = canalQuery === "qr" ? "qr" : "web";

  const [catalogo, setCatalogo] = useState<ProductoPOS[]>([]);
  const [loadingCatalogo, setLoadingCatalogo] = useState(false);
  const [errorCatalogo, setErrorCatalogo] = useState<string | null>(null);
  const [cantidades, setCantidades] = useState<Record<string, number>>({});
  const [varianteSeleccionadaPorSku, setVarianteSeleccionadaPorSku] = useState<Record<string, string>>({});
  const [cliente, setCliente] = useState("");
  const [telefono, setTelefono] = useState("");
  const [direccion, setDireccion] = useState("");
  const [referencia, setReferencia] = useState("");
  const [metodoPago, setMetodoPago] = useState<MetodoPago>("efectivo");
  const [tipoEntrega, setTipoEntrega] = useState<TipoEntregaPedido>("domicilio");
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [pedidoCreadoId, setPedidoCreadoId] = useState<string | null>(null);
  const [pedidoCreadoEnIso, setPedidoCreadoEnIso] = useState<string | null>(null);
  const [estadoPedido, setEstadoPedido] = useState<EstadoPedidoDomicilio | null>(null);
  const [estadoPedidoLoading, setEstadoPedidoLoading] = useState(false);
  const [ahoraMs, setAhoraMs] = useState(Date.now());
  const [busqueda, setBusqueda] = useState("");
  const [categoriaActiva, setCategoriaActiva] = useState("Todo");
  const [chatVista, setChatVista] = useState<"cerrado" | "minimizado" | "expandido">("cerrado");
  const [chatEstadoVisible, setChatEstadoVisible] = useState(false);
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
  const [pedidoResumenChat, setPedidoResumenChat] = useState<ResumenPedidoChatCliente | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const chatComprobanteInputRef = useRef<HTMLInputElement | null>(null);
  const chatFotoCamaraInputRef = useRef<HTMLInputElement | null>(null);
  const chatFotoGaleriaInputRef = useRef<HTMLInputElement | null>(null);
  const checkoutRef = useRef<HTMLDivElement | null>(null);
  const estadoPedidoAnteriorRef = useRef<EstadoPedidoDomicilio | null>(null);
  const [tarifaDomicilio, setTarifaDomicilio] = useState({
    costoDomicilioCop: DEFAULT_COSTO_DOMICILIO_COP,
    umbralGratisCop: DEFAULT_UMBRAL_GRATIS_COP,
    domiciliosHabilitados: true,
    domiciliosHoraInicio: "07:00",
    domiciliosHoraFin: "22:00",
  });
  /** Fuerza reevaluación del horario local (Colombia) sin depender solo del fetch periódico. */
  const [tickHorarioRecepcion, setTickHorarioRecepcion] = useState(0);

  const vapidPublicPedidos = useMemo(() => process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? "", []);

  useEffect(() => {
    setPushPedidosNavOk(pedidosPushSoportadoEnEsteNavegador());
  }, []);

  const refrescarTarifaDomicilio = useCallback(async () => {
    try {
      const url = `/api/pos_domicilios_config?${new URLSearchParams({ puntoVenta }).toString()}`;
      const res = await fetch(url, { method: "GET", cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        costoDomicilioCop?: number;
        umbralGratisCop?: number;
        domiciliosHabilitados?: boolean;
        domiciliosHoraInicio?: string;
        domiciliosHoraFin?: string;
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
      const domiciliosHoraInicio =
        typeof json.domiciliosHoraInicio === "string" && json.domiciliosHoraInicio.trim() ? json.domiciliosHoraInicio.trim() : "07:00";
      const domiciliosHoraFin =
        typeof json.domiciliosHoraFin === "string" && json.domiciliosHoraFin.trim() ? json.domiciliosHoraFin.trim() : "22:00";
      setTarifaDomicilio({
        costoDomicilioCop: costo,
        umbralGratisCop: umbral,
        domiciliosHabilitados,
        domiciliosHoraInicio,
        domiciliosHoraFin,
      });
    } catch {
      /* se mantienen defaults */
    }
  }, [puntoVenta]);

  useEffect(() => {
    void refrescarTarifaDomicilio();
    const t = window.setInterval(() => {
      void refrescarTarifaDomicilio();
    }, 45000);
    return () => window.clearInterval(t);
  }, [refrescarTarifaDomicilio]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setTickHorarioRecepcion((n) => n + 1);
    }, 60_000);
    return () => window.clearInterval(id);
  }, []);

  const recepcionPedidosWebOk = useMemo(() => {
    void tickHorarioRecepcion;
    if (!tarifaDomicilio.domiciliosHabilitados) return false;
    return estaEnVentanaHoraria(tarifaDomicilio.domiciliosHoraInicio, tarifaDomicilio.domiciliosHoraFin);
  }, [
    tickHorarioRecepcion,
    tarifaDomicilio.domiciliosHabilitados,
    tarifaDomicilio.domiciliosHoraInicio,
    tarifaDomicilio.domiciliosHoraFin,
  ]);

  const avisoBloqueoRecepcion = useMemo(() => {
    void tickHorarioRecepcion;
    if (recepcionPedidosWebOk) return null;
    if (!tarifaDomicilio.domiciliosHabilitados) {
      return "En este momento no estamos recibiendo pedidos por web ni QR. Podés intentar más tarde o contactar directamente al local.";
    }
    return `Estamos fuera del horario de atención para pedidos en línea. ${textoHorarioAtencionCliente(
      tarifaDomicilio.domiciliosHoraInicio,
      tarifaDomicilio.domiciliosHoraFin
    )}`;
  }, [
    tickHorarioRecepcion,
    recepcionPedidosWebOk,
    tarifaDomicilio.domiciliosHabilitados,
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

  const categorias = useMemo(() => {
    const set = new Set<string>();
    for (const p of catalogo) set.add(categoriaProducto(p));
    return ["Todo", ...Array.from(set).sort((a, b) => a.localeCompare(b, "es"))];
  }, [catalogo]);

  const productosFiltrados = useMemo(() => {
    const q = textoNormalizado(busqueda);
    return catalogo.filter((p) => {
      const cat = categoriaProducto(p);
      const okCat = categoriaActiva === "Todo" || cat === categoriaActiva;
      if (!okCat) return false;
      if (!q) return true;
      const texto = textoNormalizado(`${p.descripcion} ${cat} ${p.sku}`);
      return texto.includes(q);
    });
  }, [catalogo, busqueda, categoriaActiva]);

  const itemsCarrito = useMemo<CarritoLinea[]>(() => {
    const porSku = new Map(catalogo.map((p) => [p.sku, p]));
    const out: CarritoLinea[] = [];
    for (const [lineKey, cantidad] of Object.entries(cantidades)) {
      if (!Number.isFinite(cantidad) || cantidad <= 0) continue;
      const { sku, varianteKey } = parseKeyLineaPedido(lineKey);
      const p = porSku.get(sku);
      if (!p) continue;
      const variantes = opcionesVariantesProducto(p);
      const variante = varianteKey ? variantes.find((v) => v.key === varianteKey) : null;
      const precioUnitarioLinea = variante?.precio ?? p.precioUnitario;
      out.push({
        lineKey,
        p,
        cantidad,
        varianteKey: variante?.key ?? null,
        varianteLabel: variante?.label ?? null,
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

  const recomendaciones = useMemo(() => {
    const carritoSkus = new Set(itemsCarrito.map((x) => x.p.sku));
    const categoriasCarrito = new Set(itemsCarrito.map((x) => categoriaProducto(x.p)));
    return catalogo
      .filter((p) => Number.isFinite(p.precioUnitario) && p.precioUnitario > 0)
      .map((p) => ({ p, score: sugerenciaScore(p, carritoSkus, categoriasCarrito) }))
      .filter((x) => x.score > -999)
      .sort((a, b) => b.score - a.score || a.p.precioUnitario - b.p.precioUnitario)
      .slice(0, 4)
      .map((x) => x.p);
  }, [catalogo, itemsCarrito]);

  const combosSugeridos = useMemo(() => {
    const carritoSkus = new Set(itemsCarrito.map((x) => x.p.sku));
    const principales = catalogo.filter((p) => esPrincipalProducto(p) && !carritoSkus.has(p.sku));
    const bebidas = catalogo.filter((p) => esBebidaProducto(p) && !carritoSkus.has(p.sku));
    const complementos = catalogo.filter((p) => esComplementoProducto(p) && !carritoSkus.has(p.sku));

    const principal = principales[0] ?? null;
    const bebida = bebidas[0] ?? null;
    const complemento = complementos[0] ?? null;

    const out: Array<{
      id: string;
      titulo: string;
      descripcion: string;
      skus: string[];
      ahorro: number;
    }> = [];

    if (principal && bebida) {
      out.push({
        id: "combo-principal-bebida",
        titulo: "Combo recomendado",
        descripcion: `${principal.descripcion} + ${bebida.descripcion}`,
        skus: [principal.sku, bebida.sku],
        ahorro: 2000,
      });
    }
    if (principal && complemento) {
      out.push({
        id: "combo-principal-complemento",
        titulo: "Combo antojo",
        descripcion: `${principal.descripcion} + ${complemento.descripcion}`,
        skus: [principal.sku, complemento.sku],
        ahorro: 1500,
      });
    }
    if (bebida && complemento) {
      out.push({
        id: "combo-extra",
        titulo: "Extra ideal",
        descripcion: `${bebida.descripcion} + ${complemento.descripcion}`,
        skus: [bebida.sku, complemento.sku],
        ahorro: 1000,
      });
    }
    return out.slice(0, 2);
  }, [catalogo, itemsCarrito]);

  const subirCantidad = (sku: string, varianteKey: string | null = null) => {
    const lineKey = keyLineaPedido(sku, varianteKey);
    setCantidades((prev) => ({ ...prev, [lineKey]: (prev[lineKey] ?? 0) + 1 }));
  };

  const bajarCantidad = (sku: string, varianteKey: string | null = null) => {
    const lineKey = keyLineaPedido(sku, varianteKey);
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
        const lk = keyLineaPedido(p.sku, varKey);
        next[lk] = (next[lk] ?? 0) + 1;
      }
      return next;
    });
  };

  const enviarPedido = async () => {
    if (enviando) return;
    if (!recepcionPedidosWebOk) {
      setMensaje(avisoBloqueoRecepcion ?? "En este momento no podemos recibir tu pedido.");
      return;
    }
    if (!itemsCarrito.length) {
      setMensaje("Agrega al menos un producto al carrito.");
      return;
    }
    if (!cliente.trim() || !telefono.trim()) {
      setMensaje("Completa nombre y teléfono para continuar.");
      return;
    }
    const telefonoDigitos = telefono.replace(/\D/g, "");
    if (telefonoDigitos.length !== 10) {
      setMensaje("El teléfono debe tener 10 dígitos (ej. celular en Colombia).");
      return;
    }
    if (tipoEntrega === "domicilio" && !direccion.trim()) {
      setMensaje("Indica la dirección de entrega o elige recoger en la tienda.");
      return;
    }
    setEnviando(true);
    setMensaje(null);
    setPedidoCreadoId(null);
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
      items: itemsCarrito.map((x) =>
        x.varianteLabel
          ? `${x.cantidad}x ${x.p.descripcion} (${x.varianteLabel})`
          : `${x.cantidad}x ${x.p.descripcion}`
      ),
      tiempoObjetivoMin: 35,
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
      const lineasResumen = itemsCarrito.map((x) =>
        x.varianteLabel
          ? `${x.cantidad}× ${x.p.descripcion} (${x.varianteLabel})`
          : `${x.cantidad}× ${x.p.descripcion}`
      );
      setPedidoResumenChat({
        lineasItems: lineasResumen,
        total: Math.round(total),
        metodoPago,
        direccion: direccionFinal,
        referencia: referenciaFinal,
        tipoEntrega,
        puntoVenta,
      });
      setPedidoCreadoId(json.pedido?.id ?? null);
      setPedidoCreadoEnIso(new Date().toISOString());
      setEtiquetaClienteChat(cliente.trim() || "Cliente");
      setChatVista("expandido");
      setMensaje("Tu pedido fue recibido. Muy pronto te contactamos para confirmar.");
      setCantidades({});
      setCliente("");
      setTelefono("");
      setDireccion("");
      setReferencia("");
      setMetodoPago("efectivo");
      setTipoEntrega("domicilio");
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
      setEtiquetaClienteChat("");
      setPedidoResumenChat(null);
      setChatEstadoVisible(false);
      setChatVista("cerrado");
      estadoPedidoAnteriorRef.current = null;
      setAnimacionCambioEstadoPedido(null);
      setResaltarTarjetaEstadoPedido(false);
      setPushPedidosMensaje(null);
      setPushPedidosExito(false);
      setPushPedidosActivando(false);
      return;
    }
    let activo = true;
    const cargar = async (silencioso = false) => {
      if (!silencioso) setChatCargando(true);
      const res = await listarMensajesChatDomicilio(puntoVenta, pedidoCreadoId);
      if (!activo) return;
      if (!res.ok) {
        if (!silencioso) setChatError(res.message ?? "No fue posible cargar el chat.");
      } else {
        setChatMensajes(res.data);
        setChatError(null);
      }
      if (!silencioso) setChatCargando(false);
    };
    void cargar(false);
    const timer = window.setInterval(() => {
      void cargar(true);
    }, 5000);
    return () => {
      activo = false;
      window.clearInterval(timer);
    };
  }, [pedidoCreadoId, puntoVenta]);

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

  const refrescarEstadoPedidoConSpinner = useCallback(async () => {
    const pid = pedidoCreadoId;
    if (!pid) return;
    setEstadoPedidoLoading(true);
    try {
      const url = `/api/pos_domicilios?${new URLSearchParams({ puntoVenta }).toString()}`;
      const res = await fetch(url, { method: "GET" });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        data?: Array<{ id?: string; estado?: EstadoPedidoDomicilio; creadoEnIso?: string }>;
      };
      const row = (json.data ?? []).find((x) => x.id === pid);
      const estado = row?.estado ?? null;
      if (estado) setEstadoPedido(estado);
      if (row?.creadoEnIso) setPedidoCreadoEnIso(row.creadoEnIso);
    } finally {
      setEstadoPedidoLoading(false);
    }
  }, [pedidoCreadoId, puntoVenta]);

  const toggleEstadoPedidoEnChat = useCallback(() => {
    if (!pedidoCreadoId) return;
    if (chatEstadoVisible) {
      setChatEstadoVisible(false);
      return;
    }
    setChatEstadoVisible(true);
    setAhoraMs(Date.now());
    void refrescarEstadoPedidoConSpinner();
  }, [pedidoCreadoId, chatEstadoVisible, refrescarEstadoPedidoConSpinner]);

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
          data?: Array<{ id?: string; estado?: EstadoPedidoDomicilio; creadoEnIso?: string }>;
        };
        if (!activo) return;
        const row = (json.data ?? []).find((x) => x.id === pedidoCreadoId);
        const estado = row?.estado ?? null;
        if (estado) setEstadoPedido(estado);
        if (row?.creadoEnIso) setPedidoCreadoEnIso(row.creadoEnIso);
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
    const copy = textoMotivacionCambioEstado(estadoPedido);
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
    return () => {
      window.clearTimeout(tPulse);
      if (tOverlay) window.clearTimeout(tOverlay);
    };
  }, [estadoPedido, pedidoCreadoId]);

  useEffect(() => {
    if (chatVista !== "expandido") return;
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: "smooth" });
  }, [chatMensajes, chatVista]);

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
      setChatError("No se pudo usar esa imagen. Probá con JPG o PNG, o una foto más chica.");
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
    const refresh = await listarMensajesChatDomicilio(puntoVenta, pedidoCreadoId);
    if (refresh.ok) setChatMensajes(refresh.data);
    setChatEnviando(false);
  };

  const onArchivoComprobanteChat = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (pedidoResumenChat?.metodoPago !== "transferencia") {
      setChatError("El comprobante de transferencia solo está disponible si elegiste pago por transferencia.");
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

  const activarNotificacionesPedidoCelular = async () => {
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
    setPushPedidosExito(r.ok);
  };

  return (
    <main className="min-h-screen w-full overflow-x-hidden bg-slate-50 pb-28 lg:pb-0">
      <section className="mx-auto max-w-6xl space-y-4 px-3 py-4 sm:px-4 sm:py-5 md:space-y-5 md:px-6 md:py-6">
        <header className="relative overflow-hidden rounded-2xl border border-cyan-200 bg-gradient-to-br from-cyan-700 via-sky-700 to-sky-600 p-4 text-white shadow-xl md:rounded-3xl md:p-6">
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/15 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-12 left-20 h-36 w-36 rounded-full bg-amber-200/20 blur-2xl" />
          <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100">App de pedidos Maria Chorizos</p>
              <h1 className="mt-1 text-2xl font-black leading-tight sm:text-3xl md:text-4xl">Pide como en una app de delivery</h1>
              <p className="mt-2 max-w-2xl text-sm text-cyan-50">
                Elige productos, confirma tu direccion y recibe tu pedido rapido. Atencion directa del punto POS.
              </p>
              <div className="mt-3 inline-flex max-w-full items-center gap-2 rounded-full border border-white/35 bg-white/15 px-3 py-1.5 text-xs font-semibold">
                <span className="inline-block h-2 w-2 rounded-full bg-lime-300" />
                <span className="truncate">Punto de venta: {puntoVenta}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="rounded-2xl border border-white/35 bg-white p-2 shadow-sm">
                <Image src={LOGO_ORG_URL} alt="Maria Chorizos" width={168} height={60} className="h-9 w-auto rounded-lg object-contain sm:h-11" />
              </div>
            </div>
          </div>

          <div
            role="region"
            aria-label="Club de millas Maria Chorizos"
            className="relative mt-5 overflow-hidden rounded-2xl border border-amber-300/40 shadow-lg animate-pedidos-club-border-glow"
          >
            <div
              className="pointer-events-none absolute inset-0 bg-gradient-to-r from-indigo-950 via-fuchsia-900 to-amber-700 bg-[length:220%_100%] opacity-95 animate-pedidos-club-gradient"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute inset-y-0 left-0 w-[42%] bg-gradient-to-r from-transparent via-white/25 to-transparent animate-pedidos-club-shimmer mix-blend-overlay"
              aria-hidden
            />
            <div className="relative z-10 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:p-5">
              <div className="min-w-0 space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-amber-200/90">Club de millas · experiencia premium</p>
                <p className="text-base font-extrabold leading-snug text-white drop-shadow-sm sm:text-lg">
                  ¿Ya perteneces a nuestro club de millas? No olvides registrarte y acumular millas con cada factura.
                </p>
                <p className="text-xs text-fuchsia-100/90">Beneficios exclusivos, seguimiento de tu plan y recompensas pensadas para clientes fieles.</p>
              </div>
              <div className="flex shrink-0 flex-col gap-2 sm:items-end">
                <button
                  type="button"
                  onClick={abrirClubMillasEnVentanaEmergente}
                  className="inline-flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-400 px-4 py-3 text-sm font-black text-indigo-950 shadow-md transition hover:brightness-110 active:scale-[0.98] sm:w-auto sm:px-5"
                >
                  Registrarme y ver mi plan
                </button>
                <p className="text-center text-[10px] text-white/70 sm:text-right">Se abre en una ventana emergente</p>
              </div>
            </div>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <article className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Tiempo estimado</p>
            <p className="mt-1 text-lg font-extrabold text-gray-900">35 - 45 min</p>
          </article>
          <article className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Cobertura</p>
            <p className="mt-1 text-lg font-extrabold text-gray-900">Zona urbana activa</p>
          </article>
          <article className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Pago seguro</p>
            <p className="mt-1 text-lg font-extrabold text-gray-900">Efectivo, Transferencia, Datáfono</p>
          </article>
          <article className="rounded-xl border border-cyan-200 bg-cyan-50 p-3 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-cyan-700">Beneficio</p>
            <p className="mt-1 text-lg font-extrabold text-cyan-900">
              {tipoEntrega === "recogida"
                ? "Recogida en tienda: sin costo de envío"
                : subtotal >= tarifaDomicilio.umbralGratisCop
                  ? "Domicilio gratis aplicado"
                  : `Gratis desde ${formatoMoneda(tarifaDomicilio.umbralGratisCop)}`}
            </p>
          </article>
        </section>

        <div className="grid gap-4 lg:grid-cols-[1fr_360px] lg:gap-5">
          <section className="min-w-0 space-y-4">
            <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm sm:p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Catalogo de productos</h2>
                  <p className="text-sm text-gray-500">Explora como en una app: busca, filtra y agrega al instante.</p>
                </div>
                <div className="w-full md:w-80">
                  <input
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    placeholder="Buscar producto..."
                    className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none ring-cyan-200 transition focus:border-cyan-500 focus:ring-2"
                  />
                </div>
              </div>
              <div className="-mx-1 mt-3 flex snap-x gap-2 overflow-auto px-1 pb-1">
                {categorias.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategoriaActiva(cat)}
                    className={`snap-start whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                      categoriaActiva === cat
                        ? "border-cyan-500 bg-cyan-600 text-white"
                        : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
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
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {productosFiltrados.map((prod, idx) => {
                  const variantes = opcionesVariantesProducto(prod);
                  const varianteActivaKey = varianteSeleccionadaPorSku[prod.sku] ?? (variantes[0]?.key ?? null);
                  const varianteActiva = varianteActivaKey ? variantes.find((v) => v.key === varianteActivaKey) : null;
                  const precioMostrar = varianteActiva?.precio ?? prod.precioUnitario;
                  const lineKey = keyLineaPedido(prod.sku, varianteActivaKey);
                  const cant = cantidades[lineKey] ?? 0;
                  const img = primeraImagenProducto(prod);
                  const usarImageOptimizada = img ? imagenProductoOptimizable(img) : false;
                  return (
                    <article key={prod.sku} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md sm:rounded-2xl">
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
                          <p className="line-clamp-2 text-sm font-bold text-gray-900">{prod.descripcion}</p>
                          <p className="text-[11px] text-gray-500">Producto fresco, preparado al momento.</p>
                        </div>
                        {variantes.length > 0 ? (
                          <div className="space-y-1">
                            <p className="text-[11px] font-semibold text-gray-600">Elige variante</p>
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
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-lg font-extrabold text-cyan-700">{formatoMoneda(precioMostrar)}</p>
                          <div className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1">
                            <button
                              type="button"
                              onClick={() => bajarCantidad(prod.sku, varianteActivaKey)}
                              className="h-8 w-8 rounded-md border border-gray-200 bg-white text-base font-bold text-gray-700 transition hover:bg-gray-100 active:scale-95"
                            >
                              -
                            </button>
                            <span className="w-7 text-center text-base font-semibold">{cant}</span>
                            <button
                              type="button"
                              onClick={() => subirCantidad(prod.sku, varianteActivaKey)}
                              className="h-8 w-8 rounded-md bg-cyan-700 text-base font-bold text-white transition hover:bg-cyan-800 active:scale-95"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
                {productosFiltrados.length === 0 ? (
                  <article className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500 sm:col-span-2 xl:col-span-3">
                    No encontramos productos con ese filtro. Prueba otra busqueda o categoria.
                  </article>
                ) : null}
              </div>
            )}
          </section>

          <aside ref={checkoutRef} className="min-w-0 space-y-3 lg:sticky lg:top-4 lg:h-fit lg:space-y-4">
            <section className="scroll-mt-20 overflow-hidden rounded-2xl border border-gray-200 bg-white p-3.5 shadow-sm sm:p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-gray-900">Tu pedido</h3>
                <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-[11px] font-semibold text-cyan-800">{totalItems} item(s)</span>
              </div>
              <ul className="mt-3 max-h-64 space-y-3 overflow-auto pr-0.5 text-sm text-gray-700 sm:max-h-72">
                {itemsCarrito.length === 0 ? (
                  <li className="text-gray-500">No has agregado productos.</li>
                ) : (
                  itemsCarrito.map(({ lineKey, p, cantidad, varianteLabel, precioUnitarioLinea, varianteKey }) => (
                    <li key={lineKey} className="rounded-xl border border-gray-100 bg-gray-50/80 p-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 font-semibold text-gray-900">
                            {p.descripcion}
                            {varianteLabel ? <span className="font-normal text-gray-600"> ({varianteLabel})</span> : null}
                          </p>
                          <p className="mt-0.5 text-[11px] text-gray-500">{formatoMoneda(precioUnitarioLinea)} c/u</p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1.5">
                          <strong className="text-sm text-cyan-800">{formatoMoneda(cantidad * precioUnitarioLinea)}</strong>
                          <div className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-1 py-0.5">
                            <button
                              type="button"
                              aria-label="Quitar una unidad"
                              onClick={() => bajarCantidad(p.sku, varianteKey)}
                              className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-white text-sm font-bold text-gray-700 transition hover:bg-gray-100 active:scale-95"
                            >
                              -
                            </button>
                            <span className="min-w-[1.5rem] text-center text-sm font-bold">{cantidad}</span>
                            <button
                              type="button"
                              aria-label="Agregar una unidad"
                              onClick={() => subirCantidad(p.sku, varianteKey)}
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
                  ))
                )}
              </ul>
              <div className="mt-3 space-y-1 rounded-xl bg-gray-50 p-3 text-xs text-gray-700">
                <div className="flex items-center justify-between">
                  <span>Subtotal</span>
                  <strong>{formatoMoneda(subtotal)}</strong>
                </div>
                <div className="flex items-center justify-between">
                  <span>{tipoEntrega === "recogida" ? "Envío a domicilio" : "Domicilio"}</span>
                  <strong>
                    {tipoEntrega === "recogida"
                      ? "No aplica"
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
            </section>

            <section className="overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/70 p-3.5 shadow-sm sm:p-4">
              <h3 className="text-sm font-bold text-amber-900">Promociones inteligentes</h3>
              {tipoEntrega === "recogida" ? (
                <p className="mt-2 text-xs font-medium text-amber-900">
                  Elegiste recoger en tienda: sin costo de envío en este pedido.
                </p>
              ) : null}
              {subtotal <= 0 ? (
                <p className="mt-2 text-xs text-amber-800">Agrega productos para activar beneficios personalizados.</p>
              ) : (
                <div className="mt-2 space-y-3">
                  {tipoEntrega === "domicilio" ? (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-amber-900">
                      <span>Domicilio gratis desde {formatoMoneda(tarifaDomicilio.umbralGratisCop)}</span>
                      <strong>{progresoDomicilioGratis}%</strong>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-amber-100">
                      <div
                        className="h-full rounded-full bg-amber-500 transition-all"
                        style={{ width: `${progresoDomicilioGratis}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-amber-800">
                      {faltanteDomicilioGratis > 0
                        ? `Te faltan ${formatoMoneda(faltanteDomicilioGratis)} para domicilio gratis.`
                        : "Ya tienes domicilio gratis en este pedido."}
                    </p>
                  </div>
                  ) : null}

                  {combosSugeridos.length > 0 ? (
                    <div className="space-y-2">
                      {combosSugeridos.map((combo) => (
                        <article key={combo.id} className="rounded-xl border border-amber-200 bg-white p-3">
                          <p className="text-xs font-bold text-amber-900">{combo.titulo}</p>
                          <p className="mt-1 text-xs text-gray-600">{combo.descripcion}</p>
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                              Ahorro sugerido {formatoMoneda(combo.ahorro)}
                            </span>
                            <button
                              type="button"
                              onClick={() => agregarComboSugerido(combo.skus)}
                              className="rounded-lg bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-amber-700 active:scale-95"
                            >
                              Agregar combo
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}
            </section>

            <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white p-3.5 shadow-sm sm:p-4">
              <h3 className="text-base font-bold text-gray-900">Datos de entrega</h3>
              <p className="mt-1 text-xs text-gray-500">Elige cómo quieres recibir tu pedido.</p>
              {avisoBloqueoRecepcion ? (
                <div
                  role="alert"
                  className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs font-medium text-amber-950"
                >
                  {avisoBloqueoRecepcion}
                </div>
              ) : null}
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setTipoEntrega("domicilio")}
                  className={`rounded-xl border-2 px-3 py-2.5 text-left text-sm font-semibold transition ${
                    tipoEntrega === "domicilio"
                      ? "border-cyan-600 bg-cyan-50 text-cyan-950 shadow-sm"
                      : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                  }`}
                >
                  Envío a domicilio
                  <span className="mt-0.5 block text-[11px] font-normal text-gray-600">Te llevamos el pedido a tu dirección.</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTipoEntrega("recogida")}
                  className={`rounded-xl border-2 px-3 py-2.5 text-left text-sm font-semibold transition ${
                    tipoEntrega === "recogida"
                      ? "border-cyan-600 bg-cyan-50 text-cyan-950 shadow-sm"
                      : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                  }`}
                >
                  Recoger en la tienda
                  <span className="mt-0.5 block text-[11px] font-normal text-gray-600">Pasas por el punto: {puntoVenta}</span>
                </button>
              </div>
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
                <p className="text-[11px] text-gray-500">Ingresá exactamente 10 dígitos del número de contacto.</p>
                {tipoEntrega === "domicilio" ? (
                  <input
                    value={direccion}
                    onChange={(e) => setDireccion(e.target.value)}
                    placeholder="Dirección de entrega"
                    className="block w-full max-w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none ring-cyan-200 focus:border-cyan-500 focus:ring-2"
                  />
                ) : (
                  <div className="rounded-lg border border-dashed border-cyan-300 bg-cyan-50/60 px-3 py-2.5 text-xs text-cyan-900">
                    <strong className="font-semibold">Recogida en tienda.</strong> Indica en referencia si vienes en un vehículo o nombre de quien recoge, si lo deseas.
                  </div>
                )}
                <input
                  value={referencia}
                  onChange={(e) => setReferencia(e.target.value)}
                  placeholder={tipoEntrega === "domicilio" ? "Referencia de dirección (opcional)" : "Notas para recogida (opcional)"}
                  className="block w-full max-w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none ring-cyan-200 focus:border-cyan-500 focus:ring-2"
                />
                <select
                  value={metodoPago}
                  onChange={(e) => setMetodoPago(e.target.value as MetodoPago)}
                  className="block w-full max-w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none ring-cyan-200 focus:border-cyan-500 focus:ring-2"
                >
                  <option value="efectivo">Pago en efectivo</option>
                  <option value="transferencia">Transferencia</option>
                  <option value="datafono">Datáfono</option>
                </select>
                <button
                  type="button"
                  onClick={enviarPedido}
                  disabled={enviando || !recepcionPedidosWebOk}
                  className="block w-full max-w-full rounded-lg bg-cyan-700 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {enviando ? "Enviando pedido..." : "Confirmar pedido"}
                </button>
              </div>
              {mensaje ? (
                <p className={`mt-3 text-xs ${pedidoCreadoId ? "text-emerald-700" : "text-rose-700"}`}>
                  {mensaje} {pedidoCreadoId ? `(${pedidoCreadoId})` : ""}
                </p>
              ) : null}
            </section>

            {pedidoCreadoId ? (
              <>
                <section
                  className={`rounded-2xl border border-cyan-200 bg-cyan-50/50 p-3.5 shadow-sm transition-shadow sm:p-4 ${
                    resaltarTarjetaEstadoPedido ? "animate-pedidos-estado-tarjeta-pulse ring-2 ring-cyan-400/70" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base font-bold text-cyan-900">Estado de tu pedido</h3>
                    <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-[11px] font-semibold text-cyan-800">
                      {estadoPedidoLoading ? "Actualizando..." : estadoEtiqueta(estadoPedido)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-cyan-700">Pedido {pedidoCreadoId}</p>
                  <p className="mt-1 text-xs font-semibold text-cyan-800">ETA estimada: {etaPedido}</p>
                  <div className="mt-3 grid grid-cols-6 gap-1">
                    {Array.from({ length: 6 }).map((_, idx) => {
                      const paso = idx + 1;
                      const activo = estadoPaso(estadoPedido) >= paso;
                      return (
                        <span
                          key={`paso-${paso}`}
                          className={`h-2 rounded-full transition ${activo ? "bg-cyan-600" : "bg-cyan-100"}`}
                        />
                      );
                    })}
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-[10px] text-cyan-700">
                    <span>Recibido</span>
                    <span className="text-center">Preparacion</span>
                    <span className="text-right">En camino</span>
                  </div>
                </section>
                <section className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-3.5 shadow-sm sm:p-4">
                  <h3 className="text-base font-bold text-indigo-950">Avisos en tu celular</h3>
                  <p className="mt-1 text-xs text-indigo-900/90">
                    Recibí una notificación cuando cambie el estado de tu pedido, aunque cambies de app o bloquees la pantalla (según tu navegador).
                  </p>
                  {!vapidPublicPedidos ? (
                    <p className="mt-2 text-xs text-slate-600">
                      Las notificaciones push requieren configuración en el servidor (claves VAPID). Consultá con el equipo del POS.
                    </p>
                  ) : !pushPedidosNavOk ? (
                    <p className="mt-2 text-xs text-amber-900/90">
                      Este navegador no permite notificaciones web aquí, o están desactivadas. En iPhone/iPad suele funcionar mejor si agregás el sitio a la pantalla de inicio y lo abrís desde el ícono (iOS 16.4+).
                    </p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      <button
                        type="button"
                        disabled={pushPedidosActivando || pushPedidosExito}
                        onClick={() => void activarNotificacionesPedidoCelular()}
                        className="w-full rounded-xl bg-indigo-700 px-3 py-2.5 text-sm font-bold text-white shadow-md transition hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {pushPedidosActivando
                          ? "Activando..."
                          : pushPedidosExito
                            ? "Avisos activados"
                            : "Permitir avisos de mi pedido"}
                      </button>
                      {pushPedidosMensaje ? (
                        <p className={`text-xs font-medium ${pushPedidosExito ? "text-emerald-800" : "text-rose-700"}`}>
                          {pushPedidosMensaje}
                        </p>
                      ) : null}
                    </div>
                  )}
                </section>
              </>
            ) : null}
          </aside>
        </div>

        {recomendaciones.length > 0 ? (
          <section className="rounded-2xl border border-gray-200 bg-white p-3.5 shadow-sm sm:p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-gray-900">Recomendados para ti</h3>
                <p className="text-xs text-gray-500">Sugerencias inteligentes para mejorar tu pedido.</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {recomendaciones.map((prod, idx) => {
                const img = primeraImagenProducto(prod);
                const vars = opcionesVariantesProducto(prod);
                const varKey = varianteSeleccionadaPorSku[prod.sku] ?? (vars[0]?.key ?? null);
                const varActiva = varKey ? vars.find((v) => v.key === varKey) : null;
                const precioRec = varActiva?.precio ?? prod.precioUnitario;
                const usarImageOptimizada = img ? imagenProductoOptimizable(img) : false;
                return (
                  <article key={`rec-${prod.sku}`} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                    <div className="relative flex aspect-[16/10] items-center justify-center bg-slate-100">
                      {img && usarImageOptimizada ? (
                        <Image
                          src={img}
                          alt={prod.descripcion}
                          fill
                          sizes="(max-width: 640px) calc(100vw - 2rem), (max-width: 1024px) calc(50vw - 1.5rem), 280px"
                          quality={64}
                          priority={idx < 1}
                          className="block bg-white object-contain object-center p-2 sm:object-cover sm:p-0"
                        />
                      ) : img ? (
                        <img
                          src={img}
                          alt={prod.descripcion}
                          className="block max-h-full max-w-full bg-white object-contain object-center p-2 sm:h-full sm:w-full sm:max-h-none sm:max-w-none sm:object-cover sm:p-0"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Image src={LOGO_ORG_URL} alt="Maria Chorizos" width={88} height={32} className="h-7 w-auto opacity-70" />
                        </div>
                      )}
                    </div>
                    <div className="space-y-2 p-3">
                      <p className="line-clamp-2 text-sm font-semibold text-gray-900">{prod.descripcion}</p>
                      <div className="flex items-center justify-between gap-2">
                        <strong className="text-sm text-cyan-700">{formatoMoneda(precioRec)}</strong>
                        <button
                          type="button"
                          onClick={() => subirCantidad(prod.sku, varKey)}
                          className="rounded-lg bg-cyan-700 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-cyan-800 active:scale-95"
                        >
                          Agregar
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}
      </section>
      <div className="fixed inset-x-3 bottom-3 z-40 flex gap-2 lg:hidden">
        <button
          type="button"
          onClick={() => checkoutRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
          className="flex-1 rounded-xl bg-slate-900 px-3 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-black active:scale-[0.98]"
        >
          Ver carrito ({totalItems})
        </button>
        <button
          type="button"
          onClick={() =>
            setChatVista((v) => {
              if (v === "cerrado") return "expandido";
              if (v === "minimizado") return "expandido";
              return "minimizado";
            })
          }
          className="flex-1 rounded-xl bg-cyan-700 px-3 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-cyan-800 active:scale-[0.98]"
        >
          {chatVista === "expandido" ? "Minimizar chat" : chatVista === "minimizado" ? "Abrir chat" : "Chat POS"}
        </button>
      </div>
      <button
        type="button"
        onClick={() =>
          setChatVista((v) => {
            if (v === "cerrado") return "expandido";
            if (v === "minimizado") return "expandido";
            return "minimizado";
          })
        }
        className="fixed bottom-5 right-5 z-40 hidden rounded-full bg-cyan-700 px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:bg-cyan-800 active:scale-[0.98] lg:inline-flex"
      >
        {chatVista === "expandido" ? "Minimizar chat" : chatVista === "minimizado" ? "Abrir chat" : "Chat con el punto"}
      </button>
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
                  {pedidoCreadoId ? `Pedido ${pedidoCreadoId}` : "Primero confirma tu pedido para chatear"}
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
            {pedidoCreadoId ? (
              <div className="shrink-0 border-b border-cyan-100 bg-gradient-to-b from-cyan-50 to-white px-3 py-1.5">
                <button
                  type="button"
                  onClick={toggleEstadoPedidoEnChat}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-cyan-300 bg-white px-2 py-2 text-[11px] font-bold text-cyan-900 shadow-sm transition hover:border-cyan-500 hover:bg-cyan-50/80 active:scale-[0.99]"
                >
                  <svg className="h-5 w-5 shrink-0 text-cyan-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  {chatEstadoVisible ? "Ocultar estado del pedido" : "Ver estado del pedido"}
                </button>
                {chatEstadoVisible ? (
                  <div className="mt-2 space-y-2 rounded-xl border border-cyan-200 bg-white p-3 text-xs text-cyan-950 shadow-inner">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-cyan-600">Estado actual</p>
                        <p className="mt-0.5 text-sm font-extrabold">
                          {estadoPedidoLoading ? "Consultando..." : estadoEtiqueta(estadoPedido)}
                        </p>
                        <p className="mt-1 text-[11px] font-semibold text-cyan-800">ETA: {etaPedido}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setAhoraMs(Date.now());
                          void refrescarEstadoPedidoConSpinner();
                        }}
                        disabled={estadoPedidoLoading}
                        className="shrink-0 rounded-lg border border-cyan-200 bg-cyan-50 px-2 py-1 text-[10px] font-semibold text-cyan-900 hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Actualizar
                      </button>
                    </div>
                    <div className="grid grid-cols-6 gap-0.5">
                      {Array.from({ length: 6 }).map((_, idx) => {
                        const paso = idx + 1;
                        const activo = estadoPaso(estadoPedido) >= paso;
                        return (
                          <span
                            key={`chat-estado-paso-${paso}`}
                            className={`h-2 rounded-full transition ${activo ? "bg-cyan-600" : "bg-cyan-100"}`}
                          />
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-slate-500">
                      El estado también se actualiza solo cada pocos segundos mientras tenés el pedido abierto.
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}
            <div
              ref={chatScrollRef}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[#e5ddd5] scroll-smooth"
            >
              {pedidoResumenChat && pedidoCreadoId ? (
                <div className="sticky top-0 z-[1] border-b border-emerald-200/80 bg-gradient-to-b from-emerald-50 via-white to-[#e5ddd5] px-3 pb-3 pt-2.5 shadow-sm">
                  <p className="text-center text-[10px] font-semibold uppercase tracking-wide text-emerald-800/80">
                    Tu pedido · {pedidoCreadoId}
                  </p>
                  <div className="mt-2 rounded-xl border border-white/80 bg-white/95 p-2.5 shadow-sm">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Resumen</p>
                    <ul className="mt-1.5 space-y-0.5 text-[12px] leading-snug text-slate-800">
                      {pedidoResumenChat.lineasItems.map((linea, i) => (
                        <li key={`resumen-item-${i}`} className="flex gap-1.5">
                          <span className="text-emerald-600" aria-hidden>
                            •
                          </span>
                          <span>{linea}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 border-t border-slate-100 pt-2 text-[12px] font-bold text-slate-900">
                      Total: {formatoMoneda(pedidoResumenChat.total)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-600">
                      Pago: {etiquetaMetodoPagoCliente(pedidoResumenChat.metodoPago)} ·{" "}
                      {pedidoResumenChat.tipoEntrega === "recogida" ? "Recogida en tienda" : "Envío a domicilio"}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-700">
                      <span className="font-semibold text-slate-800">Entrega: </span>
                      {pedidoResumenChat.direccion}
                    </p>
                    {pedidoResumenChat.referencia ? (
                      <p className="mt-0.5 text-[11px] text-slate-600">
                        <span className="font-semibold">Referencia: </span>
                        {pedidoResumenChat.referencia}
                      </p>
                    ) : null}
                    <p className="mt-0.5 text-[10px] text-slate-500">Punto: {pedidoResumenChat.puntoVenta}</p>
                  </div>
                  <div className="mt-2 rounded-xl border border-cyan-200/80 bg-cyan-50/90 p-2.5 text-[11px] leading-relaxed text-cyan-950">
                    <p className="font-extrabold text-cyan-900">Instrucciones</p>
                    <ul className="mt-1.5 list-disc space-y-1 pl-4 marker:text-cyan-600">
                      <li>Este chat es tu canal con el punto de venta. Te escribirán para confirmar horario, total y entrega.</li>
                      <li>Mantené este pedido abierto en el navegador para ver las respuestas al instante.</li>
                      {pedidoResumenChat.metodoPago === "transferencia" ? (
                        <li>
                          Elegiste <strong>transferencia</strong>: cuando hagas el pago, tocá el ícono de{" "}
                          <strong>comprobante</strong> (recibo) y adjuntá la captura, o escribí banco y referencia en el
                          mensaje.
                        </li>
                      ) : (
                        <li>
                          Pago en {etiquetaMetodoPagoCliente(pedidoResumenChat.metodoPago).toLowerCase()}: el repartidor o
                          el punto te indicará cómo abonar al recibir o en la tienda.
                        </li>
                      )}
                      <li>Si necesitás cambiar algo, escribí un mensaje abajo y el punto te responderá por aquí.</li>
                    </ul>
                  </div>
                </div>
              ) : null}
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
                      ? "Foto o galería para cualquier imagen · recibo solo si pagás por transferencia."
                      : "Podés enviar fotos con la cámara o la galería."}
                  </p>
                </>
              ) : (
                <p className="px-2 pb-2 text-center text-[11px] text-slate-500">Confirmá el pedido para escribir.</p>
              )}
              {chatError ? <p className="mt-1 px-2 text-center text-xs text-rose-600">{chatError}</p> : null}
            </div>
          </section>
        </div>
      ) : null}
      {chatVista === "minimizado" ? (
        <div className="fixed inset-x-3 bottom-24 z-50 md:inset-x-auto md:bottom-20 md:right-5 md:w-[340px] md:max-w-[calc(100vw-2rem)]">
          <div className="flex overflow-hidden rounded-2xl border border-cyan-200 bg-white shadow-2xl ring-1 ring-cyan-500/15">
            <button
              type="button"
              onClick={() => setChatVista("expandido")}
              className="min-w-0 flex-1 px-4 py-3 text-left transition hover:bg-cyan-50/90 active:bg-cyan-100/80"
            >
              <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-800">Chat minimizado</p>
              <p className="mt-0.5 truncate text-sm font-bold text-slate-900">
                {pedidoCreadoId ? `Pedido ${pedidoCreadoId}` : "Pedidos"}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-600">Tocá para volver al chat con el punto</p>
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
