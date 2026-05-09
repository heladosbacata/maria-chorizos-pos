import type { NextApiRequest, NextApiResponse } from "next";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getFirebaseAdminApp, getCreadorFirestoreContext } from "@/lib/firebase-admin-server";

type CreateClienteOk = { ok: true; id: string };
type CreateClienteErr = { ok: false; message: string };

function str(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
}

function sanitizeComplementarios(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const kk = str(k).slice(0, 60);
    const vv = str(v).slice(0, 300);
    if (kk && vv) out[kk] = vv;
  }
  return Object.keys(out).length ? out : undefined;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<CreateClienteOk | CreateClienteErr>) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  const app = getFirebaseAdminApp();
  if (!app) {
    return res.status(503).json({
      ok: false,
      message:
        "FIREBASE_SERVICE_ACCOUNT_JSON no está configurada en el servidor. El POS intentará guardar desde el navegador.",
    });
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) {
    return res.status(401).json({ ok: false, message: "Falta Authorization Bearer." });
  }

  const ctx = await getCreadorFirestoreContext(app, token);
  if (!ctx.ok) {
    return res.status(401).json({ ok: false, message: ctx.message });
  }
  if (!ctx.puntoVenta) {
    return res.status(400).json({
      ok: false,
      message: "Tu perfil no tiene punto de venta. Configúralo antes de crear clientes.",
    });
  }

  const b = req.body as Record<string, unknown>;
  const puntoVenta = str(b.puntoVenta);
  if (!puntoVenta) {
    return res.status(400).json({ ok: false, message: "Falta punto de venta." });
  }
  if (puntoVenta !== ctx.puntoVenta) {
    return res.status(403).json({
      ok: false,
      message: "El punto de venta enviado no coincide con tu perfil. Recarga la página o revisa tu usuario.",
    });
  }

  const tipoCliente = str(b.tipoCliente) === "empresa" ? "empresa" : "persona";
  const tipoIdentificacion = str(b.tipoIdentificacion);
  const numeroIdentificacion = str(b.numeroIdentificacion);
  const digitoVerificacion = str(b.digitoVerificacion);
  const nombres = str(b.nombres);
  const apellidos = str(b.apellidos);
  const razonSocial = str(b.razonSocial);
  const email = str(b.email).toLowerCase();
  const indicativoTelefono = str(b.indicativoTelefono);
  const telefono = str(b.telefono);
  const datosComplementarios = sanitizeComplementarios(b.datosComplementarios);

  if (!tipoIdentificacion) {
    return res.status(400).json({ ok: false, message: "Indica el tipo de identificación." });
  }
  if (!numeroIdentificacion) {
    return res.status(400).json({ ok: false, message: "Indica el número de identificación." });
  }
  if (tipoCliente === "empresa") {
    if (!razonSocial) return res.status(400).json({ ok: false, message: "Indica la razón social." });
  } else if (!nombres && !apellidos) {
    return res.status(400).json({ ok: false, message: "Indica nombres o apellidos." });
  }

  try {
    const db = getFirestore(app);
    const ref = await db.collection("posClientes").add({
      puntoVenta,
      tipoCliente,
      tipoIdentificacion,
      numeroIdentificacion,
      ...(digitoVerificacion ? { digitoVerificacion } : {}),
      ...(nombres ? { nombres } : {}),
      ...(apellidos ? { apellidos } : {}),
      ...(razonSocial ? { razonSocial } : {}),
      ...(email ? { email } : {}),
      ...(indicativoTelefono ? { indicativoTelefono } : {}),
      ...(telefono ? { telefono } : {}),
      ...(datosComplementarios ? { datosComplementarios } : {}),
      createdByUid: ctx.uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return res.status(200).json({ ok: true, id: ref.id });
  } catch (e) {
    return res.status(500).json({ ok: false, message: e instanceof Error ? e.message : "No se pudo crear el cliente." });
  }
}
