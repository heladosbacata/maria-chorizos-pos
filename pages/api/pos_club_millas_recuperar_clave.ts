import type { NextApiRequest, NextApiResponse } from "next";
import { getFirestore } from "firebase-admin/firestore";
import { getFirebaseAdminApp, getCreadorFirestoreContext } from "@/lib/firebase-admin-server";
import { enviarCorreoRecuperacionClubMillasDesdePos } from "@/lib/club-millas-recuperacion-enviar-correo-pos";
import { prepararRecuperacionClaveClubMillasEnPos } from "@/lib/club-millas-preparar-recuperacion-pos";
import { mensajeErrorCorreoClubMillas } from "@/lib/recuperar-clave-club-millas-documento";
import { POS_CONTADOR_ROLE } from "@/lib/auth-roles";
import { detectCierreEmailBackend } from "@/lib/posCierreInformeEmail";
import { smtpInformeTurnoConfigured } from "@/lib/email-informe-turno-smtp";
import {
  mensajeCorreoPosSinConfigLocal,
  proxyPosApiRoute,
  puedeUsarPosDeployProxyLocal,
} from "@/lib/pos-ventas-cloud-proxy-server";

type Ok = {
  ok: true;
  message: string;
  correoEnmascarado?: string;
  pinRenovado?: boolean;
};
type Err = { ok: false; message: string };

function normalizarDocumento(raw: string): string {
  return raw.replace(/\s/g, "").replace(/[.\-]/g, "").trim();
}

function correoInformeConfigurado(): boolean {
  return smtpInformeTurnoConfigured() || detectCierreEmailBackend() !== null;
}

function respuestaExito(prep: {
  correoEnmascarado: string;
  pinRenovado?: boolean;
}): Ok {
  const avisoPin = prep.pinRenovado
    ? " Generamos una clave nueva porque no teníamos la anterior guardada; usá la del correo para ingresar."
    : "";
  return {
    ok: true,
    message: `Se envió la clave de acceso al correo ${prep.correoEnmascarado}. Pedile al cliente que revise bandeja y spam.${avisoPin}`,
    correoEnmascarado: prep.correoEnmascarado,
    ...(prep.pinRenovado ? { pinRenovado: true } : {}),
  };
}

function falloSmtpReintentable(msg: string): boolean {
  const r = msg.toLowerCase();
  return r.includes("535") || r.includes("authentication failed") || r.includes("invalid login");
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<Ok | Err>) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  if (!correoInformeConfigurado()) {
    const proxied = await proxyPosApiRoute(req, "pos_club_millas_recuperar_clave");
    if (proxied) {
      return res.status(proxied.status).json(proxied.body as Ok | Err);
    }
    return res.status(200).json({ ok: false, message: mensajeCorreoPosSinConfigLocal() });
  }

  const app = getFirebaseAdminApp();
  if (!app) {
    return res.status(503).json({ ok: false, message: "Servidor POS sin Firebase Admin configurado." });
  }

  const token = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7).trim()
    : "";
  if (!token) {
    return res.status(401).json({ ok: false, message: "Falta Authorization Bearer." });
  }

  const ctx = await getCreadorFirestoreContext(app, token);
  if (!ctx.ok) {
    return res.status(401).json({ ok: false, message: ctx.message });
  }
  if (ctx.role === POS_CONTADOR_ROLE) {
    return res.status(403).json({ ok: false, message: "Las cuentas de contador no pueden enviar recuperación de clave." });
  }

  const rawDoc =
    typeof (req.body as { documento?: unknown })?.documento === "string"
      ? (req.body as { documento: string }).documento
      : "";
  const documento = normalizarDocumento(rawDoc);
  if (documento.length < 5) {
    return res.status(400).json({ ok: false, message: "Indica un documento válido (mínimo 5 dígitos)." });
  }

  try {
    const db = getFirestore(app);
    const local = await prepararRecuperacionClaveClubMillasEnPos(db, documento);
    if (!local.ok) {
      return res.status(200).json({ ok: false, message: local.error });
    }

    const envio = await enviarCorreoRecuperacionClubMillasDesdePos({
      to: local.correoDestino,
      subject: local.subject,
      text: local.text,
      html: local.html,
    });

    if (!envio.ok) {
      if (puedeUsarPosDeployProxyLocal() && falloSmtpReintentable(envio.message)) {
        const proxied = await proxyPosApiRoute(req, "pos_club_millas_recuperar_clave");
        if (proxied) {
          const body = proxied.body as Ok | Err;
          if (body.ok) return res.status(200).json(body);
        }
      }
      return res.status(200).json({ ok: false, message: envio.message });
    }

    return res.status(200).json(
      respuestaExito({
        correoEnmascarado: local.correoEnmascarado,
        pinRenovado: local.pinRenovado,
      })
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No se pudo completar la recuperación.";
    return res.status(200).json({ ok: false, message: mensajeErrorCorreoClubMillas(msg) });
  }
}
