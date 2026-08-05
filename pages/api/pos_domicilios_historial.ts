import type { NextApiRequest, NextApiResponse } from "next";
import { listarPedidosDomiciliosPorTelefono } from "@/lib/pos-domicilios-firestore-store";
import { telefonoDomicilioNorm } from "@/lib/pos-domicilios-pedido-sesion";
import type { PedidoDomicilio } from "@/types/pos-domicilios";

type Ok = { ok: true; data: PedidoDomicilio[] };
type Err = { ok: false; data: PedidoDomicilio[]; message: string };

const rateMap = new Map<string, { n: number; resetAt: number }>();

function rateOk(key: string, max = 20, windowMs = 60_000): boolean {
  const now = Date.now();
  const cur = rateMap.get(key);
  if (!cur || now > cur.resetAt) {
    rateMap.set(key, { n: 1, resetAt: now + windowMs });
    return true;
  }
  if (cur.n >= max) return false;
  cur.n += 1;
  return true;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<Ok | Err>) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, data: [], message: "Method not allowed" });
  }
  const pv =
    typeof req.query.puntoVenta === "string"
      ? req.query.puntoVenta
      : Array.isArray(req.query.puntoVenta)
        ? req.query.puntoVenta[0]
        : "";
  const telRaw =
    typeof req.query.telefono === "string"
      ? req.query.telefono
      : Array.isArray(req.query.telefono)
        ? req.query.telefono[0]
        : "";
  const puntoVenta = (pv ?? "").trim();
  const telefono = telefonoDomicilioNorm(telRaw ?? "");
  if (!puntoVenta) {
    return res.status(400).json({ ok: false, data: [], message: "puntoVenta es obligatorio." });
  }
  if (telefono.length < 7) {
    return res.status(400).json({ ok: false, data: [], message: "Indicá un teléfono válido (mín. 7 dígitos)." });
  }
  const ip =
    (typeof req.headers["x-forwarded-for"] === "string"
      ? req.headers["x-forwarded-for"].split(",")[0]?.trim()
      : "") || req.socket.remoteAddress || "anon";
  if (!rateOk(`${ip}:${puntoVenta}:${telefono}`)) {
    return res.status(429).json({ ok: false, data: [], message: "Demasiadas consultas. Esperá un momento." });
  }
  const data = await listarPedidosDomiciliosPorTelefono(puntoVenta, telefono, 20);
  res.setHeader("Cache-Control", "private, no-store");
  return res.status(200).json({ ok: true, data });
}
