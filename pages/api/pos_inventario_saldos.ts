import type { NextApiRequest, NextApiResponse } from "next";
import { getFirestore } from "firebase-admin/firestore";
import { getFirebaseAdminApp, getCreadorFirestoreContext } from "@/lib/firebase-admin-server";
import {
  elegirSaldoPreferido,
  claveParaConsolidarSaldoKit,
  mergeSaldosInventarioLegacyYEnsamble,
  type InventarioSaldoRow,
} from "@/lib/inventario-pos-firestore";

const COL_SALDOS = "posInventarioSaldos";
const COL_ENSAMBLE_SALDOS = "pos_inventario_ensamble_saldo";

function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function normPuntoVenta(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, "-");
}

function saldoRowDesdeData(data: Record<string, unknown>): InventarioSaldoRow | null {
  const idish =
    str(data.insumoId) ||
    str(data.skuComponente) ||
    str(data.sku_componente) ||
    str(data.codigoInsumo) ||
    str(data.codigo_insumo);
  if (!idish) return null;
  const sku = str(data.insumoSku) || str(data.skuComponente) || str(data.sku_componente) || idish;
  const rawCant = data.cantidad ?? data.stock ?? data.saldo ?? data.qty ?? data.quantity ?? data.cantidadActual;
  const cantidad = Number(rawCant);
  const costoRaw = data.costoUnitarioPromedio ?? data.costo_unitario_promedio;
  const costo = Number(costoRaw);
  return {
    insumoId: idish,
    insumoSku: sku,
    cantidad: Number.isFinite(cantidad) ? cantidad : 0,
    ...(Number.isFinite(costo) && costo >= 0 ? { costoUnitarioPromedio: Math.round(costo * 100) / 100 } : {}),
  };
}

function dedupePorClave(rows: InventarioSaldoRow[]): InventarioSaldoRow[] {
  const map = new Map<string, InventarioSaldoRow>();
  for (const row of rows) {
    const key = claveParaConsolidarSaldoKit(row);
    map.set(key, elegirSaldoPreferido(map.get(key), row));
  }
  return Array.from(map.values());
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  const app = getFirebaseAdminApp();
  if (!app) {
    return res.status(503).json({ ok: false, message: "Firebase Admin no está configurado." });
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) {
    return res.status(401).json({ ok: false, message: "Falta Authorization Bearer." });
  }

  const ctx = await getCreadorFirestoreContext(app, token);
  if (!ctx.ok) return res.status(401).json({ ok: false, message: ctx.message });
  const pvPerfil = ctx.puntoVenta?.trim();
  if (!pvPerfil) {
    return res.status(400).json({ ok: false, message: "Tu perfil no tiene punto de venta." });
  }

  const pvReq = typeof req.query.puntoVenta === "string" ? req.query.puntoVenta.trim() : "";
  if (pvReq && pvReq !== pvPerfil) {
    return res.status(403).json({ ok: false, message: "El punto de venta no coincide con tu perfil." });
  }

  const db = getFirestore(app);
  const legacy: InventarioSaldoRow[] = [];
  const ensamble: InventarioSaldoRow[] = [];
  const pvClave = normPuntoVenta(pvPerfil);

  const legacySnap = await db.collection(COL_SALDOS).where("puntoVenta", "==", pvPerfil).get();
  legacySnap.forEach((doc) => {
    const row = saldoRowDesdeData(doc.data());
    if (row) legacy.push(row);
  });

  const ensPvSnap = await db.collection(COL_ENSAMBLE_SALDOS).where("puntoVenta", "==", pvPerfil).get();
  ensPvSnap.forEach((doc) => {
    const row = saldoRowDesdeData(doc.data());
    if (row) ensamble.push(row);
  });

  if (pvClave) {
    try {
      const ensClaveSnap = await db.collection(COL_ENSAMBLE_SALDOS).where("puntoVentaClave", "==", pvClave).get();
      ensClaveSnap.forEach((doc) => {
        const row = saldoRowDesdeData(doc.data());
        if (row) ensamble.push(row);
      });
    } catch {
      /* índice/campo no disponible; con puntoVenta exacto basta para cargues POS */
    }
  }

  const legacyRows = dedupePorClave(legacy);
  const ensambleRows = dedupePorClave(ensamble);
  const saldoRows = mergeSaldosInventarioLegacyYEnsamble(legacyRows, ensambleRows);

  return res.status(200).json({
    ok: true,
    saldoRows,
    legacyRows,
    ensambleRows,
  });
}
