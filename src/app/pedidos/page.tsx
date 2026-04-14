"use client";

import Image from "next/image";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getCatalogoPOS } from "@/lib/catalogo-pos";
import { enviarMensajeChatDomicilio, listarMensajesChatDomicilio } from "@/lib/pos-domicilios-chat-api";
import { LOGO_ORG_URL } from "@/lib/brand";
import type { ProductoPOS } from "@/types";
import type { MensajeChatDomicilio } from "@/types/pos-domicilios-chat";

export const dynamic = "force-dynamic";

type MetodoPago = "efectivo" | "transferencia" | "datafono";
type CanalPedido = "web" | "qr";
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

function porcentajeProgresoDomicilioGratis(subtotal: number): number {
  const meta = 35000;
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
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [pedidoCreadoId, setPedidoCreadoId] = useState<string | null>(null);
  const [pedidoCreadoEnIso, setPedidoCreadoEnIso] = useState<string | null>(null);
  const [estadoPedido, setEstadoPedido] = useState<EstadoPedidoDomicilio | null>(null);
  const [estadoPedidoLoading, setEstadoPedidoLoading] = useState(false);
  const [ahoraMs, setAhoraMs] = useState(Date.now());
  const [busqueda, setBusqueda] = useState("");
  const [categoriaActiva, setCategoriaActiva] = useState("Todo");
  const [chatAbierto, setChatAbierto] = useState(false);
  const [chatMensajes, setChatMensajes] = useState<MensajeChatDomicilio[]>([]);
  const [chatTexto, setChatTexto] = useState("");
  const [chatCargando, setChatCargando] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatEnviando, setChatEnviando] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const checkoutRef = useRef<HTMLDivElement | null>(null);

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
  const faltanteDomicilioGratis = useMemo(() => Math.max(0, 35000 - subtotal), [subtotal]);
  const progresoDomicilioGratis = useMemo(() => porcentajeProgresoDomicilioGratis(subtotal), [subtotal]);
  const costoDomicilio = useMemo(() => {
    if (subtotal <= 0) return 0;
    if (subtotal >= 35000) return 0;
    return 4000;
  }, [subtotal]);
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
    if (!itemsCarrito.length) {
      setMensaje("Agrega al menos un producto al carrito.");
      return;
    }
    if (!cliente.trim() || !telefono.trim() || !direccion.trim()) {
      setMensaje("Completa cliente, teléfono y dirección para continuar.");
      return;
    }
    setEnviando(true);
    setMensaje(null);
    setPedidoCreadoId(null);
    const body = {
      puntoVenta,
      cliente: cliente.trim(),
      telefono: telefono.trim(),
      direccion: direccion.trim(),
      referencia: referencia.trim() || undefined,
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
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; pedido?: { id?: string } };
      if (!res.ok || json.ok === false) {
        setMensaje(json.message ?? "No se pudo registrar el pedido.");
        setEnviando(false);
        return;
      }
      setPedidoCreadoId(json.pedido?.id ?? null);
      setPedidoCreadoEnIso(new Date().toISOString());
      setMensaje("Tu pedido fue recibido. Muy pronto te contactamos para confirmar.");
      setCantidades({});
      setCliente("");
      setTelefono("");
      setDireccion("");
      setReferencia("");
      setMetodoPago("efectivo");
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
    if (!pedidoCreadoId) return;
    const timer = window.setInterval(() => {
      setAhoraMs(Date.now());
    }, 30000);
    return () => {
      window.clearInterval(timer);
    };
  }, [pedidoCreadoId]);

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
    if (!chatAbierto) return;
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: "smooth" });
  }, [chatMensajes, chatAbierto]);

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
      autorLabel: cliente.trim() || "Cliente",
      texto,
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

  return (
    <main className="min-h-screen bg-slate-50">
      <section className="mx-auto max-w-6xl space-y-5 px-4 py-6 md:px-6">
        <header className="relative overflow-hidden rounded-3xl border border-cyan-200 bg-gradient-to-br from-cyan-700 via-sky-700 to-sky-600 p-5 text-white shadow-xl md:p-6">
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/15 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-12 left-20 h-36 w-36 rounded-full bg-amber-200/20 blur-2xl" />
          <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100">App de pedidos Maria Chorizos</p>
              <h1 className="mt-1 text-3xl font-black leading-tight md:text-4xl">Pide como en una app de delivery</h1>
              <p className="mt-2 max-w-2xl text-sm text-cyan-50">
                Elige productos, confirma tu direccion y recibe tu pedido rapido. Atencion directa del punto POS.
              </p>
              <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/35 bg-white/15 px-3 py-1.5 text-xs font-semibold">
                <span className="inline-block h-2 w-2 rounded-full bg-lime-300" />
                Punto de venta: {puntoVenta}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="rounded-2xl border border-white/35 bg-white p-2 shadow-sm">
                <Image src={LOGO_ORG_URL} alt="Maria Chorizos" width={168} height={60} className="h-11 w-auto rounded-lg object-contain" />
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
              {subtotal >= 35000 ? "Domicilio gratis aplicado" : "Gratis desde $35.000"}
            </p>
          </article>
        </section>

        <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
          <section className="space-y-4">
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
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
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none ring-cyan-200 transition focus:border-cyan-500 focus:ring-2"
                  />
                </div>
              </div>
              <div className="mt-3 flex gap-2 overflow-auto pb-1">
                {categorias.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategoriaActiva(cat)}
                    className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
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
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, idx) => (
                  <article key={`skeleton-${idx}`} className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                    <div className="h-36 animate-pulse bg-slate-200" />
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
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {productosFiltrados.map((prod) => {
                  const variantes = opcionesVariantesProducto(prod);
                  const varianteActivaKey = varianteSeleccionadaPorSku[prod.sku] ?? (variantes[0]?.key ?? null);
                  const varianteActiva = varianteActivaKey ? variantes.find((v) => v.key === varianteActivaKey) : null;
                  const precioMostrar = varianteActiva?.precio ?? prod.precioUnitario;
                  const lineKey = keyLineaPedido(prod.sku, varianteActivaKey);
                  const cant = cantidades[lineKey] ?? 0;
                  const img = primeraImagenProducto(prod);
                  return (
                    <article key={prod.sku} className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md">
                      <div className="relative h-36 bg-gradient-to-br from-slate-100 to-slate-200">
                        {img ? (
                          <img src={img} alt={prod.descripcion} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <Image src={LOGO_ORG_URL} alt="Maria Chorizos" width={108} height={40} className="h-9 w-auto opacity-75" />
                          </div>
                        )}
                        <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-white">
                          {categoriaProducto(prod)}
                        </span>
                      </div>
                      <div className="space-y-3 p-3">
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
                        <div className="flex items-end justify-between gap-3">
                          <p className="text-lg font-extrabold text-cyan-700">{formatoMoneda(precioMostrar)}</p>
                          <div className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1">
                            <button
                              type="button"
                              onClick={() => bajarCantidad(prod.sku, varianteActivaKey)}
                              className="h-7 w-7 rounded-md border border-gray-200 bg-white text-sm font-bold text-gray-700 transition hover:bg-gray-100 active:scale-95"
                            >
                              -
                            </button>
                            <span className="w-6 text-center text-sm font-semibold">{cant}</span>
                            <button
                              type="button"
                              onClick={() => subirCantidad(prod.sku, varianteActivaKey)}
                              className="h-7 w-7 rounded-md bg-cyan-700 text-sm font-bold text-white transition hover:bg-cyan-800 active:scale-95"
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

          <aside ref={checkoutRef} className="space-y-4 lg:sticky lg:top-4 lg:h-fit">
            <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-gray-900">Tu pedido</h3>
                <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-[11px] font-semibold text-cyan-800">{totalItems} item(s)</span>
              </div>
              <ul className="mt-3 max-h-56 space-y-2 overflow-auto text-sm text-gray-700">
                {itemsCarrito.length === 0 ? (
                  <li className="text-gray-500">No has agregado productos.</li>
                ) : (
                  itemsCarrito.map(({ lineKey, p, cantidad, varianteLabel, precioUnitarioLinea }) => (
                    <li key={lineKey} className="flex items-center justify-between gap-2">
                      <span className="line-clamp-2">
                        {cantidad}x {p.descripcion}
                        {varianteLabel ? ` (${varianteLabel})` : ""}
                      </span>
                      <strong>{formatoMoneda(cantidad * precioUnitarioLinea)}</strong>
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
                  <span>Domicilio</span>
                  <strong>{costoDomicilio === 0 ? "Gratis" : formatoMoneda(costoDomicilio)}</strong>
                </div>
                <div className="my-1 border-t border-gray-200" />
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-gray-900">Total</span>
                  <strong className="text-cyan-700">{formatoMoneda(total)}</strong>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 shadow-sm">
              <h3 className="text-sm font-bold text-amber-900">Promociones inteligentes</h3>
              {subtotal <= 0 ? (
                <p className="mt-2 text-xs text-amber-800">Agrega productos para activar beneficios personalizados.</p>
              ) : (
                <div className="mt-2 space-y-3">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-amber-900">
                      <span>Domicilio gratis desde $35.000</span>
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

            <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <h3 className="text-base font-bold text-gray-900">Datos de entrega</h3>
              <div className="mt-3 space-y-2">
                <input
                  value={cliente}
                  onChange={(e) => setCliente(e.target.value)}
                  placeholder="Nombre completo"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none ring-cyan-200 focus:border-cyan-500 focus:ring-2"
                />
                <input
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  placeholder="Teléfono"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none ring-cyan-200 focus:border-cyan-500 focus:ring-2"
                />
                <input
                  value={direccion}
                  onChange={(e) => setDireccion(e.target.value)}
                  placeholder="Dirección"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none ring-cyan-200 focus:border-cyan-500 focus:ring-2"
                />
                <input
                  value={referencia}
                  onChange={(e) => setReferencia(e.target.value)}
                  placeholder="Referencia (opcional)"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none ring-cyan-200 focus:border-cyan-500 focus:ring-2"
                />
                <select
                  value={metodoPago}
                  onChange={(e) => setMetodoPago(e.target.value as MetodoPago)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none ring-cyan-200 focus:border-cyan-500 focus:ring-2"
                >
                  <option value="efectivo">Pago en efectivo</option>
                  <option value="transferencia">Transferencia</option>
                  <option value="datafono">Datáfono</option>
                </select>
                <button
                  type="button"
                  onClick={enviarPedido}
                  disabled={enviando}
                  className="w-full rounded-lg bg-cyan-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-cyan-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
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
              <section className="rounded-2xl border border-cyan-200 bg-cyan-50/50 p-4 shadow-sm">
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
            ) : null}
          </aside>
        </div>

        {recomendaciones.length > 0 ? (
          <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-gray-900">Recomendados para ti</h3>
                <p className="text-xs text-gray-500">Sugerencias inteligentes para mejorar tu pedido.</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {recomendaciones.map((prod) => {
                const img = primeraImagenProducto(prod);
                const vars = opcionesVariantesProducto(prod);
                const varKey = varianteSeleccionadaPorSku[prod.sku] ?? (vars[0]?.key ?? null);
                const varActiva = varKey ? vars.find((v) => v.key === varKey) : null;
                const precioRec = varActiva?.precio ?? prod.precioUnitario;
                return (
                  <article key={`rec-${prod.sku}`} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                    <div className="h-24 bg-slate-100">
                      {img ? (
                        <img src={img} alt={prod.descripcion} className="h-full w-full object-cover" />
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
      <button
        type="button"
        onClick={() => checkoutRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
        className="fixed bottom-5 left-4 z-40 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:bg-black active:scale-[0.98] lg:hidden"
      >
        Ver carrito ({totalItems}) · {formatoMoneda(total)}
      </button>
      <button
        type="button"
        onClick={() => setChatAbierto((v) => !v)}
        className="fixed bottom-5 right-5 z-40 rounded-full bg-cyan-700 px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:bg-cyan-800 active:scale-[0.98]"
      >
        {chatAbierto ? "Cerrar chat" : "Chat con el punto"}
      </button>
      {chatAbierto ? (
        <section className="fixed bottom-20 right-5 z-40 w-[340px] max-w-[calc(100vw-2rem)] rounded-2xl border border-cyan-200 bg-white shadow-2xl">
          <header className="rounded-t-2xl bg-cyan-700 px-4 py-3 text-white">
            <p className="text-sm font-bold">Chat de pedido</p>
            <p className="text-[11px] text-cyan-100">
              {pedidoCreadoId ? `Pedido ${pedidoCreadoId}` : "Primero confirma tu pedido para chatear"}
            </p>
          </header>
          <div ref={chatScrollRef} className="max-h-72 min-h-52 space-y-2 overflow-auto bg-slate-50 p-3">
            {!pedidoCreadoId ? (
              <p className="text-xs text-slate-500">Cuando confirmes el pedido, este chat quedará activo.</p>
            ) : chatCargando ? (
              <p className="text-xs text-slate-500">Cargando mensajes...</p>
            ) : chatMensajes.length === 0 ? (
              <p className="text-xs text-slate-500">Sin mensajes aún. Escribe para hablar con el punto POS.</p>
            ) : (
              chatMensajes.map((m) => {
                const esCliente = m.autor === "cliente";
                return (
                  <article
                    key={m.id}
                    className={`max-w-[85%] rounded-xl px-3 py-2 text-xs shadow-sm ${esCliente ? "ml-auto bg-cyan-600 text-white" : "bg-white text-slate-800"}`}
                  >
                    <p className={`font-semibold ${esCliente ? "text-cyan-50" : "text-slate-700"}`}>{m.autorLabel}</p>
                    <p className="mt-1 whitespace-pre-wrap">{m.texto}</p>
                    <p className={`mt-1 text-[10px] ${esCliente ? "text-cyan-100" : "text-slate-500"}`}>{formatoHora(m.creadoEnIso)}</p>
                  </article>
                );
              })
            )}
          </div>
          <div className="space-y-2 border-t border-gray-200 p-3">
            <textarea
              value={chatTexto}
              onChange={(e) => setChatTexto(e.target.value)}
              placeholder={pedidoCreadoId ? "Escribe tu mensaje..." : "Confirma el pedido para habilitar chat"}
              disabled={!pedidoCreadoId}
              rows={2}
              className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-xs outline-none ring-cyan-200 focus:border-cyan-500 focus:ring-2 disabled:cursor-not-allowed disabled:bg-gray-100"
            />
            <button
              type="button"
              onClick={enviarMensajeCliente}
              disabled={!pedidoCreadoId || chatEnviando || !chatTexto.trim()}
              className="w-full rounded-lg bg-cyan-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {chatEnviando ? "Enviando..." : "Enviar mensaje"}
            </button>
            {chatError ? <p className="text-xs text-rose-600">{chatError}</p> : null}
          </div>
        </section>
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
