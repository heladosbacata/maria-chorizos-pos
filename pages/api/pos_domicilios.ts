import type { NextApiRequest, NextApiResponse } from "next";
import { crearPedidoDomicilioPersistente, listarPedidosDomiciliosPersistente } from "@/lib/pos-domicilios-firestore-store";
import type {
  DomicilioCrearPayload,
  DomicilioCrearResponse,
  DomiciliosListadoResponse,
} from "@/types/pos-domicilios";

function normalizarPv(input: string | string[] | undefined): string {
  return (Array.isArray(input) ? input[0] : input ?? "").trim();
}

function asBody(body: unknown): DomicilioCrearPayload {
  if (body && typeof body === "object") {
    const o = body as Record<string, unknown>;
    return {
      puntoVenta: typeof o.puntoVenta === "string" ? o.puntoVenta : "",
      cliente: typeof o.cliente === "string" ? o.cliente : "",
      telefono: typeof o.telefono === "string" ? o.telefono : "",
      direccion: typeof o.direccion === "string" ? o.direccion : "",
      referencia: typeof o.referencia === "string" ? o.referencia : undefined,
      total: typeof o.total === "number" ? o.total : 0,
      metodoPago:
        o.metodoPago === "efectivo" || o.metodoPago === "transferencia" || o.metodoPago === "datafono"
          ? o.metodoPago
          : "efectivo",
      canal: o.canal === "web" || o.canal === "whatsapp" || o.canal === "qr" ? o.canal : "web",
      items: Array.isArray(o.items) ? o.items.filter((x): x is string => typeof x === "string") : [],
      tiempoObjetivoMin: typeof o.tiempoObjetivoMin === "number" ? o.tiempoObjetivoMin : undefined,
    };
  }
  return {
    puntoVenta: "",
    cliente: "",
    telefono: "",
    direccion: "",
    total: 0,
    metodoPago: "efectivo",
    canal: "web",
    items: [],
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<DomiciliosListadoResponse | DomicilioCrearResponse>
) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }
  if (req.method === "GET") {
    const puntoVenta = normalizarPv(req.query.puntoVenta);
    if (!puntoVenta) {
      return res.status(400).json({ ok: false, data: [], message: "puntoVenta es obligatorio." });
    }
    const data = await listarPedidosDomiciliosPersistente(puntoVenta);
    return res.status(200).json({ ok: true, data });
  }
  const payload = asBody(req.body);
  const pedido = await crearPedidoDomicilioPersistente(payload);
  if (!pedido) {
    return res.status(400).json({ ok: false, message: "Datos inválidos para crear pedido." });
  }
  return res.status(200).json({ ok: true, pedido, message: "Pedido creado." });
}
