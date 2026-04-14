import { buildPedidosSemillaDomicilios } from "@/lib/pos-domicilios-seed";
import type { DomicilioCrearPayload, EstadoDomicilio, PedidoDomicilio } from "@/types/pos-domicilios";

const STORAGE_PREFIX = "pos_mc_domicilios_v1:";

function keyPorPunto(puntoVenta: string): string {
  return `${STORAGE_PREFIX}${puntoVenta.trim().toLowerCase()}`;
}

function leerRaw(puntoVenta: string): PedidoDomicilio[] {
  if (typeof window === "undefined") return [];
  const pv = puntoVenta.trim();
  if (!pv) return [];
  try {
    const raw = localStorage.getItem(keyPorPunto(pv));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is PedidoDomicilio => Boolean(x && typeof x === "object" && typeof (x as PedidoDomicilio).id === "string")
    );
  } catch {
    return [];
  }
}

function escribir(puntoVenta: string, pedidos: PedidoDomicilio[]): void {
  if (typeof window === "undefined") return;
  const pv = puntoVenta.trim();
  if (!pv) return;
  try {
    localStorage.setItem(keyPorPunto(pv), JSON.stringify(pedidos));
  } catch {
    /* ignore quota */
  }
}

export function ensurePedidosDomiciliosLocal(puntoVenta: string): PedidoDomicilio[] {
  const pv = puntoVenta.trim();
  if (!pv) return [];
  const prev = leerRaw(pv);
  if (prev.length > 0) return prev;
  const seed = buildPedidosSemillaDomicilios(pv);
  escribir(pv, seed);
  return seed;
}

export function listarPedidosDomiciliosLocal(puntoVenta: string): PedidoDomicilio[] {
  return ensurePedidosDomiciliosLocal(puntoVenta);
}

export function reemplazarPedidosDomiciliosLocal(puntoVenta: string, pedidos: PedidoDomicilio[]): void {
  const pv = puntoVenta.trim();
  if (!pv) return;
  const normalizados = pedidos.map((p) => ({ ...p, puntoVenta: pv }));
  escribir(pv, normalizados);
}

export function moverEstadoPedidoDomicilioLocal(
  puntoVenta: string,
  pedidoId: string,
  estado: EstadoDomicilio,
  motivo?: string
): PedidoDomicilio | null {
  const pv = puntoVenta.trim();
  const id = pedidoId.trim();
  if (!pv || !id) return null;
  const pedidos = ensurePedidosDomiciliosLocal(pv);
  const idx = pedidos.findIndex((p) => p.id === id);
  if (idx < 0) return null;
  const next: PedidoDomicilio = { ...pedidos[idx], estado, puntoVenta: pv };
  if (estado === "RECHAZADO") {
    const m = (motivo ?? "").trim();
    next.rechazoMotivo = m || "Sin motivo especificado";
    next.rechazadoEnIso = new Date().toISOString();
  } else {
    delete next.rechazoMotivo;
    delete next.rechazadoEnIso;
  }
  const copia = [...pedidos];
  copia[idx] = next;
  escribir(pv, copia);
  return next;
}

function generarIdPedidoDomicilio(): string {
  const sufijo = String(Math.floor(Math.random() * 9000) + 1000);
  return `DOM-${sufijo}`;
}

export function crearPedidoDomicilioLocal(payload: DomicilioCrearPayload): PedidoDomicilio | null {
  const pv = payload.puntoVenta.trim();
  if (!pv) return null;
  const cliente = payload.cliente.trim();
  const telefono = payload.telefono.trim();
  const direccion = payload.direccion.trim();
  if (!cliente || !telefono || !direccion || !Number.isFinite(payload.total) || payload.total <= 0) return null;
  const items = payload.items.map((x) => x.trim()).filter(Boolean);
  if (items.length === 0) return null;
  const pedidos = ensurePedidosDomiciliosLocal(pv);
  let id = generarIdPedidoDomicilio();
  const usados = new Set(pedidos.map((p) => p.id));
  while (usados.has(id)) id = generarIdPedidoDomicilio();
  const pedido: PedidoDomicilio = {
    id,
    puntoVenta: pv,
    cliente,
    telefono,
    direccion,
    referencia: payload.referencia?.trim() || undefined,
    total: Math.round(payload.total),
    metodoPago: payload.metodoPago,
    canal: payload.canal,
    estado: "NUEVO",
    creadoEnIso: new Date().toISOString(),
    items,
    tiempoObjetivoMin:
      payload.tiempoObjetivoMin && Number.isFinite(payload.tiempoObjetivoMin)
        ? Math.max(10, Math.round(payload.tiempoObjetivoMin))
        : 35,
  };
  const next = [pedido, ...pedidos];
  escribir(pv, next);
  return pedido;
}
