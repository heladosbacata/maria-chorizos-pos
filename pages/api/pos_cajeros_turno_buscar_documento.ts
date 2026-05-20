import type { NextApiRequest, NextApiResponse } from "next";
import { getFirestore } from "firebase-admin/firestore";
import { getFirebaseAdminApp, getCreadorFirestoreContext } from "@/lib/firebase-admin-server";
import { emptyCajeroFicha, type CajeroFichaDatos } from "@/types/pos-perfil-cajero";

const COLLECTION = "posCajerosTurno";

function normalizarDoc(doc: string): string {
  return doc.replace(/\D/g, "").trim();
}

function fichaFromFirestore(raw: unknown): CajeroFichaDatos {
  if (!raw || typeof raw !== "object") return emptyCajeroFicha();
  return { ...emptyCajeroFicha(), ...(raw as Partial<CajeroFichaDatos>) };
}

/**
 * POST: busca operador por documento en todo posCajerosTurno (catálogo nacional).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  const app = getFirebaseAdminApp();
  if (!app) {
    return res.status(503).json({
      ok: false,
      message: "Servidor sin credenciales Admin. Usa NEXT_PUBLIC_WMS_URL apuntando al WMS.",
    });
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return res.status(401).json({ ok: false, message: "Falta Authorization: Bearer." });
  }

  const ctx = await getCreadorFirestoreContext(app, token);
  if (!ctx.ok) {
    return res.status(401).json({ ok: false, message: ctx.message });
  }

  const body = (req.body ?? {}) as { numeroDocumento?: string };
  const numeroDocumento = String(body.numeroDocumento ?? "").trim();
  if (!numeroDocumento) {
    return res.status(400).json({ ok: false, message: "Indica el número de documento." });
  }

  const norm = normalizarDoc(numeroDocumento);
  if (!norm) {
    return res.status(200).json({ ok: true, estado: "no_encontrado" });
  }

  const db = getFirestore(app);
  try {
    const snap = await db.collection(COLLECTION).get();
    const coincidencias: {
      id: string;
      puntoVenta: string;
      activo: boolean;
      ficha: CajeroFichaDatos;
    }[] = [];
    for (const doc of snap.docs) {
      const x = doc.data();
      const ficha = fichaFromFirestore(x.ficha);
      if (normalizarDoc(String(ficha.numeroDocumento ?? "")) !== norm) continue;
      coincidencias.push({
        id: doc.id,
        puntoVenta: String(x.puntoVenta ?? "").trim(),
        activo: x.activo !== false,
        ficha,
      });
    }
    if (coincidencias.length === 0) {
      return res.status(200).json({ ok: true, estado: "no_encontrado" });
    }
    const activo = coincidencias.find((c) => c.activo);
    const cajero = activo ?? coincidencias[0]!;
    return res.status(200).json({
      ok: true,
      estado: activo ? "activo" : "inactivo",
      cajero,
    });
  } catch (e) {
    console.error("pos_cajeros_turno_buscar_documento", e);
    return res.status(500).json({
      ok: false,
      message: e instanceof Error ? e.message : "No se pudo buscar el cajero.",
    });
  }
}
