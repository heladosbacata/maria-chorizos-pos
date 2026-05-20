import type { NextApiRequest, NextApiResponse } from "next";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getFirebaseAdminApp, getCreadorFirestoreContext } from "@/lib/firebase-admin-server";
import { POS_CONTADOR_ROLE } from "@/lib/auth-roles";
import { emptyCajeroFicha, type CajeroFichaDatos } from "@/types/pos-perfil-cajero";

const COLLECTION = "posCajerosTurno";

function normalizarDoc(doc: string): string {
  return doc.replace(/\D/g, "").trim();
}

function fichaFromBody(raw: unknown): CajeroFichaDatos {
  if (!raw || typeof raw !== "object") return emptyCajeroFicha();
  return { ...emptyCajeroFicha(), ...(raw as Partial<CajeroFichaDatos>) };
}

/**
 * POST: registra operador en posCajerosTurno con Admin SDK (evita permission-denied del navegador).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  const app = getFirebaseAdminApp();
  if (!app) {
    return res.status(503).json({
      ok: false,
      message:
        "Servidor sin FIREBASE_SERVICE_ACCOUNT_JSON. Configúrala en Vercel o usa NEXT_PUBLIC_WMS_URL apuntando al WMS.",
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
  if (ctx.role === POS_CONTADOR_ROLE) {
    return res.status(403).json({ ok: false, message: "Las cuentas de contador no pueden registrar operadores." });
  }
  if (!ctx.puntoVenta) {
    return res.status(400).json({
      ok: false,
      message: "Tu perfil no tiene punto de venta en Firestore.",
    });
  }

  const ficha = fichaFromBody((req.body as { ficha?: unknown })?.ficha);
  const numeroDocumento = String(ficha.numeroDocumento ?? "").trim();
  if (!numeroDocumento) {
    return res.status(400).json({ ok: false, message: "El número de documento es obligatorio." });
  }
  const nom = `${ficha.nombres ?? ""} ${ficha.apellidos ?? ""}`.trim();
  if (!nom) {
    return res.status(400).json({ ok: false, message: "Indica nombres y apellidos del cajero." });
  }
  const correo = String(ficha.correo ?? "").trim();
  if (!correo || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
    return res.status(400).json({ ok: false, message: "Indica un correo electrónico válido del cajero." });
  }

  const db = getFirestore(app);
  const norm = normalizarDoc(numeroDocumento);
  try {
    const existentes = await db.collection(COLLECTION).get();
    for (const doc of existentes.docs) {
      const f = (doc.data().ficha ?? {}) as Partial<CajeroFichaDatos>;
      if (normalizarDoc(String(f.numeroDocumento ?? "")) === norm) {
        const pvReg = String(doc.data().puntoVenta ?? "").trim() || "otro punto";
        return res.status(400).json({
          ok: false,
          message: `Ya existe un cajero registrado con ese documento (punto de registro: ${pvReg}).`,
        });
      }
    }

    const ref = await db.collection(COLLECTION).add({
      puntoVenta: ctx.puntoVenta,
      activo: true,
      ficha,
      createdByUid: ctx.uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return res.status(200).json({ ok: true, id: ref.id, message: "Cajero registrado." });
  } catch (e) {
    console.error("pos_cajeros_turno_crear", e);
    return res.status(500).json({
      ok: false,
      message: e instanceof Error ? e.message : "No se pudo guardar el cajero.",
    });
  }
}
