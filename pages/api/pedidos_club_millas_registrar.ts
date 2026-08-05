import type { NextApiRequest, NextApiResponse } from "next";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getFirebaseAdminApp } from "@/lib/firebase-admin-server";
import {
  aplicarBienvenidaClubMillasACliente,
  emailValidoClientePos,
  resolverPinClubMillas,
  sincronizarPinClienteEnWms,
  type ClientePosFirestoreLike,
} from "@/lib/pos-cliente-club-millas-bienvenida";
import { enviarBienvenidaClienteClubMillasPorCorreo } from "@/lib/email-bienvenida-cliente-club-millas";

type Ok = {
  ok: true;
  registrado: true;
  message: string;
  clientePlanMillas?: {
    documento: string;
    nombre?: string;
    socioId?: string;
  };
  bienvenidaCorreoEnviado?: boolean;
};
type Err = { ok: false; message: string };

function str(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
}

function normalizarDocumento(raw: string): string {
  return raw.replace(/\s/g, "").replace(/[.\-]/g, "").trim();
}

function partirNombreCompleto(nombre: string): { nombres: string; apellidos: string } {
  const parts = nombre.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { nombres: "", apellidos: "" };
  if (parts.length === 1) return { nombres: parts[0]!, apellidos: "Cliente" };
  return { nombres: parts[0]!, apellidos: parts.slice(1).join(" ") };
}

/** Rate limit simple en memoria (por IP) para alta pública. */
const rateHits = new Map<string, { n: number; resetAt: number }>();

function permitirPorIp(ip: string, max = 10, ventanaMs = 15 * 60 * 1000): boolean {
  const key = ip || "unknown";
  const now = Date.now();
  const cur = rateHits.get(key);
  if (!cur || now > cur.resetAt) {
    rateHits.set(key, { n: 1, resetAt: now + ventanaMs });
    return true;
  }
  if (cur.n >= max) return false;
  cur.n += 1;
  return true;
}

function ipDesdeReq(req: NextApiRequest): string {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.trim()) return xf.split(",")[0]!.trim();
  if (Array.isArray(xf) && xf[0]) return String(xf[0]).split(",")[0]!.trim();
  return req.socket?.remoteAddress?.trim() || "unknown";
}

/**
 * Alta amigable al Club de Millas desde /pedidos (sin sesión de cajero).
 * Usa CLUB_MILLAS_POS_SECRET en servidor hacia WMS upsert-socio + correo de bienvenida.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse<Ok | Err>) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  if (!permitirPorIp(ipDesdeReq(req))) {
    return res.status(429).json({
      ok: false,
      message: "Demasiados intentos de registro. Espere unos minutos e intente de nuevo.",
    });
  }

  const b = (req.body ?? {}) as Record<string, unknown>;
  const puntoVenta = str(b.puntoVenta);
  const documento = normalizarDocumento(str(b.documento));
  const email = str(b.email).toLowerCase();
  const telefonoDigitos = str(b.telefono).replace(/\D/g, "").slice(-10);
  const nombreCompleto = str(b.nombreCompleto) || str(b.nombre) || str(b.cliente);
  const { nombres, apellidos } = partirNombreCompleto(nombreCompleto);

  if (!puntoVenta) {
    return res.status(400).json({ ok: false, message: "Falta el punto de venta." });
  }
  if (documento.length < 5 || documento.length > 20) {
    return res.status(400).json({
      ok: false,
      message: "Escriba un número de cédula válido (mínimo 5 dígitos, sin puntos ni guiones).",
    });
  }
  if (!emailValidoClientePos(email)) {
    return res.status(400).json({
      ok: false,
      message: "Indique un correo electrónico válido para enviarle su clave del Club de Millas.",
    });
  }
  if (telefonoDigitos.length !== 10) {
    return res.status(400).json({
      ok: false,
      message: "El teléfono debe tener 10 dígitos (el mismo de su pedido).",
    });
  }
  if (!nombres.trim()) {
    return res.status(400).json({
      ok: false,
      message: "Indique su nombre completo para registrarse en el Club de Millas.",
    });
  }

  const secret = process.env.CLUB_MILLAS_POS_SECRET?.trim();
  if (!secret) {
    return res.status(503).json({
      ok: false,
      message:
        "El Club de Millas no está disponible en este momento. Puede confirmar su pedido igual y registrarse más tarde.",
    });
  }

  const clienteLike: ClientePosFirestoreLike = {
    puntoVenta,
    tipoCliente: "persona",
    tipoIdentificacion: "CC",
    numeroIdentificacion: documento,
    nombres,
    apellidos,
    email,
    indicativoTelefono: "+57",
    telefono: telefonoDigitos,
    cajeroNombre: "Pedidos web",
  };

  try {
    const app = getFirebaseAdminApp();
    if (app) {
      const db = getFirestore(app);
      const existentes = await db
        .collection("posClientes")
        .where("puntoVenta", "==", puntoVenta)
        .where("numeroIdentificacion", "==", documento)
        .limit(1)
        .get();

      const ref =
        existentes.empty
          ? db.collection("posClientes").doc()
          : existentes.docs[0]!.ref;

      if (existentes.empty) {
        await ref.set({
          ...clienteLike,
          origenAlta: "pedidos_web",
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else {
        await ref.set(
          {
            ...clienteLike,
            origenAlta: "pedidos_web",
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }

      const bienvenida = await aplicarBienvenidaClubMillasACliente(ref, clienteLike);
      if (!bienvenida.ok) {
        return res.status(400).json({ ok: false, message: bienvenida.error });
      }

      return res.status(200).json({
        ok: true,
        registrado: true,
        message: bienvenida.correoEnviado
          ? "¡Listo! Ya está en el Club de Millas. Le enviamos su clave al correo."
          : "¡Listo! Ya está en el Club de Millas. Podrá acumular millas con este pedido.",
        clientePlanMillas: {
          documento,
          nombre: `${nombres} ${apellidos}`.trim(),
          socioId: ref.id,
        },
        ...(bienvenida.correoEnviado ? { bienvenidaCorreoEnviado: true } : {}),
      });
    }

    // Sin Firebase Admin: sincroniza solo WMS + correo.
    const pin = resolverPinClubMillas();
    const idSynthetic = `pedidos-web-${documento}`;
    const wms = await sincronizarPinClienteEnWms(idSynthetic, clienteLike, pin);
    if (!wms.ok) {
      return res.status(502).json({
        ok: false,
        message: wms.error || "No se pudo registrar en el Club de Millas. Intente de nuevo.",
      });
    }
    const envio = await enviarBienvenidaClienteClubMillasPorCorreo({
      to: email,
      nombreDisplay: `${nombres} ${apellidos}`.trim(),
      pin,
    });

    return res.status(200).json({
      ok: true,
      registrado: true,
      message: envio.ok
        ? "¡Listo! Ya está en el Club de Millas. Le enviamos su clave al correo."
        : "¡Listo! Ya está en el Club de Millas. Podrá acumular millas con este pedido.",
      clientePlanMillas: {
        documento,
        nombre: `${nombres} ${apellidos}`.trim(),
        socioId: idSynthetic,
      },
      ...(envio.ok ? { bienvenidaCorreoEnviado: true } : {}),
    });
  } catch (e) {
    console.error("[pedidos_club_millas_registrar]", e);
    return res.status(500).json({
      ok: false,
      message: e instanceof Error ? e.message : "No se pudo completar el registro.",
    });
  }
}
