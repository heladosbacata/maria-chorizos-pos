import type { NextApiRequest, NextApiResponse } from "next";
import { getAuth } from "firebase-admin/auth";
import { getFirebaseAdminApp } from "@/lib/firebase-admin-server";

/**
 * Certificado público PEM para QZ Tray (firma digital).
 * GET con Authorization: Bearer &lt;Firebase ID token&gt;.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  const pem = process.env.POS_QZ_CERT_PEM?.trim();
  if (!pem || !pem.includes("BEGIN CERTIFICATE")) {
    return res.status(404).json({
      ok: false,
      message: "Certificado QZ no configurado (POS_QZ_CERT_PEM en el servidor).",
    });
  }

  const app = getFirebaseAdminApp();
  if (!app) {
    return res.status(503).json({
      ok: false,
      message: "Servidor sin Firebase Admin; no se puede validar la sesión para el certificado QZ.",
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

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).send(pem.replace(/\\n/g, "\n"));
}
