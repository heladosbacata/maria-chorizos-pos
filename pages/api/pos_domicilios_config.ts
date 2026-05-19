import type { NextApiRequest, NextApiResponse } from "next";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getFirebaseAdminApp } from "@/lib/firebase-admin-server";
import { getDomicilioTarifaConfig, setDomicilioTarifaConfig } from "@/lib/pos-domicilios-config-store";

type GetOk = {
  ok: true;
  costoDomicilioCop: number;
  umbralGratisCop: number;
};

type Err = { ok: false; message: string };

function normPv(puntoVenta: string): string {
  return puntoVenta.trim().toLowerCase();
}

async function leerPuntoVentaUsuario(app: NonNullable<ReturnType<typeof getFirebaseAdminApp>>, uid: string): Promise<string | null> {
  const db = getFirestore(app);
  const snap = await db.collection("users").doc(uid).get();
  const raw = snap.data()?.puntoVenta;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<GetOk | Err>) {
  const app = getFirebaseAdminApp();
  if (!app) {
    if (req.method === "GET") {
      const pv = typeof req.query.puntoVenta === "string" ? req.query.puntoVenta : Array.isArray(req.query.puntoVenta) ? req.query.puntoVenta[0] : "";
      const cfg = await getDomicilioTarifaConfig(pv ?? "");
      return res.status(200).json({ ok: true, ...cfg });
    }
    return res.status(503).json({
      ok: false,
      message: "Firebase Admin no está configurado: no se puede guardar la tarifa de domicilios en el servidor.",
    });
  }

  if (req.method === "GET") {
    const pv = typeof req.query.puntoVenta === "string" ? req.query.puntoVenta : Array.isArray(req.query.puntoVenta) ? req.query.puntoVenta[0] : "";
    const cfg = await getDomicilioTarifaConfig(pv ?? "");
    res.setHeader("Cache-Control", "public, max-age=15, stale-while-revalidate=30");
    return res.status(200).json({ ok: true, ...cfg });
  }

  if (req.method !== "PUT" && req.method !== "POST") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) {
    return res.status(401).json({ ok: false, message: "Falta Authorization Bearer (sesión del cajero)." });
  }

  let uid: string;
  try {
    const decoded = await getAuth(app).verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return res.status(401).json({ ok: false, message: "Sesión inválida o token expirado." });
  }

  const body = (typeof req.body === "object" && req.body !== null ? req.body : {}) as Record<string, unknown>;
  const puntoVenta = typeof body.puntoVenta === "string" ? body.puntoVenta.trim() : "";
  const costoRaw = body.costoDomicilioCop;
  const costo =
    typeof costoRaw === "number" && Number.isFinite(costoRaw)
      ? Math.round(costoRaw)
      : typeof costoRaw === "string"
        ? Math.round(Number(costoRaw.replace(/\D/g, "")) || NaN)
        : NaN;

  if (!puntoVenta) {
    return res.status(400).json({ ok: false, message: "puntoVenta es obligatorio en el cuerpo JSON." });
  }
  if (!Number.isFinite(costo)) {
    return res.status(400).json({ ok: false, message: "costoDomicilioCop inválido." });
  }

  const pvUsuario = await leerPuntoVentaUsuario(app, uid);
  if (!pvUsuario) {
    return res.status(403).json({ ok: false, message: "Tu usuario no tiene punto de venta asignado en Firestore." });
  }
  if (normPv(pvUsuario) !== normPv(puntoVenta)) {
    return res.status(403).json({ ok: false, message: "No podés editar la tarifa de otro punto de venta." });
  }

  const umbralBody = body.umbralGratisCop;
  const umbralParsed =
    typeof umbralBody === "number" && Number.isFinite(umbralBody)
      ? Math.round(umbralBody)
      : typeof umbralBody === "string"
        ? Math.round(Number(String(umbralBody).replace(/\D/g, "")) || NaN)
        : undefined;

  const result = await setDomicilioTarifaConfig({
    puntoVenta,
    costoDomicilioCop: costo,
    ...(Number.isFinite(umbralParsed) ? { umbralGratisCop: umbralParsed } : {}),
  });
  if (!result.ok) {
    return res.status(400).json({ ok: false, message: result.message ?? "No se pudo guardar." });
  }

  const cfg = await getDomicilioTarifaConfig(puntoVenta);
  return res.status(200).json({ ok: true, ...cfg });
}
