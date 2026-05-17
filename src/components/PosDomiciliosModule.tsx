"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { domicilioCambiarEstado, domicilioCrear, domiciliosListar } from "@/lib/pos-domicilios-api";
import { enviarMensajeChatDomicilio, listarMensajesChatDomicilio } from "@/lib/pos-domicilios-chat-api";
import type { EstadoDomicilio, PedidoDomicilio } from "@/types/pos-domicilios";
import type { MensajeChatDomicilio } from "@/types/pos-domicilios-chat";

type Props = {
  puntoVenta?: string | null;
};

type FiltroEstado = "todos" | EstadoDomicilio;
type FiltroCanal = "todos" | PedidoDomicilio["canal"];
type VolumenSonido = "bajo" | "medio";
type UnreadPorPedido = Record<string, number>;

type FormNuevoPedido = {
  cliente: string;
  telefono: string;
  direccion: string;
  referencia: string;
  total: string;
  itemsTexto: string;
  metodoPago: PedidoDomicilio["metodoPago"];
  canal: PedidoDomicilio["canal"];
};

type ColumnaDomicilio = {
  estado: EstadoDomicilio;
  titulo: string;
  subtitulo: string;
  accentClasses: string;
  badgeClasses: string;
  nextEstado?: EstadoDomicilio;
  nextLabel?: string;
};

const COLUMNAS_DOMICILIO: ColumnaDomicilio[] = [
  {
    estado: "NUEVO",
    titulo: "Nuevo",
    subtitulo: "Pendiente de aceptación",
    accentClasses: "border-sky-200 bg-sky-50/65",
    badgeClasses: "bg-sky-100 text-sky-800",
    nextEstado: "ACEPTADO",
    nextLabel: "Aceptar pedido",
  },
  {
    estado: "ACEPTADO",
    titulo: "Aceptado",
    subtitulo: "Esperando inicio de cocina",
    accentClasses: "border-indigo-200 bg-indigo-50/65",
    badgeClasses: "bg-indigo-100 text-indigo-800",
    nextEstado: "EN_PREPARACION",
    nextLabel: "Iniciar preparación",
  },
  {
    estado: "EN_PREPARACION",
    titulo: "Preparación",
    subtitulo: "Pedido en cocina",
    accentClasses: "border-amber-200 bg-amber-50/65",
    badgeClasses: "bg-amber-100 text-amber-800",
    nextEstado: "LISTO_PARA_DESPACHO",
    nextLabel: "Marcar listo",
  },
  {
    estado: "LISTO_PARA_DESPACHO",
    titulo: "Listo",
    subtitulo: "Pendiente de asignar salida",
    accentClasses: "border-violet-200 bg-violet-50/65",
    badgeClasses: "bg-violet-100 text-violet-800",
    nextEstado: "EN_ENTREGA",
    nextLabel: "Enviar a entrega",
  },
  {
    estado: "EN_ENTREGA",
    titulo: "En entrega",
    subtitulo: "Domiciliario en ruta",
    accentClasses: "border-teal-200 bg-teal-50/65",
    badgeClasses: "bg-teal-100 text-teal-800",
    nextEstado: "ENTREGADO",
    nextLabel: "Confirmar entregado",
  },
];

const ESTADOS_ACTIVOS: EstadoDomicilio[] = [
  "NUEVO",
  "ACEPTADO",
  "EN_PREPARACION",
  "LISTO_PARA_DESPACHO",
  "EN_ENTREGA",
];

function formatoMoneda(valor: number): string {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(
    valor
  );
}

function formatoMinutosTranscurridos(iso: string): number {
  const ahora = Date.now();
  const creado = new Date(iso).getTime();
  const minutos = Math.max(0, Math.round((ahora - creado) / 60000));
  return minutos;
}

function formatoHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--:--";
  return new Intl.DateTimeFormat("es-CO", { hour: "2-digit", minute: "2-digit" }).format(d);
}

function etiquetaCanal(canal: PedidoDomicilio["canal"]): string {
  if (canal === "whatsapp") return "WhatsApp";
  if (canal === "qr") return "QR";
  return "Web";
}

function etiquetaPago(metodo: PedidoDomicilio["metodoPago"]): string {
  if (metodo === "datafono") return "Datáfono";
  if (metodo === "transferencia") return "Transferencia";
  return "Efectivo";
}

function etiquetaEstado(estado: EstadoDomicilio): string {
  if (estado === "NUEVO") return "Nuevo";
  if (estado === "ACEPTADO") return "Aceptado";
  if (estado === "EN_PREPARACION") return "En preparación";
  if (estado === "LISTO_PARA_DESPACHO") return "Listo";
  if (estado === "EN_ENTREGA") return "En entrega";
  if (estado === "ENTREGADO") return "Entregado";
  return "Rechazado";
}

function construirLandingPedidosUrl(puntoVenta: string): string {
  const baseEnv = process.env.NEXT_PUBLIC_POS_LANDING_PEDIDOS_URL?.trim();
  const pv = puntoVenta.trim();
  const fallbackBase =
    typeof window !== "undefined" ? `${window.location.origin}/pedidos` : "https://mariachorizos.app/pedidos";
  const base = baseEnv && /^https?:\/\//i.test(baseEnv) ? baseEnv : fallbackBase;
  const u = new URL(base);
  if (pv) u.searchParams.set("puntoVenta", pv);
  u.searchParams.set("canal", "qr");
  return u.toString();
}

