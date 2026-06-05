import {
  crearPedidoDomicilioLocal,
  ensurePedidosDomiciliosLocal,
  eliminarPedidoDomicilioLocal,
  eliminarPedidosRechazadosLocal,
  listarPedidosDomiciliosLocal,
  moverEstadoPedidoDomicilioLocal,
  reemplazarPedidosDomiciliosLocal,
} from "@/lib/pos-domicilios-local-storage";
import type {
  DomicilioCambioEstadoPayload,
  DomicilioCambioEstadoResponse,
  DomicilioCrearPayload,
  DomicilioCrearResponse,
  DomicilioEliminarRechazadoPayload,
  DomicilioEliminarRechazadoResponse,
  DomiciliosListadoResponse,
  PedidoDomicilio,
} from "@/types/pos-domicilios";

async function parseJsonSafe(res: Response): Promise<unknown> {
  return res.json().catch(() => ({}));
}

export async function domiciliosListar(puntoVenta: string): Promise<DomiciliosListadoResponse> {
  const pv = puntoVenta.trim();
  if (!pv) return { ok: false, data: [], message: "Punto de venta requerido." };
  ensurePedidosDomiciliosLocal(pv);
  try {
    const url = `/api/pos_domicilios?${new URLSearchParams({ puntoVenta: pv }).toString()}`;
    const res = await fetch(url, { method: "GET" });
    const json = await parseJsonSafe(res);
    if (!res.ok) throw new Error("No fue posible cargar domicilios.");
    const data =
      json && typeof json === "object" && "data" in json && Array.isArray((json as { data: unknown }).data)
        ? ((json as { data: PedidoDomicilio[] }).data ?? [])
        : [];
    reemplazarPedidosDomiciliosLocal(pv, data);
    return { ok: true, data };
  } catch {
    return { ok: true, data: listarPedidosDomiciliosLocal(pv), message: "Mostrando datos locales (sin conexión API)." };
  }
}

export async function domicilioCambiarEstado(payload: DomicilioCambioEstadoPayload): Promise<DomicilioCambioEstadoResponse> {
  const pv = payload.puntoVenta.trim();
  if (!pv || !payload.pedidoId.trim()) {
    return { ok: false, message: "Datos incompletos para actualizar pedido." };
  }
  try {
    const res = await fetch("/api/pos_domicilios_estado", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, puntoVenta: pv }),
    });
    const json = await parseJsonSafe(res);
    const ok =
      res.ok &&
      Boolean(!(json && typeof json === "object" && "ok" in json) || (json as { ok?: boolean }).ok !== false);
    if (!ok) throw new Error("No se pudo actualizar estado");
    const pedido =
      json && typeof json === "object" && "pedido" in json ? ((json as { pedido?: PedidoDomicilio }).pedido ?? undefined) : undefined;
    if (pedido) moverEstadoPedidoDomicilioLocal(pv, pedido.id, pedido.estado, payload.motivo);
    return {
      ok: true,
      pedido,
      message: json && typeof json === "object" && typeof (json as { message?: unknown }).message === "string"
        ? (json as { message: string }).message
        : undefined,
    };
  } catch {
    const pedido = moverEstadoPedidoDomicilioLocal(pv, payload.pedidoId, payload.estado, payload.motivo);
    if (!pedido) return { ok: false, message: "No fue posible actualizar el pedido en local." };
    return { ok: true, pedido, message: "Estado guardado en local (sin conexión API)." };
  }
}

export async function domicilioCancelarCliente(params: {
  puntoVenta: string;
  pedidoId: string;
  motivo?: string;
}): Promise<DomicilioCambioEstadoResponse> {
  const pv = params.puntoVenta.trim();
  const pedidoId = params.pedidoId.trim();
  if (!pv || !pedidoId) {
    return { ok: false, message: "Datos incompletos para cancelar el pedido." };
  }
  try {
    const res = await fetch("/api/pos_domicilios_cancelar_cliente", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ puntoVenta: pv, pedidoId, motivo: params.motivo }),
    });
    const json = await parseJsonSafe(res);
    const ok =
      res.ok &&
      Boolean(!(json && typeof json === "object" && "ok" in json) || (json as { ok?: boolean }).ok !== false);
    if (!ok) {
      const msg =
        json && typeof json === "object" && typeof (json as { message?: unknown }).message === "string"
          ? (json as { message: string }).message
          : "No se pudo cancelar el pedido.";
      return { ok: false, message: msg };
    }
    const pedido =
      json && typeof json === "object" && "pedido" in json
        ? ((json as { pedido?: PedidoDomicilio }).pedido ?? undefined)
        : undefined;
    if (pedido) moverEstadoPedidoDomicilioLocal(pv, pedido.id, pedido.estado, params.motivo);
    return {
      ok: true,
      pedido,
      message:
        json && typeof json === "object" && typeof (json as { message?: unknown }).message === "string"
          ? (json as { message: string }).message
          : "Pedido cancelado.",
    };
  } catch {
    return { ok: false, message: "No fue posible cancelar el pedido. Revisá tu conexión." };
  }
}

