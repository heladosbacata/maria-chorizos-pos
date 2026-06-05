import type { NextApiRequest, NextApiResponse } from "next";
import { crearPedidoDomicilioPersistente, listarPedidosDomiciliosPersistente } from "@/lib/pos-domicilios-firestore-store";
import { getDomicilioTarifaConfig } from "@/lib/pos-domicilios-config-store";
import { estaEnHorarioDomiciliosConfig, textoHorarioDomiciliosCliente } from "@/lib/pos-domicilios-horario";
import type {
  DomicilioCrearPayload,
  DomicilioCrearResponse,
  DomiciliosListadoResponse,
} from "@/types/pos-domicilios";

function normalizarPv(input: string | string[] | undefined): string {
  return (Array.isArray(input) ? input[0] : input ?? "").trim();
}

function totalDesdeBody(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  if (typeof v === "string" && v.trim()) {
    const normalizado = v.trim().replace(/\s/g, "").replace(",", ".");
    const n = Number(normalizado);
    if (Number.isFinite(n)) return Math.round(n);
    const soloDigitos = Number(v.replace(/\D/g, ""));
    if (Number.isFinite(soloDigitos)) return Math.round(soloDigitos);
  }
  return 0;
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
      total: totalDesdeBody(o.total),
      metodoPago:
        o.metodoPago === "efectivo" || o.metodoPago === "transferencia" || o.metodoPago === "datafono"
          ? o.metodoPago
          : "efectivo",
      canal: o.canal === "web" || o.canal === "whatsapp" || o.canal === "qr" ? o.canal : "web",
      tipoEntrega: o.tipoEntrega === "recogida" || o.tipoEntrega === "domicilio" ? o.tipoEntrega : undefined,
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
  try {
    const payload = asBody(req.body);
    const cfg = await getDomicilioTarifaConfig(payload.puntoVenta);
    if (!cfg.domiciliosHabilitados) {
      return res.status(400).json({
        ok: false,
        message:
          "En este momento el punto no está recibiendo pedidos por domicilio. Volvé a intentar más tarde o contactá directamente al local.",
      });
    }
    if (!estaEnHorarioDomiciliosConfig(cfg)) {
      return res.status(400).json({
        ok: false,
        message: `Estamos fuera del horario de domicilios. ${textoHorarioDomiciliosCliente(cfg)}`,
      });
    }
    const tipoEntrega =
      payload.tipoEntrega ??
      (payload.direccion.trim().toLowerCase().startsWith("recoger en tienda") ? "recogida" : "domicilio");
    if (tipoEntrega === "recogida" && !cfg.recogerEnTiendaHabilitado) {
      return res.status(400).json({
        ok: false,
        message: "En este momento solo aceptamos pedidos con envío a domicilio. Elegí esa opción o contactá al local.",
      });
    }
    if (tipoEntrega === "domicilio" && !cfg.domicilioConDomiciliarioHabilitado) {
      return res.status(400).json({
        ok: false,
        message: "En este momento solo aceptamos pedidos para recoger en tienda. Elegí esa opción o contactá al local.",
      });
    }
    const pedido = await crearPedidoDomicilioPersistente(payload);
    if (!pedido) {
      return res.status(400).json({ ok: false, message: "Datos inválidos para crear pedido." });
    }
    return res.status(200).json({ ok: true, pedido, message: "Pedido creado." });
  } catch (e) {
    console.error("[pos_domicilios] POST error", e);
    return res.status(500).json({
      ok: false,
      message: "Error interno al guardar el pedido. Intentá de nuevo o contactá al local.",
    });
  }
}