function keySonidosDomicilios(puntoVenta: string): string {
  return `pos_mc_domicilios_sonido_v1:${puntoVenta.trim().toLowerCase() || "global"}`;
}

function keyVolumenDomicilios(puntoVenta: string): string {
  return `pos_mc_domicilios_volumen_v1:${puntoVenta.trim().toLowerCase() || "global"}`;
}

function keyChatSeenDomicilios(puntoVenta: string): string {
  return `pos_mc_domicilios_chat_seen_v1:${puntoVenta.trim().toLowerCase() || "global"}`;
}

function leerMapaVistoChat(puntoVenta: string): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(keyChatSeenDomicilios(puntoVenta));
    if (!raw) return {};
    const obj = JSON.parse(raw) as unknown;
    if (!obj || typeof obj !== "object") return {};
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).filter(([, v]) => typeof v === "string")
    ) as Record<string, string>;
  } catch {
    return {};
  }
}

function guardarMapaVistoChat(puntoVenta: string, mapa: Record<string, string>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(keyChatSeenDomicilios(puntoVenta), JSON.stringify(mapa));
  } catch {
    /* ignore */
  }
}

function gananciaMaximaVolumen(volumen: VolumenSonido): number {
  return volumen === "bajo" ? 0.03 : 0.06;
}

function reproducirTonoPos(tipo: "crear" | "reabrir", volumen: VolumenSonido): void {
  if (typeof window === "undefined" || typeof window.AudioContext === "undefined") return;
  try {
    const ctx = new window.AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = tipo === "crear" ? 880 : 740;
    const gananciaObjetivo = gananciaMaximaVolumen(volumen);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(gananciaObjetivo, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (tipo === "crear" ? 0.2 : 0.16));
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (tipo === "crear" ? 0.22 : 0.18));
    window.setTimeout(() => {
      void ctx.close().catch(() => undefined);
    }, 260);
  } catch {
    /* sin audio disponible */
  }
}