export async function domicilioCrear(payload: DomicilioCrearPayload): Promise<DomicilioCrearResponse> {
  const pv = payload.puntoVenta.trim();
  if (!pv) return { ok: false, message: "Punto de venta requerido." };
  ensurePedidosDomiciliosLocal(pv);
  try {
    const res = await fetch("/api/pos_domicilios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, puntoVenta: pv }),
    });
    const json = await parseJsonSafe(res);
    const ok =
      res.ok &&
      Boolean(!(json && typeof json === "object" && "ok" in json) || (json as { ok?: boolean }).ok !== false);
    if (!ok) throw new Error("No se pudo crear pedido");
    const pedido =
      json && typeof json === "object" && "pedido" in json ? ((json as { pedido?: PedidoDomicilio }).pedido ?? undefined) : undefined;
    if (pedido) {
      const next = [pedido, ...listarPedidosDomiciliosLocal(pv).filter((p) => p.id !== pedido.id)];
      reemplazarPedidosDomiciliosLocal(pv, next);
    }
    return {
      ok: true,
      pedido,
      message:
        json && typeof json === "object" && typeof (json as { message?: unknown }).message === "string"
          ? (json as { message: string }).message
          : undefined,
    };
  } catch {
    const pedido = crearPedidoDomicilioLocal(payload);
    if (!pedido) return { ok: false, message: "Datos inválidos para crear el pedido." };
    return { ok: true, pedido, message: "Pedido creado en local (sin conexión API)." };
  }
}

export async function domicilioEliminarRechazado(
  payload: DomicilioEliminarRechazadoPayload,
  token: string
): Promise<DomicilioEliminarRechazadoResponse> {
  const pv = payload.puntoVenta.trim();
  if (!pv) return { ok: false, message: "Punto de venta requerido." };
  const limpiarTodos = payload.limpiarTodosRechazados === true;
  const pedidoId = payload.pedidoId?.trim() ?? "";
  if (!limpiarTodos && !pedidoId) {
    return { ok: false, message: "Indicá el pedido o limpiar todo el historial." };
  }
  try {
    const res = await fetch("/api/pos_domicilios_eliminar", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        puntoVenta: pv,
        pedidoId: limpiarTodos ? undefined : pedidoId,
        limpiarTodosRechazados: limpiarTodos,
        claveEspacioFranquiciados: payload.claveEspacioFranquiciados,
      }),
    });
    const json = (await parseJsonSafe(res)) as DomicilioEliminarRechazadoResponse & { eliminados?: number };
    if (!res.ok || !json.ok) {
      return { ok: false, message: json.message ?? "No se pudo eliminar el pedido rechazado." };
    }
    if (limpiarTodos) {
      eliminarPedidosRechazadosLocal(pv);
    } else {
      eliminarPedidoDomicilioLocal(pv, pedidoId);
    }
    return {
      ok: true,
      eliminados: json.eliminados,
      message: json.message,
    };
  } catch {
    if (limpiarTodos) {
      const n = eliminarPedidosRechazadosLocal(pv);
      if (n === 0) return { ok: false, message: "No hay pedidos rechazados en local." };
      return { ok: true, eliminados: n, message: `Eliminados ${n} pedido(s) en local (sin conexión API).` };
    }
    const ok = eliminarPedidoDomicilioLocal(pv, pedidoId);
    if (!ok) return { ok: false, message: "No se encontró el pedido en local." };
    return { ok: true, eliminados: 1, message: "Pedido eliminado en local (sin conexión API)." };
  }
}
