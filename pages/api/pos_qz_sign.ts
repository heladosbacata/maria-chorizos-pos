import type { NextApiRequest, NextApiResponse } from "next";
import { createSign } from "crypto";
import { getAuth } from "firebase-admin/auth";
import { getFirebaseAdminApp } from "@/lib/firebase-admin-server";

function algoritmoNode(alg: string): string {
  const u = alg.toUpperCase();
  if (u === "SHA512") return "RSA-SHA512";
  if (u === "SHA256") return "RSA-SHA256";
  return "RSA-SHA1";
}

/**
 * Firma el reto que envía QZ Tray para autorizar la conexión.
 * POST JSON { "toSign": "..." } con Authorization: Bearer &lt;Firebase ID token&gt;.
 * Respuesta: texto plano base64 (sin JSON).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  const keyPem = process.env.POS_QZ_PRIVATE_KEY_PEM?.trim();
  if (!keyPem || (!keyPem.includes("PRIVATE KEY") && !keyPem.includes("RSA PRIVATE KEY"))) {
    return res.status(503).json({
      ok: false,
      message: "Clave privada QZ no configurada (POS_QZ_PRIVATE_KEY_PEM).",
    });
  }

  const app = getFirebaseAdminApp();
  if (!app) {
    return res.status(503).json({
      ok: false,
      message: "Servidor sin Firebase Admin; no se puede firmar para QZ.",
    });
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) {
    return res.status(401).json({ ok: false, message: "Falta Authorization Bearer." });
  }

  try {
    await getAuth(app).verifyIdToken(token);
  } catch {
    return res.status(401).json({ ok: false, message: "Token inválido o expirado." });
  }

  const body = req.body as Record<string, unknown> | undefined;
  const toSign =
    typeof body?.toSign === "string"
      ? body.toSign
      : typeof body?.request === "string"
        ? body.request
        : "";
  if (!toSign) {
    return res.status(400).json({ ok: false, message: "Falta toSign en el cuerpo JSON." });
  }

  const alg = (process.env.POS_QZ_SIGN_ALGORITHM || "SHA512").toUpperCase();
  const keyNormalized = keyPem.replace(/\\n/g, "\n");

  try {
    const sign = createSign(algoritmoNode(alg));
    sign.update(toSign);
    sign.end();
    const signature = sign.sign(keyNormalized, "base64");
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(signature);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al firmar.";
    return res.status(500).json({ ok: false, message: msg });
  }
}
