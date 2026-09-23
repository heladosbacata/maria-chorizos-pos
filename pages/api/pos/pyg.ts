import type { NextApiRequest, NextApiResponse } from "next";
import { getFirestore, type DocumentData, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getFirebaseAdminApp, getCreadorFirestoreContext } from "@/lib/firebase-admin-server";
import { esContadorInvitado } from "@/lib/auth-roles";
import { ymdColombia } from "@/lib/fecha-colombia";
import { construirPygApiResponse, type PygApiResponse } from "@/lib/pyg-api-contrato";
import { normalizarPuntoVentaClave, puntoVentaCoincide } from "@/lib/punto-venta-clave";
import type { VentaGuardadaLocal } from "@/lib/pos-ventas-local-storage";

const COLLECTION = "posVentasCloud";
const PAGE = 800;
const MAX_PAGES = 8;
const MAX_DIAS_RANGO = 120;

type Err = { ok: false; message: string };

function queryStr(v: string | string[] | undefined): string {
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === "string" ? s.trim() : "";
}

function queryYmd(v: string | string[] | undefined): string {
  const t = queryStr(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : "";
}

function queryNum(v: string | string[] | undefined): number | undefined {
  const t = queryStr(v).replace(/[^\d]/g, "");
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

function inicioMesIso(ymd = ymdColombia()): string {
  return `${ymd.slice(0, 7)}-01`;
}

function restarDiasYmd(ymd: string, dias: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return ymd;
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

function puedeConsultarOtroPunto(uid: string, role: string | null): boolean {
  const allow = (process.env.POS_PYG_ADMIN_UIDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (allow.includes(uid)) return true;
  const r = (role ?? "").toLowerCase();
  return r === "admin" || r === "wms_admin" || r === "superadmin";
}

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
  const anulada = data.anulada === true;
  return {
    id,
    fechaYmd,
    isoTimestamp: iso,
    puntoVenta: pv,
    total,
    lineas,
    ...(anulada ? { anulada: true as const } : {}),
  };
}

async function listarVentasPvRango(params: {
  puntoVenta: string;
  desde: string;
  hasta: string;
}): Promise<VentaGuardadaLocal[]> {
  const app = getFirebaseAdminApp();
  if (!app) return [];
  const db = getFirestore(app);
  const map = new Map<string, VentaGuardadaLocal>();
  const incorporar = (docs: QueryDocumentSnapshot[]) => {
    for (const d of docs) {
      const row = docToVenta(d.id, d.data());
      if (!row) continue;
      if (!puntoVentaCoincide(row.puntoVenta, params.puntoVenta)) continue;
      if (row.fechaYmd < params.desde || row.fechaYmd > params.hasta) continue;
      map.set(row.id, row);
    }
  };

  const porCampo = async (campo: "puntoVenta" | "puntoVentaNorm", valor: string) => {
    let last: QueryDocumentSnapshot | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      let q = db
        .collection(COLLECTION)
        .where(campo, "==", valor)
        .where("fechaYmd", ">=", params.desde)
        .where("fechaYmd", "<=", params.hasta)
        .orderBy("fechaYmd", "desc")
        .limit(PAGE);
      if (last) q = q.startAfter(last);
      let snap;
      try {
        snap = await q.get();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/index/i.test(msg)) return false;
        throw e;
      }
      if (snap.empty) break;
      incorporar(snap.docs);
      last = snap.docs[snap.docs.length - 1];
      if (snap.size < PAGE) break;
    }
    return true;
  };

  const okPv = await porCampo("puntoVenta", params.puntoVenta);
  if (!okPv || map.size === 0) {
    const norm = normalizarPuntoVentaClave(params.puntoVenta);
    if (norm) await porCampo("puntoVentaNorm", norm);
  }

  return Array.from(map.values());
}

/**
 * GET /api/pos/pyg
 * ?puntoVenta=&desde=YYYY-MM-DD&hasta=YYYY-MM-DD
 * &rentaMensual=&personalMensual=&comparativo=0
 *
 * Misma fórmula que Espacio franquiciados → PyG del punto (`calcularPygSimplificado`).
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PygApiResponse | Err>
) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  const app = getFirebaseAdminApp();
  if (!app) {
    return res.status(503).json({
      ok: false,
      message: "Firebase Admin no configurado (FIREBASE_SERVICE_ACCOUNT_JSON).",
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
  if (esContadorInvitado(ctx.role)) {
    return res.status(403).json({
      ok: false,
      message: "Las cuentas de contador no consultan el PyG por esta API.",
    });
  }
  if (!ctx.puntoVenta) {
    return res.status(400).json({
      ok: false,
      message: "Tu usuario no tiene punto de venta asignado.",
    });
  }

  const puntoQuery = queryStr(req.query.puntoVenta) || ctx.puntoVenta;
  const cross = puedeConsultarOtroPunto(ctx.uid, ctx.role);
  if (!cross && !puntoVentaCoincide(puntoQuery, ctx.puntoVenta)) {
    return res.status(403).json({
      ok: false,
      message: "El punto de venta no coincide con tu sesión.",
    });
  }

  const hoy = ymdColombia();
  let desde = queryYmd(req.query.desde) || inicioMesIso(hoy);
  let hasta = queryYmd(req.query.hasta) || hoy;
  if (desde > hasta) {
    return res.status(400).json({ ok: false, message: "desde debe ser ≤ hasta (YYYY-MM-DD)." });
  }
  const minDesde = restarDiasYmd(hasta, MAX_DIAS_RANGO);
  if (desde < minDesde) desde = minDesde;

  const rentaMensual = queryNum(req.query.rentaMensual);
  const personalMensual = queryNum(req.query.personalMensual);
  const comparativoRaw = queryStr(req.query.comparativo).toLowerCase();
  const incluirComparativo = !(comparativoRaw === "0" || comparativoRaw === "false" || comparativoRaw === "no");

  // Para el comparativo necesitamos también el periodo anterior (mismas ventas en un rango más ancho).
  const padDesde = incluirComparativo
    ? restarDiasYmd(desde, Math.max(1, Math.round((Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / 86_400_000) + 1))
    : desde;

  try {
    const ventas = await listarVentasPvRango({
      puntoVenta: puntoQuery,
      desde: padDesde,
      hasta,
    });

    const body = construirPygApiResponse({
      puntoVenta: puntoQuery,
      desde,
      hasta,
      ventas,
      rentaMensual,
      personalMensual,
      incluirComparativo,
    });

    return res.status(200).json(body);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error al calcular PyG.";
    return res.status(500).json({ ok: false, message });
  }
}
