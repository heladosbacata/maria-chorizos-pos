import type { NextApiRequest, NextApiResponse } from "next";
import { getFirestore, type DocumentData } from "firebase-admin/firestore";
import { getFirebaseAdminApp, getCreadorFirestoreContext } from "@/lib/firebase-admin-server";
import type { VentaGuardadaLocal } from "@/lib/pos-ventas-local-storage";

const COLLECTION = "posVentasCloud";
const PAGE = 800;

function docToVenta(id: string, data: DocumentData): VentaGuardadaLocal | null {
  const lineas = data.lineas;
  if (!Array.isArray(lineas)) return null;
  const iso =
    typeof data.isoTimestamp === "string" && data.isoTimestamp.trim()
      ? data.isoTimestamp.trim()
      : "";
  if (!iso) return null;
  const total = typeof data.total === "number" ? data.total : NaN;
  if (!Number.isFinite(total)) return null;
  const fechaYmd =
    typeof data.fechaYmd === "string" && data.fechaYmd.trim() ? data.fechaYmd.trim() : "";
  const pv = typeof data.puntoVenta === "string" ? data.puntoVenta.trim() : "";
  if (!fechaYmd || !pv) return null;
  const uidSesion =
    typeof data.uidRegistro === "string" && data.uidRegistro.trim()
      ? data.uidRegistro.trim()
      : undefined;

  return {
    id,
    fechaYmd,
    isoTimestamp: iso,
    puntoVenta: pv,
    ...(uidSesion ? { uidSesion } : {}),
    ...(typeof data.turnoSesionId === "string" ? { turnoSesionId: data.turnoSesionId } : {}),
    ...(typeof data.cajeroTurnoId === "string" ? { cajeroTurnoId: data.cajeroTurnoId } : {}),
    ...(typeof data.cajeroNombre === "string" ? { cajeroNombre: data.cajeroNombre } : {}),
    total,
    lineas,
    ...(typeof data.pagoResumen === "string" ? { pagoResumen: data.pagoResumen } : {}),
    ...(data.mediosPago && typeof data.mediosPago === "object" ? { mediosPago: data.mediosPago } : {}),
  };
}

/**
 * Lista ventas guardadas en Firestore para el punto de venta del usuario (todos los cajeros del mismo PV).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  const app = getFirebaseAdminApp();
  if (!app) {
    return res.status(503).json({
      ok: false,
      message:
        "Almacenamiento en nube no configurado. En Vercel agrega FIREBASE_SERVICE_ACCOUNT_JSON.",
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
    return res.status(200).json({ ok: true, ventas: [] });
  }

  const db = getFirestore(app);
  try {
    const snap = await db
      .collection(COLLECTION)
      .where("puntoVenta", "==", ctx.puntoVenta)
      .orderBy("serverCreatedAt", "desc")
      .limit(PAGE)
      .get();

    const ventas: VentaGuardadaLocal[] = [];
    for (const d of snap.docs) {
      const row = docToVenta(d.id, d.data());
      if (row) ventas.push(row);
    }
    return res.status(200).json({ ok: true, ventas });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/index/i.test(msg)) {
      console.error("pos_ventas_cloud: falta índice compuesto Firestore (puntoVenta + serverCreatedAt).", msg);
      return res.status(503).json({
        ok: false,
        message:
          "Firestore requiere un índice compuesto. Revisa la consola del servidor o despliega firestore.indexes.json del repositorio.",
      });
    }
    console.error("pos_ventas_cloud", e);
    return res.status(500).json({ ok: false, message: "No se pudieron listar las ventas." });
  }
}
