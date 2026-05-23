import type { NextApiRequest, NextApiResponse } from "next";
import { getFirestore, type DocumentData, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getFirebaseAdminApp, getCreadorFirestoreContext } from "@/lib/firebase-admin-server";
import type { VentaGuardadaLocal } from "@/lib/pos-ventas-local-storage";
import { normalizarPuntoVentaClave, puntoVentaCoincide } from "@/lib/punto-venta-clave";
import {
  mensajeVentasCloudSinAdminLocal,
  proxyApiVentasCloud,
} from "@/lib/pos-ventas-cloud-proxy-server";

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

  const anulada = data.anulada === true;
  const anuladaMotivo = typeof data.anuladaMotivo === "string" ? data.anuladaMotivo.trim() : "";
  const anuladaEnIso = typeof data.anuladaEnIso === "string" ? data.anuladaEnIso.trim() : "";
  const anuladaPorUid = typeof data.anuladaPorUid === "string" ? data.anuladaPorUid.trim() : "";

  const feNum =
    typeof data.facturaElectronicaNumero === "string" ? data.facturaElectronicaNumero.trim() : "";
  const feCufe =
    typeof data.facturaElectronicaCufe === "string" ? data.facturaElectronicaCufe.trim() : "";
  const feAt =
    typeof data.facturaElectronicaEnviadoAt === "string" ? data.facturaElectronicaEnviadoAt.trim() : "";
  const clienteNombreVenta =
    typeof data.clienteNombreVenta === "string" ? data.clienteNombreVenta.trim() : "";
  const clienteNitVenta = typeof data.clienteNitVenta === "string" ? data.clienteNitVenta.trim() : "";
  const clienteEmailVenta =
    typeof data.clienteEmailVenta === "string" ? data.clienteEmailVenta.trim() : "";
  const comprobanteEmailEnviadoAt =
    typeof data.comprobanteEmailEnviadoAt === "string" ? data.comprobanteEmailEnviadoAt.trim() : "";
  const comprobanteEmailDestino =
    typeof data.comprobanteEmailDestino === "string" ? data.comprobanteEmailDestino.trim() : "";
  const tipoComprobanteRaw = data.tipoComprobanteAlCobro;
  const tipoComprobanteAlCobro =
    tipoComprobanteRaw === "factura_electronica" || tipoComprobanteRaw === "documento_interno"
      ? tipoComprobanteRaw
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
    ...(anulada ? { anulada: true as const } : {}),
    ...(anulada && anuladaMotivo ? { anuladaMotivo } : {}),
    ...(anulada && anuladaEnIso ? { anuladaEnIso } : {}),
    ...(anulada && anuladaPorUid ? { anuladaPorUid } : {}),
    ...(feNum ? { facturaElectronicaNumero: feNum } : {}),
    ...(feCufe ? { facturaElectronicaCufe: feCufe } : {}),
    ...(feAt ? { facturaElectronicaEnviadoAt: feAt } : {}),
    ...(clienteNombreVenta ? { clienteNombreVenta } : {}),
    ...(clienteNitVenta ? { clienteNitVenta } : {}),
    ...(clienteEmailVenta ? { clienteEmailVenta } : {}),
    ...(comprobanteEmailEnviadoAt ? { comprobanteEmailEnviadoAt } : {}),
    ...(comprobanteEmailDestino ? { comprobanteEmailDestino } : {}),
    ...(tipoComprobanteAlCobro ? { tipoComprobanteAlCobro } : {}),
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
    const proxied = await proxyApiVentasCloud(req, "pos_ventas_cloud");
    if (proxied) {
      return res.status(proxied.status).json(proxied.body);
    }
    return res.status(503).json({
      ok: false,
      message: mensajeVentasCloudSinAdminLocal(),
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
  const pvCanon = ctx.puntoVenta;
  const pvNorm = normalizarPuntoVentaClave(pvCanon);

  const incorporarSnap = (docs: QueryDocumentSnapshot[], map: Map<string, VentaGuardadaLocal>) => {
    for (const d of docs) {
      const row = docToVenta(d.id, d.data());
      if (!row) continue;
      if (!puntoVentaCoincide(row.puntoVenta, pvCanon)) continue;
      map.set(row.id, row);
    }
  };

  const msOrden = (data: DocumentData, row: VentaGuardadaLocal): number => {
    const sc = data.serverCreatedAt;
    if (sc && typeof sc.toDate === "function") {
      const t = sc.toDate().getTime();
      if (Number.isFinite(t)) return t;
    }
    const t = Date.parse(row.isoTimestamp);
    return Number.isFinite(t) ? t : 0;
  };

  const listarConOrderBy = async (
    campo: "puntoVenta" | "puntoVentaNorm",
    valor: string
  ): Promise<QueryDocumentSnapshot[] | null> => {
    try {
      const snap = await db
        .collection(COLLECTION)
        .where(campo, "==", valor)
        .orderBy("serverCreatedAt", "desc")
        .limit(PAGE)
        .get();
      return snap.docs;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/index/i.test(msg)) return null;
      throw e;
    }
  };

  const listarSinOrderBy = async (
    campo: "puntoVenta" | "puntoVentaNorm",
    valor: string
  ): Promise<QueryDocumentSnapshot[]> => {
    const snap = await db.collection(COLLECTION).where(campo, "==", valor).limit(PAGE).get();
    return snap.docs;
  };

  try {
    const porId = new Map<string, VentaGuardadaLocal>();
    const ordenMs = new Map<string, number>();

    const absorber = (docs: QueryDocumentSnapshot[]) => {
      for (const d of docs) {
        const row = docToVenta(d.id, d.data());
        if (!row || !puntoVentaCoincide(row.puntoVenta, pvCanon)) continue;
        const ms = msOrden(d.data(), row);
        const prev = porId.get(row.id);
        if (!prev || ms >= (ordenMs.get(row.id) ?? 0)) {
          porId.set(row.id, row);
          ordenMs.set(row.id, ms);
        }
      }
    };

    let docsPv = await listarConOrderBy("puntoVenta", pvCanon);
    let usoFallback = docsPv === null;
    if (docsPv === null) {
      console.warn(
        "pos_ventas_cloud: sin índice compuesto; listando sin orderBy (despliega firestore.indexes.json)."
      );
      docsPv = await listarSinOrderBy("puntoVenta", pvCanon);
    }
    absorber(docsPv);

    if (porId.size < PAGE) {
      let docsNorm = await listarConOrderBy("puntoVentaNorm", pvNorm);
      if (docsNorm === null) {
        usoFallback = true;
        docsNorm = await listarSinOrderBy("puntoVentaNorm", pvNorm);
      }
      absorber(docsNorm);
    }

    const ventas = Array.from(porId.values()).sort((a, b) => {
      const ma = ordenMs.get(a.id) ?? Date.parse(a.isoTimestamp);
      const mb = ordenMs.get(b.id) ?? Date.parse(b.isoTimestamp);
      return mb - ma;
    });

    return res.status(200).json({
      ok: true,
      ventas,
      ...(usoFallback ? { indexFallback: true as const } : {}),
    });
  } catch (e: unknown) {
    console.error("pos_ventas_cloud", e);
    return res.status(500).json({ ok: false, message: "No se pudieron listar las ventas." });
  }
}
