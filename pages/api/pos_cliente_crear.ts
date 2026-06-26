import type { NextApiRequest, NextApiResponse } from "next";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getFirebaseAdminApp, getCreadorFirestoreContext } from "@/lib/firebase-admin-server";
import {
  aplicarBienvenidaClubMillasACliente,
  emailValidoClientePos,
  type ClientePosFirestoreLike,
} from "@/lib/pos-cliente-club-millas-bienvenida";

type CreateClienteOk = {
  ok: true;
  id: string;
  bienvenidaCorreoEnviado?: boolean;
  bienvenidaCorreoError?: string;
  clubMillasWmsSincronizado?: boolean;
  clubMillasWmsError?: string;
};
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
  const cajeroTurnoId = str(b.cajeroTurnoId).slice(0, 120);
  const cajeroNombre = str(b.cajeroNombre).slice(0, 200);
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

  const payloadCliente: Record<string, unknown> = {
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
    ...(cajeroTurnoId ? { cajeroTurnoId } : {}),
    ...(cajeroNombre ? { cajeroNombre } : {}),
    ...(datosComplementarios ? { datosComplementarios } : {}),
  };

  try {
    const db = getFirestore(app);
    const ref = await db.collection("posClientes").add({
      ...payloadCliente,
      createdByUid: ctx.uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    let bienvenidaCorreoEnviado = false;
    let bienvenidaCorreoError: string | undefined;
    let clubMillasWmsSincronizado = false;
    let clubMillasWmsError: string | undefined;

    if (emailValidoClientePos(email)) {
      const clienteData = { ...payloadCliente, email } as ClientePosFirestoreLike;
      const bienvenida = await aplicarBienvenidaClubMillasACliente(ref, clienteData);
      if (bienvenida.ok) {
        bienvenidaCorreoEnviado = bienvenida.correoEnviado;
        clubMillasWmsSincronizado = bienvenida.wmsSincronizado;
        bienvenidaCorreoError = bienvenida.correoError;
        clubMillasWmsError = bienvenida.wmsError;
      } else {
        bienvenidaCorreoError = bienvenida.error;
        console.warn("[pos_cliente_crear] club millas bienvenida:", bienvenida.error);
      }
    }

    return res.status(200).json({
      ok: true,
      id: ref.id,
      ...(bienvenidaCorreoEnviado ? { bienvenidaCorreoEnviado: true } : {}),
      ...(bienvenidaCorreoError ? { bienvenidaCorreoError } : {}),
      ...(clubMillasWmsSincronizado ? { clubMillasWmsSincronizado: true } : {}),
      ...(clubMillasWmsError ? { clubMillasWmsError } : {}),
    });
  } catch (e) {
    return res.status(500).json({ ok: false, message: e instanceof Error ? e.message : "No se pudo crear el cliente." });
  }
}
