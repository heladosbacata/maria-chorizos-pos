import { pedidoIdChatClave, puntoVentaFirestoreClave } from "@/lib/pos-domicilios-pv-clave";
import type { EstadoDomicilio, MetodoPagoDomicilio, TipoEntregaDomicilio } from "@/types/pos-domicilios";

const STORAGE_PREFIX = "pos_mc_pedidos_sesion_v1:";
const PREF_CLIENTE_PREFIX = "pos_mc_pedidos_cliente_pref_v1:";

export type ResumenSesionPedidoCliente = {
  lineasItems: string[];
  total: number;
  metodoPago: MetodoPagoDomicilio;
  direccion: string;
  referencia?: string;
  tipoEntrega: TipoEntregaDomicilio;
  puntoVenta: string;
};

export type SesionPedidoDomicilioCliente = {
  pedidoId: string;
  puntoVenta: string;
  cliente: string;
  telefono: string;
  creadoEnIso?: string;
  resumen?: ResumenSesionPedidoCliente;
  guardadoEnIso: string;
};

export type ClientePreferidoPedidos = {
  nombre: string;
  telefono: string;
};

const ESTADOS_TERMINALES: readonly EstadoDomicilio[] = ["ENTREGADO", "CANCELADO", "RECHAZADO"];

export function esEstadoTerminalPedidoDomicilio(estado: EstadoDomicilio | null | undefined): boolean {
  if (!estado) return false;
  return (ESTADOS_TERMINALES as readonly string[]).includes(estado);
}

export function telefonoDomicilioNorm(telefono: string): string {
  const d = String(telefono ?? "").replace(/\D/g, "");
  if (!d) return "";
  if (d.length > 10) return d.slice(-10);
  return d;
}

function keySesion(puntoVenta: string): string {
  return `${STORAGE_PREFIX}${puntoVentaFirestoreClave(puntoVenta)}`;
}

function keyClientePref(puntoVenta: string): string {
  return `${PREF_CLIENTE_PREFIX}${puntoVentaFirestoreClave(puntoVenta)}`;
}

export function leerSesionPedidoDomicilio(puntoVenta: string): SesionPedidoDomicilioCliente | null {
  if (typeof window === "undefined") return null;
  const pv = puntoVenta.trim();
  if (!pv) return null;
  try {
    const raw = localStorage.getItem(keySesion(pv));
    if (!raw) return null;
    const j = JSON.parse(raw) as Partial<SesionPedidoDomicilioCliente>;
    const pedidoId = pedidoIdChatClave(typeof j.pedidoId === "string" ? j.pedidoId : "");
    if (!pedidoId) return null;
    return {
      pedidoId,
      puntoVenta: typeof j.puntoVenta === "string" && j.puntoVenta.trim() ? j.puntoVenta.trim() : pv,
      cliente: typeof j.cliente === "string" ? j.cliente : "",
      telefono: typeof j.telefono === "string" ? j.telefono : "",
      creadoEnIso: typeof j.creadoEnIso === "string" ? j.creadoEnIso : undefined,
      resumen: j.resumen && typeof j.resumen === "object" ? (j.resumen as ResumenSesionPedidoCliente) : undefined,
      guardadoEnIso: typeof j.guardadoEnIso === "string" ? j.guardadoEnIso : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function guardarSesionPedidoDomicilio(sesion: Omit<SesionPedidoDomicilioCliente, "guardadoEnIso">): void {
  if (typeof window === "undefined") return;
  const pv = sesion.puntoVenta.trim();
  const pedidoId = pedidoIdChatClave(sesion.pedidoId);
  if (!pv || !pedidoId) return;
  const payload: SesionPedidoDomicilioCliente = {
    ...sesion,
    pedidoId,
    puntoVenta: pv,
    telefono: telefonoDomicilioNorm(sesion.telefono) || sesion.telefono,
    guardadoEnIso: new Date().toISOString(),
  };
  try {
    localStorage.setItem(keySesion(pv), JSON.stringify(payload));
  } catch {
    /* quota */
  }
}

export function limpiarSesionPedidoDomicilio(puntoVenta: string): void {
  if (typeof window === "undefined") return;
  const pv = puntoVenta.trim();
  if (!pv) return;
  try {
    localStorage.removeItem(keySesion(pv));
  } catch {
    /* ignore */
  }
}

export function leerClientePreferidoPedidos(puntoVenta: string): ClientePreferidoPedidos | null {
  if (typeof window === "undefined") return null;
  const pv = puntoVenta.trim();
  if (!pv) return null;
  try {
    const raw = localStorage.getItem(keyClientePref(pv));
    if (!raw) return null;
    const j = JSON.parse(raw) as Partial<ClientePreferidoPedidos>;
    const nombre = typeof j.nombre === "string" ? j.nombre.trim() : "";
    const telefono = telefonoDomicilioNorm(typeof j.telefono === "string" ? j.telefono : "");
    if (!nombre && !telefono) return null;
    return { nombre, telefono };
  } catch {
    return null;
  }
}

export function guardarClientePreferidoPedidos(puntoVenta: string, datos: ClientePreferidoPedidos): void {
  if (typeof window === "undefined") return;
  const pv = puntoVenta.trim();
  if (!pv) return;
  const payload: ClientePreferidoPedidos = {
    nombre: datos.nombre.trim(),
    telefono: telefonoDomicilioNorm(datos.telefono),
  };
  if (!payload.nombre && !payload.telefono) return;
  try {
    localStorage.setItem(keyClientePref(pv), JSON.stringify(payload));
  } catch {
    /* quota */
  }
}

/** Arma resumen de chat desde un pedido persistido (Firestore/API). */
export function resumenDesdePedidoApi(p: {
  items?: string[];
  total?: number;
  metodoPago?: string;
  direccion?: string;
  referencia?: string;
  puntoVenta: string;
}): ResumenSesionPedidoCliente {
  const items = Array.isArray(p.items) ? p.items.filter((x) => typeof x === "string") : [];
  const metodoPago: MetodoPagoDomicilio =
    p.metodoPago === "transferencia" || p.metodoPago === "datafono" || p.metodoPago === "efectivo"
      ? p.metodoPago
      : "efectivo";
  const direccion = typeof p.direccion === "string" ? p.direccion : "";
  const tipoEntrega: TipoEntregaDomicilio = direccion.toLowerCase().startsWith("recoger en tienda")
    ? "recogida"
    : "domicilio";
  return {
    lineasItems: items,
    total: typeof p.total === "number" && Number.isFinite(p.total) ? Math.round(p.total) : 0,
    metodoPago,
    direccion,
    referencia: typeof p.referencia === "string" && p.referencia.trim() ? p.referencia.trim() : undefined,
    tipoEntrega,
    puntoVenta: p.puntoVenta.trim(),
  };
}