export default function PosDomiciliosModule({ puntoVenta }: Props) {
  const [pedidos, setPedidos] = useState<PedidoDomicilio[]>([]);
  const [filtro, setFiltro] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>("todos");
  const [filtroCanal, setFiltroCanal] = useState<FiltroCanal>("todos");
  const [cargando, setCargando] = useState(false);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [syncInfo, setSyncInfo] = useState<string | null>(null);
  const [actualizandoId, setActualizandoId] = useState<string | null>(null);
  const [creandoPedido, setCreandoPedido] = useState(false);
  const [pedidoResaltadoId, setPedidoResaltadoId] = useState<string | null>(null);
  const [sonidosActivos, setSonidosActivos] = useState(true);
  const [volumenSonido, setVolumenSonido] = useState<VolumenSonido>("medio");
  const [qrAbierto, setQrAbierto] = useState(false);
  const [landingPedidosUrl, setLandingPedidosUrl] = useState("");
  const [landingQrDataUrl, setLandingQrDataUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const [chatPedidoAbierto, setChatPedidoAbierto] = useState<PedidoDomicilio | null>(null);
  const [chatMensajes, setChatMensajes] = useState<MensajeChatDomicilio[]>([]);
  const [chatTextoPos, setChatTextoPos] = useState("");
  const [chatCargando, setChatCargando] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatEnviando, setChatEnviando] = useState(false);
  const [unreadPorPedido, setUnreadPorPedido] = useState<UnreadPorPedido>({});
  const [nuevoPedido, setNuevoPedido] = useState<FormNuevoPedido>({
    cliente: "",
    telefono: "",
    direccion: "",
    referencia: "",
    total: "",
    itemsTexto: "",
    metodoPago: "efectivo",
    canal: "web",
  });
  const columnaNuevoRef = useRef<HTMLElement | null>(null);
  const pedidosNuevosPrevRef = useRef<string[]>([]);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  const puntoVentaActivo = (puntoVenta ?? "").trim();
  const totalNoLeidos = useMemo(
    () => Object.values(unreadPorPedido).reduce((acc, n) => acc + n, 0),
    [unreadPorPedido]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = construirLandingPedidosUrl(puntoVentaActivo);
    let cancelled = false;
    setLandingPedidosUrl(url);
    setLandingQrDataUrl(null);
    setQrError(null);
    void QRCode.toDataURL(url, {
      margin: 1,
      width: 520,
      errorCorrectionLevel: "M",
      color: { dark: "#0f172a", light: "#ffffff" },
    })
      .then((dataUrl) => {
        if (cancelled) return;
        setLandingQrDataUrl(dataUrl);
      })
      .catch(() => {
        if (cancelled) return;
        setQrError("No se pudo generar el QR del landing.");
      });
    return () => {
      cancelled = true;
    };
  }, [puntoVentaActivo]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(keySonidosDomicilios(puntoVentaActivo));
      if (raw == null) {
        setSonidosActivos(true);
        return;
      }
      setSonidosActivos(raw !== "off");
    } catch {
      setSonidosActivos(true);
    }
  }, [puntoVentaActivo]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(keyVolumenDomicilios(puntoVentaActivo));
      if (raw === "bajo" || raw === "medio") {
        setVolumenSonido(raw);
      } else {
        setVolumenSonido("medio");
      }
    } catch {
      setVolumenSonido("medio");
    }
  }, [puntoVentaActivo]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(keySonidosDomicilios(puntoVentaActivo), sonidosActivos ? "on" : "off");
    } catch {
      /* ignore */
    }
  }, [puntoVentaActivo, sonidosActivos]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(keyVolumenDomicilios(puntoVentaActivo), volumenSonido);
    } catch {
      /* ignore */
    }
  }, [puntoVentaActivo, volumenSonido]);

  const cargarPedidosDesdeOrigen = useCallback(
    async (opts?: { silencioso?: boolean; detectarNuevos?: boolean }) => {
      if (!puntoVentaActivo) {
        setPedidos([]);
        setErrorCarga("No hay punto de venta configurado para cargar domicilios.");
        return;
      }
      if (!opts?.silencioso) setCargando(true);
      if (!opts?.silencioso) setErrorCarga(null);
      const res = await domiciliosListar(puntoVentaActivo);
      setPedidos(res.data);
      if (res.message && !opts?.silencioso) setSyncInfo(res.message);
      if (opts?.detectarNuevos) {
        const nuevosActuales = res.data.filter((p) => p.estado === "NUEVO").map((p) => p.id);
        const prev = pedidosNuevosPrevRef.current;
        const llegados = nuevosActuales.filter((id) => !prev.includes(id));
        if (prev.length > 0 && llegados.length > 0) {
          setSyncInfo(`Llegaron ${llegados.length} pedido(s) nuevo(s) desde el landing.`);
          if (sonidosActivos) reproducirTonoPos("crear", volumenSonido);
        }
        pedidosNuevosPrevRef.current = nuevosActuales;
      }
      if (!opts?.silencioso) setCargando(false);
    },
    [puntoVentaActivo, sonidosActivos, volumenSonido]
  );

  useEffect(() => {
    let cancelled = false;
    void cargarPedidosDesdeOrigen({ detectarNuevos: true }).catch(() => {
      if (cancelled) return;
      setErrorCarga("No fue posible cargar los domicilios.");
      setCargando(false);
    });
    const timer = window.setInterval(() => {
      void cargarPedidosDesdeOrigen({ silencioso: true, detectarNuevos: true }).catch(() => undefined);
    }, 12000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [cargarPedidosDesdeOrigen]);

  const marcarChatLeido = useCallback(
    (pedidoId: string) => {
      const pid = pedidoId.trim();
      if (!pid || !puntoVentaActivo) return;
      const prev = leerMapaVistoChat(puntoVentaActivo);
      prev[pid] = new Date().toISOString();
      guardarMapaVistoChat(puntoVentaActivo, prev);
      setUnreadPorPedido((cur) => ({ ...cur, [pid]: 0 }));
    },
    [puntoVentaActivo]
  );

  useEffect(() => {
    if (!puntoVentaActivo || pedidos.length === 0) {
      setUnreadPorPedido({});
      return;
    }
    let activo = true;
    const revisarNoLeidos = async () => {
      const mapaVisto = leerMapaVistoChat(puntoVentaActivo);
      const candidatos = pedidos.filter((p) => ESTADOS_ACTIVOS.includes(p.estado));
      const result: UnreadPorPedido = {};
      await Promise.all(
        candidatos.map(async (p) => {
          const res = await listarMensajesChatDomicilio(p.puntoVenta, p.id);
          if (!res.ok) {
            result[p.id] = 0;
            return;
          }
          const vistoIso = mapaVisto[p.id];
          const vistoAt = vistoIso ? new Date(vistoIso).getTime() : 0;
          const unread = res.data.filter((m) => {
            if (m.autor !== "cliente") return false;
            const t = new Date(m.creadoEnIso).getTime();
            return Number.isFinite(t) && t > vistoAt;
          }).length;
          result[p.id] = unread;
        })
      );
      if (!activo) return;
      setUnreadPorPedido(result);
    };
    void revisarNoLeidos();
    const timer = window.setInterval(() => {
      void revisarNoLeidos();
    }, 9000);
    return () => {
      activo = false;
      window.clearInterval(timer);
    };
  }, [puntoVentaActivo, pedidos]);

  useEffect(() => {
    if (!chatPedidoAbierto) {
      setChatMensajes([]);
      setChatTextoPos("");
      setChatError(null);
      return;
    }
    let activo = true;
    const cargar = async (silencioso = false) => {
      if (!silencioso) setChatCargando(true);
      const res = await listarMensajesChatDomicilio(chatPedidoAbierto.puntoVenta, chatPedidoAbierto.id);
      if (!activo) return;
      if (!res.ok) {
        if (!silencioso) setChatError(res.message ?? "No fue posible cargar el chat.");
      } else {
        setChatMensajes(res.data);
        setChatError(null);
        marcarChatLeido(chatPedidoAbierto.id);
      }
      if (!silencioso) setChatCargando(false);
    };
    void cargar(false);
    const timer = window.setInterval(() => {
      void cargar(true);
    }, 4000);
    return () => {
      activo = false;
      window.clearInterval(timer);
    };
  }, [chatPedidoAbierto, marcarChatLeido]);

  useEffect(() => {
    if (!chatPedidoAbierto) return;
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: "smooth" });
  }, [chatMensajes, chatPedidoAbierto]);

  const pedidosFiltrados = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    return pedidos.filter((p) => {
      const matchTexto =
        !q ||
        p.id.toLowerCase().includes(q) ||
        p.cliente.toLowerCase().includes(q) ||
        p.telefono.toLowerCase().includes(q) ||
        p.direccion.toLowerCase().includes(q);
      const matchEstado = filtroEstado === "todos" || p.estado === filtroEstado;
      const matchCanal = filtroCanal === "todos" || p.canal === filtroCanal;
      return matchTexto && matchEstado && matchCanal;
    });
  }, [pedidos, filtro, filtroEstado, filtroCanal]);

  const totalActivos = useMemo(() => pedidos.filter((p) => ESTADOS_ACTIVOS.includes(p.estado)).length, [pedidos]);

  const enRiesgo = useMemo(
    () =>
      pedidos.filter((p) => ESTADOS_ACTIVOS.includes(p.estado) && formatoMinutosTranscurridos(p.creadoEnIso) > p.tiempoObjetivoMin).length,
    [pedidos]
  );

  const ventasActivas = useMemo(
    () => pedidos.filter((p) => ESTADOS_ACTIVOS.includes(p.estado)).reduce((acc, p) => acc + p.total, 0),
    [pedidos]
  );

  const pedidosRechazados = useMemo(() => pedidosFiltrados.filter((p) => p.estado === "RECHAZADO"), [pedidosFiltrados]);

  const moverPedido = async (id: string, to: EstadoDomicilio, motivo?: string): Promise<boolean> => {
    if (!puntoVentaActivo || actualizandoId) return false;
    const anterior = pedidos;
    setActualizandoId(id);
    setSyncInfo(null);
    setPedidos((prev) =>
      prev.map((p) =>
        p.id === id
          ? {
              ...p,
              estado: to,
              rechazoMotivo: to === "RECHAZADO" ? motivo?.trim() || "Sin motivo especificado" : undefined,
              rechazadoEnIso: to === "RECHAZADO" ? new Date().toISOString() : undefined,
            }
          : p
      )
    );
    const result = await domicilioCambiarEstado({ puntoVenta: puntoVentaActivo, pedidoId: id, estado: to, motivo });
    if (!result.ok) {
      setPedidos(anterior);
      setSyncInfo(result.message ?? "No se pudo actualizar el pedido.");
      setActualizandoId(null);
      return false;
    }
    setSyncInfo(result.message ?? "Estado actualizado.");
    setActualizandoId(null);
    return true;
  };

  const crearPedido = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!puntoVentaActivo || creandoPedido) return;
    const items = nuevoPedido.itemsTexto
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    const total = Number(nuevoPedido.total.replace(/[^\d]/g, ""));
    if (!nuevoPedido.cliente.trim() || !nuevoPedido.telefono.trim() || !nuevoPedido.direccion.trim() || !items.length || !total) {
      setSyncInfo("Completa cliente, teléfono, dirección, total e ítems para crear el pedido.");
      return;
    }
    setCreandoPedido(true);
    setSyncInfo(null);
    const resp = await domicilioCrear({
      puntoVenta: puntoVentaActivo,
      cliente: nuevoPedido.cliente,
      telefono: nuevoPedido.telefono,
      direccion: nuevoPedido.direccion,
      referencia: nuevoPedido.referencia,
      total,
      items,
      metodoPago: nuevoPedido.metodoPago,
      canal: nuevoPedido.canal,
    });
    if (!resp.ok || !resp.pedido) {
      setSyncInfo(resp.message ?? "No fue posible crear el pedido.");
      setCreandoPedido(false);
      return;
    }
    setPedidos((prev) => [resp.pedido!, ...prev.filter((p) => p.id !== resp.pedido!.id)]);
    setNuevoPedido({
      cliente: "",
      telefono: "",
      direccion: "",
      referencia: "",
      total: "",
      itemsTexto: "",
      metodoPago: "efectivo",
      canal: "web",
    });
    setSyncInfo(resp.message ?? `Pedido ${resp.pedido.id} creado.`);
    if (sonidosActivos) reproducirTonoPos("crear", volumenSonido);
    setCreandoPedido(false);
  };

  const rechazarPedido = async (pedido: PedidoDomicilio) => {
    if (!puntoVentaActivo || actualizandoId) return;
    const motivo = window.prompt(`Motivo de rechazo para ${pedido.id}:`, pedido.rechazoMotivo ?? "");
    if (motivo == null) return;
    const motivoTrim = motivo.trim();
    if (!motivoTrim) {
      setSyncInfo("Debes indicar un motivo para rechazar el pedido.");
      return;
    }
    await moverPedido(pedido.id, "RECHAZADO", motivoTrim);
  };

  const enfocarPedidoEnNuevo = (pedidoId: string) => {
    setPedidoResaltadoId(pedidoId);
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        columnaNuevoRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "start",
        });
      });
      window.setTimeout(() => {
        setPedidoResaltadoId((prev) => (prev === pedidoId ? null : prev));
      }, 2800);
    }
  };

  const reabrirPedido = async (pedidoId: string) => {
    const ok = await moverPedido(pedidoId, "NUEVO");
    if (ok) {
      enfocarPedidoEnNuevo(pedidoId);
      if (sonidosActivos) reproducirTonoPos("reabrir", volumenSonido);
    }
  };

  const abrirChatPedido = (pedido: PedidoDomicilio) => {
    setChatPedidoAbierto(pedido);
    setChatTextoPos("");
    setChatError(null);
    marcarChatLeido(pedido.id);
  };

  const enviarMensajePos = async () => {
    if (!chatPedidoAbierto || chatEnviando) return;
    const texto = chatTextoPos.trim();
    if (!texto) return;
    setChatEnviando(true);
    setChatError(null);
    const resp = await enviarMensajeChatDomicilio({
      puntoVenta: chatPedidoAbierto.puntoVenta,
      pedidoId: chatPedidoAbierto.id,
      autor: "pos",
      autorLabel: "POS",
      texto,
    });
    if (!resp.ok) {
      setChatError(resp.message ?? "No fue posible enviar el mensaje.");
      setChatEnviando(false);
      return;
    }
    setChatTextoPos("");
    const refresh = await listarMensajesChatDomicilio(chatPedidoAbierto.puntoVenta, chatPedidoAbierto.id);
    if (refresh.ok) setChatMensajes(refresh.data);
    setChatEnviando(false);
  };

  return (
    <section className="space-y-5">
      <div className="relative overflow-hidden rounded-2xl border border-cyan-200 bg-gradient-to-r from-sky-600 via-cyan-600 to-teal-500 p-6 text-white shadow-lg">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/15 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-8 left-16 h-24 w-24 rounded-full bg-amber-200/20 blur-2xl" />
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100">Nuevo canal</p>
            <h2 className="mt-2 text-2xl font-black leading-tight">Domicilios Premium</h2>
            <p className="mt-2 max-w-2xl text-sm text-cyan-50/95">
              Bandeja en vivo para operar domicilios desde el POS de cada punto. Aceptá, prepará, despachá y
              completá entregas sin salir de caja.
            </p>
            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/35 bg-white/15 px-3 py-1.5 text-xs font-semibold">
              <span className="inline-block h-2 w-2 rounded-full bg-lime-300" />
              Punto activo: {puntoVenta ?? "Sin punto configurado"}
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="rounded-2xl border border-white/30 bg-white/15 p-3 shadow-sm">
              <svg className="h-9 w-9" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.8}
                  d="M3 8.25h11.5v7.5H3m0-7.5l2.3-3.5h7.4l1.8 3.5M14.5 10.5h2.25l2.25 2.25v3h-4.5m0-5.25V15.75m0 0A2.25 2.25 0 1 0 19 15.75m-15.75 0A2.25 2.25 0 1 0 7.5 15.75"
                />
              </svg>
            </div>
            <div className="rounded-2xl border border-white/35 bg-white/15 p-2 shadow-sm backdrop-blur-sm">
              <button
                type="button"
                onClick={() => setQrAbierto(true)}
                className="group block rounded-xl bg-white p-1.5 text-slate-900 transition hover:scale-[1.02]"
                title="Ver QR ampliado del landing de pedidos"
              >
                {landingQrDataUrl ? (
                  <img
                    src={landingQrDataUrl}
                    alt="QR de pedidos por domicilio"
                    className="h-14 w-14 rounded-md object-cover"
                  />
                ) : (
                  <span className="flex h-14 w-14 items-center justify-center rounded-md bg-slate-100 text-[10px] font-bold">
                    QR
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setQrAbierto(true)}
                className="mt-1 w-full rounded-md border border-white/35 bg-white/20 px-2 py-1 text-[10px] font-semibold text-white hover:bg-white/30"
              >
                Ampliar QR
              </button>
            </div>
          </div>
        </div>
      </div>

      {qrAbierto ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-[1px]">
          <div className="w-full max-w-md rounded-2xl border border-cyan-200 bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h4 className="text-lg font-extrabold text-slate-900">QR para pedidos</h4>
                <p className="text-xs text-slate-500">Los clientes escanean y llegan al landing público de domicilios.</p>
              </div>
              <button
                type="button"
                onClick={() => setQrAbierto(false)}
                className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cerrar
              </button>
            </div>
            <div className="rounded-xl border border-gray-200 bg-slate-50 p-3">
              {landingQrDataUrl ? (
                <img
                  src={landingQrDataUrl}
                  alt="QR ampliado de pedidos domicilio"
                  className="mx-auto h-72 w-72 max-w-full rounded-lg bg-white p-2"
                />
              ) : (
                <div className="mx-auto flex h-72 w-72 max-w-full items-center justify-center rounded-lg bg-white text-sm font-medium text-slate-500">
                  Generando QR...
                </div>
              )}
            </div>
            {qrError ? <p className="mt-2 text-xs text-rose-600">{qrError}</p> : null}
            <p className="mt-2 line-clamp-2 break-all text-[11px] text-slate-500">{landingPedidosUrl}</p>
            <div className="mt-3 flex items-center justify-end gap-2">
              <a
                href={landingPedidosUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg bg-cyan-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-800"
              >
                Abrir landing
              </a>
            </div>
          </div>
          <button
            type="button"
            aria-label="Cerrar modal QR"
            onClick={() => setQrAbierto(false)}
            className="absolute inset-0 -z-10"
          />
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Pedidos activos</p>
          <p className="mt-2 text-2xl font-extrabold text-gray-900">{totalActivos}</p>
          <p className="mt-1 text-xs text-gray-500">En proceso de operación</p>
        </article>
        <article className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">En riesgo de SLA</p>
          <p className={`mt-2 text-2xl font-extrabold ${enRiesgo > 0 ? "text-rose-600" : "text-emerald-600"}`}>
            {enRiesgo}
          </p>
          <p className="mt-1 text-xs text-gray-500">Superaron tiempo objetivo</p>
        </article>
        <article className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Venta activa</p>
          <p className="mt-2 text-2xl font-extrabold text-gray-900">{formatoMoneda(ventasActivas)}</p>
          <p className="mt-1 text-xs text-gray-500">Pedidos no finalizados</p>
        </article>
        <article className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Cobertura</p>
          <p className="mt-2 text-2xl font-extrabold text-gray-900">Zona A</p>
          <p className="mt-1 text-xs text-gray-500">Base inicial para rutas</p>
        </article>
      </div>

      <form onSubmit={crearPedido} className="rounded-2xl border border-cyan-200 bg-cyan-50/40 p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-base font-bold text-cyan-900">Crear pedido de domicilio</h3>
          <span className="rounded-full bg-cyan-100 px-2 py-1 text-[11px] font-semibold text-cyan-800">Ingreso rápido POS</span>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <input
            value={nuevoPedido.cliente}
            onChange={(e) => setNuevoPedido((p) => ({ ...p, cliente: e.target.value }))}
            placeholder="Cliente"
            className="rounded-lg border border-cyan-200 bg-white px-3 py-2 text-sm outline-none ring-cyan-300 focus:ring-2"
          />
          <input
            value={nuevoPedido.telefono}
            onChange={(e) => setNuevoPedido((p) => ({ ...p, telefono: e.target.value }))}
            placeholder="Teléfono"
            className="rounded-lg border border-cyan-200 bg-white px-3 py-2 text-sm outline-none ring-cyan-300 focus:ring-2"
          />
          <input
            value={nuevoPedido.direccion}
            onChange={(e) => setNuevoPedido((p) => ({ ...p, direccion: e.target.value }))}
            placeholder="Dirección"
            className="rounded-lg border border-cyan-200 bg-white px-3 py-2 text-sm outline-none ring-cyan-300 focus:ring-2"
          />
          <input
            value={nuevoPedido.referencia}
            onChange={(e) => setNuevoPedido((p) => ({ ...p, referencia: e.target.value }))}
            placeholder="Referencia (opcional)"
            className="rounded-lg border border-cyan-200 bg-white px-3 py-2 text-sm outline-none ring-cyan-300 focus:ring-2"
          />
          <input
            value={nuevoPedido.total}
            onChange={(e) => setNuevoPedido((p) => ({ ...p, total: e.target.value }))}
            placeholder="Total (COP)"
            className="rounded-lg border border-cyan-200 bg-white px-3 py-2 text-sm outline-none ring-cyan-300 focus:ring-2"
          />
          <input
            value={nuevoPedido.itemsTexto}
            onChange={(e) => setNuevoPedido((p) => ({ ...p, itemsTexto: e.target.value }))}
            placeholder="Items separados por coma"
            className="rounded-lg border border-cyan-200 bg-white px-3 py-2 text-sm outline-none ring-cyan-300 focus:ring-2 md:col-span-2"
          />
          <select
            value={nuevoPedido.metodoPago}
            onChange={(e) => setNuevoPedido((p) => ({ ...p, metodoPago: e.target.value as PedidoDomicilio["metodoPago"] }))}
            className="rounded-lg border border-cyan-200 bg-white px-3 py-2 text-sm outline-none ring-cyan-300 focus:ring-2"
          >
            <option value="efectivo">Efectivo</option>
            <option value="transferencia">Transferencia</option>
            <option value="datafono">Datáfono</option>
          </select>
          <div className="flex items-center gap-3">
            <select
              value={nuevoPedido.canal}
              onChange={(e) => setNuevoPedido((p) => ({ ...p, canal: e.target.value as PedidoDomicilio["canal"] }))}
              className="w-full rounded-lg border border-cyan-200 bg-white px-3 py-2 text-sm outline-none ring-cyan-300 focus:ring-2"
            >
              <option value="web">Web</option>
              <option value="qr">QR</option>
            </select>
            <button
              type="submit"
              disabled={creandoPedido}
              className="shrink-0 rounded-lg bg-cyan-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {creandoPedido ? "Creando..." : "Crear pedido"}
            </button>
          </div>
        </div>
      </form>

      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Bandeja operativa por estado</h3>
            <p className="text-sm text-gray-500">
              Gestioná el flujo de punta a punta desde el POS.
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-rose-500" />
                {totalNoLeidos} chat(s) no leído(s)
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSonidosActivos((v) => !v)}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
              sonidosActivos
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
            }`}
            title="Activar o desactivar sonidos de acciones de domicilios"
          >
            <span className={`inline-block h-2 w-2 rounded-full ${sonidosActivos ? "bg-emerald-500" : "bg-gray-400"}`} />
            Sonidos {sonidosActivos ? "ON" : "OFF"}
          </button>
          <label className="flex w-full items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 md:w-44">
            <span>Volumen</span>
            <select
              value={volumenSonido}
              onChange={(e) => setVolumenSonido(e.target.value as VolumenSonido)}
              disabled={!sonidosActivos}
              className="w-full rounded-md border border-gray-200 px-2 py-1 text-xs outline-none ring-brand-yellow/40 transition focus:border-brand-yellow focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="bajo">Bajo</option>
              <option value="medio">Medio</option>
            </select>
          </label>
          <label className="w-full md:w-72">
            <span className="sr-only">Buscar pedido</span>
            <input
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              placeholder="Buscar por pedido, cliente, teléfono o dirección"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none ring-brand-yellow/40 transition focus:border-brand-yellow focus:ring-2"
            />
          </label>
          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value as FiltroEstado)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none ring-brand-yellow/40 transition focus:border-brand-yellow focus:ring-2 md:w-52"
          >
            <option value="todos">Estado: todos</option>
            <option value="NUEVO">Nuevo</option>
            <option value="ACEPTADO">Aceptado</option>
            <option value="EN_PREPARACION">En preparación</option>
            <option value="LISTO_PARA_DESPACHO">Listo</option>
            <option value="EN_ENTREGA">En entrega</option>
            <option value="ENTREGADO">Entregado</option>
            <option value="RECHAZADO">Rechazado</option>
          </select>
          <select
            value={filtroCanal}
            onChange={(e) => setFiltroCanal(e.target.value as FiltroCanal)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none ring-brand-yellow/40 transition focus:border-brand-yellow focus:ring-2 md:w-44"
          >
            <option value="todos">Canal: todos</option>
            <option value="web">Web</option>
            <option value="qr">QR</option>
          </select>
        </div>
        {cargando ? <p className="mt-3 text-xs text-gray-500">Cargando pedidos...</p> : null}
        {errorCarga ? <p className="mt-3 text-xs font-medium text-rose-600">{errorCarga}</p> : null}
        {syncInfo ? <p className="mt-3 text-xs text-cyan-700">{syncInfo}</p> : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        {COLUMNAS_DOMICILIO.map((col) => {
          const pedidosColumna = pedidosFiltrados.filter((p) => p.estado === col.estado);
          return (
            <section
              key={col.estado}
              ref={col.estado === "NUEVO" ? columnaNuevoRef : undefined}
              className={`rounded-2xl border p-3 shadow-sm ${col.accentClasses}`}
            >
              <header className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <h4 className="text-sm font-extrabold text-gray-900">{col.titulo}</h4>
                  <p className="text-xs text-gray-600">{col.subtitulo}</p>
                </div>
                <span className={`rounded-full px-2 py-1 text-xs font-bold ${col.badgeClasses}`}>{pedidosColumna.length}</span>
              </header>

              <div className="space-y-3">
                {pedidosColumna.length === 0 ? (
                  <article className="rounded-xl border border-dashed border-gray-300 bg-white/70 p-4 text-center text-xs text-gray-500">
                    Sin pedidos.
                  </article>
                ) : (
                  pedidosColumna.map((pedido) => {
                    const transcurrido = formatoMinutosTranscurridos(pedido.creadoEnIso);
                    const riesgo = transcurrido > pedido.tiempoObjetivoMin;
                    return (
                      <article
                        key={pedido.id}
                        className={`space-y-3 rounded-xl border bg-white p-3 shadow-sm transition-all ${
                          col.estado === "NUEVO" && pedido.id === pedidoResaltadoId
                            ? "border-sky-400 ring-2 ring-sky-300 shadow-lg"
                            : "border-gray-200"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-extrabold text-gray-900">{pedido.id}</p>
                              {(unreadPorPedido[pedido.id] ?? 0) > 0 ? (
                                <span className="inline-flex items-center rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                                  {unreadPorPedido[pedido.id]}
                                </span>
                              ) : null}
                            </div>
                            <p className="text-xs text-gray-500">{pedido.cliente}</p>
                          </div>
                          <span
                            className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                              riesgo ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"
                            }`}
                          >
                            {transcurrido} min
                          </span>
                        </div>

                        <div className="space-y-1 text-xs text-gray-600">
                          <p className="line-clamp-1">{pedido.direccion}</p>
                          {pedido.referencia ? <p className="line-clamp-1">{pedido.referencia}</p> : null}
                          <p>{pedido.telefono}</p>
                        </div>

                        <ul className="space-y-1 rounded-lg bg-gray-50 p-2 text-xs text-gray-700">
                          {pedido.items.map((it) => (
                            <li key={`${pedido.id}-${it}`} className="line-clamp-1">
                              {it}
                            </li>
                          ))}
                        </ul>

                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700">
                            {etiquetaCanal(pedido.canal)}
                          </span>
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700">
                            {etiquetaPago(pedido.metodoPago)}
                          </span>
                        </div>

                        <div className="flex items-end justify-between gap-2">
                          <p className="text-sm font-extrabold text-gray-900">{formatoMoneda(pedido.total)}</p>
                          {col.nextEstado && col.nextLabel ? (
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => void rechazarPedido(pedido)}
                                disabled={Boolean(actualizandoId)}
                                className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Rechazar
                              </button>
                              <button
                                type="button"
                                onClick={() => abrirChatPedido(pedido)}
                                className="rounded-lg border border-cyan-200 bg-cyan-50 px-2.5 py-1.5 text-xs font-semibold text-cyan-700 transition hover:bg-cyan-100"
                              >
                                Chat
                              </button>
                              <button
                                type="button"
                                onClick={() => void moverPedido(pedido.id, col.nextEstado!)}
                                disabled={Boolean(actualizandoId)}
                                className="rounded-lg bg-gray-900 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {actualizandoId === pedido.id ? "Actualizando..." : col.nextLabel}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            </section>
          );
        })}
      </div>

      {chatPedidoAbierto ? (
        <div className="fixed inset-0 z-[72] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-[1px]">
          <div className="w-full max-w-lg rounded-2xl border border-cyan-200 bg-white shadow-2xl">
            <header className="flex items-start justify-between gap-3 rounded-t-2xl bg-cyan-700 px-4 py-3 text-white">
              <div>
                <p className="text-sm font-extrabold">Chat pedido {chatPedidoAbierto.id}</p>
                <p className="text-xs text-cyan-100">{chatPedidoAbierto.cliente} · {chatPedidoAbierto.telefono}</p>
              </div>
              <button
                type="button"
                onClick={() => setChatPedidoAbierto(null)}
                className="rounded-lg border border-white/30 px-2.5 py-1 text-xs font-semibold hover:bg-white/15"
              >
                Cerrar
              </button>
            </header>
            <div ref={chatScrollRef} className="max-h-80 min-h-60 space-y-2 overflow-auto bg-slate-50 p-3">
              {chatCargando ? (
                <p className="text-xs text-slate-500">Cargando mensajes...</p>
              ) : chatMensajes.length === 0 ? (
                <p className="text-xs text-slate-500">Sin mensajes aún. El cliente puede escribir desde el landing.</p>
              ) : (
                chatMensajes.map((m) => {
                  const esPos = m.autor === "pos";
                  return (
                    <article
                      key={m.id}
                      className={`max-w-[85%] rounded-xl px-3 py-2 text-xs shadow-sm ${esPos ? "ml-auto bg-cyan-600 text-white" : "bg-white text-slate-800"}`}
                    >
                      <p className={`font-semibold ${esPos ? "text-cyan-100" : "text-slate-700"}`}>{m.autorLabel}</p>
                      <p className="mt-1 whitespace-pre-wrap">{m.texto}</p>
                      <p className={`mt-1 text-[10px] ${esPos ? "text-cyan-100" : "text-slate-500"}`}>{formatoHora(m.creadoEnIso)}</p>
                    </article>
                  );
                })
              )}
            </div>
            <div className="space-y-2 border-t border-gray-200 p-3">
              <textarea
                value={chatTextoPos}
                onChange={(e) => setChatTextoPos(e.target.value)}
                rows={2}
                placeholder="Responder al cliente..."
                className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-xs outline-none ring-cyan-200 focus:border-cyan-500 focus:ring-2"
              />
              <button
                type="button"
                onClick={enviarMensajePos}
                disabled={chatEnviando || !chatTextoPos.trim()}
                className="w-full rounded-lg bg-cyan-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {chatEnviando ? "Enviando..." : "Enviar mensaje"}
              </button>
              {chatError ? <p className="text-xs text-rose-600">{chatError}</p> : null}
            </div>
          </div>
          <button
            type="button"
            aria-label="Cerrar chat de pedido"
            onClick={() => setChatPedidoAbierto(null)}
            className="absolute inset-0 -z-10"
          />
        </div>
      ) : null}

      <article className="rounded-xl border border-rose-200 bg-rose-50/60 p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-sm font-bold text-rose-800">Pedidos rechazados</p>
          <span className="rounded-full bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-700">
            {pedidosRechazados.length}
          </span>
        </div>
        {pedidosRechazados.length === 0 ? (
          <p className="text-sm text-rose-700/70">No hay pedidos rechazados en el filtro actual.</p>
        ) : (
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {pedidosRechazados.map((p) => (
              <div key={p.id} className="rounded-lg border border-rose-200 bg-white p-3">
                <p className="text-sm font-bold text-gray-900">{p.id}</p>
                <p className="text-xs text-gray-600">{p.cliente}</p>
                <p className="mt-1 text-xs text-rose-700">{p.rechazoMotivo ?? "Sin motivo"}</p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-gray-500">{etiquetaEstado(p.estado)}</span>
                  <button
                    type="button"
                    onClick={() => void reabrirPedido(p.id)}
                    disabled={Boolean(actualizandoId)}
                    className="rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {actualizandoId === p.id ? "Reabriendo..." : "Reabrir"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </article>

      <article className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Siguiente construcción</p>
        <p className="mt-2 text-sm text-gray-700">
          Próximo paso técnico: integrar WebSocket de eventos (`pedido creado`, `pedido actualizado`) para sincronizar
          esta bandeja en tiempo real entre todos los equipos del punto de venta.
        </p>
      </article>
    </section>
  );
}
