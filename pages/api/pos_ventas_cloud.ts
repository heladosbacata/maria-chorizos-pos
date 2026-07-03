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
const PAGE_RANGO = 1000;
// Tope de costo: máximo 8 páginas (8.000 docs) por consulta de rango. Antes eran 50
// (50.000 docs) y, combinado con el polling del POS, disparaba el costo de Firestore.
const MAX_PAGES_RANGO = 8;
// Ventana máxima permitida para el rango; evita escanear meses completos por accidente.
const MAX_DIAS_RANGO = 45;
// Caché en memoria por punto+rango para colapsar llamadas repetidas seguidas.
const RANGO_CACHE_TTL_MS = 60_000;

type RangoCacheEntry = { at: number; ventas: VentaGuardadaLocal[] };
const rangoCache = new Map<string, RangoCacheEntry>();

function queryYmd(v: string | string[] | undefined): string {
  const s = Array.isArray(v) ? v[0] : v;
  const t = typeof s === "string" ? s.trim().slice(0, 10) : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : "";
}

function restarDiasYmd(ymd: string, dias: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return ymd;
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
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
  let desde = queryYmd(req.query.desde);
  const hasta = queryYmd(req.query.hasta);
  const usarRangoFecha = Boolean(desde && hasta && desde <= hasta);
  // Acota la ventana: nunca escanear más de MAX_DIAS_RANGO días hacia atrás.
  if (usarRangoFecha) {
    const minDesde = restarDiasYmd(hasta, MAX_DIAS_RANGO);
    if (desde < minDesde) desde = minDesde;
  }

  // Caché en memoria (por punto + rango) para colapsar llamadas repetidas seguidas.
  const cacheKey = usarRangoFecha ? `${pvNorm}|${desde}|${hasta}` : "";
  if (cacheKey) {
    const hit = rangoCache.get(cacheKey);
    if (hit && Date.now() - hit.at < RANGO_CACHE_TTL_MS) {
      return res.status(200).json({ ok: true, ventas: hit.ventas, cached: true as const });
    }
  }

  const incorporarSnap = (docs: QueryDocumentSnapshot[], map: Map<string, VentaGuardadaLocal>) => {
    for (const d of docs) {
      const row = docToVenta(d.id, d.data());
      if (!row) continue;
      if (!puntoVentaCoincide(row.puntoVenta, pvCanon)) continue;
      if (usarRangoFecha && (row.fechaYmd < desde || row.fechaYmd > hasta)) continue;
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

  // Rango filtrado por punto de venta (mucho más barato: solo lee las ventas de este
  // punto, no las de toda la empresa). Requiere índice compuesto; si falta, devuelve
  // null para que el handler use el siguiente fallback.
  const listarPorRangoFechaCampo = async (
    campo: "puntoVenta" | "puntoVentaNorm",
    valor: string
  ): Promise<QueryDocumentSnapshot[] | null> => {
    const out: QueryDocumentSnapshot[] = [];
    let last: QueryDocumentSnapshot | null = null;
    for (let page = 0; page < MAX_PAGES_RANGO; page++) {
      let q = db
        .collection(COLLECTION)
        .where(campo, "==", valor)
        .where("fechaYmd", ">=", desde)
        .where("fechaYmd", "<=", hasta)
        .orderBy("fechaYmd", "desc")
        .limit(PAGE_RANGO);
      if (last) q = q.startAfter(last);
      let snap;
      try {
        snap = await q.get();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/index/i.test(msg)) return null;
        throw e;
      }
      if (snap.empty) break;
      out.push(...snap.docs);
      last = snap.docs[snap.docs.length - 1] ?? null;
      if (snap.docs.length < PAGE_RANGO) break;
    }
    return out;
  };

  // Último recurso (sin índice): rango por fecha sobre todos los puntos, ya acotado a
  // MAX_PAGES_RANGO para poner un techo de costo.
  const listarPorRangoFecha = async (): Promise<QueryDocumentSnapshot[]> => {
    const out: QueryDocumentSnapshot[] = [];
    let last: QueryDocumentSnapshot | null = null;
    for (let page = 0; page < MAX_PAGES_RANGO; page++) {
      let q = db
        .collection(COLLECTION)
        .where("fechaYmd", ">=", desde)
        .where("fechaYmd", "<=", hasta)
        .orderBy("fechaYmd", "desc")
        .limit(PAGE_RANGO);
      if (last) q = q.startAfter(last);
      const snap = await q.get();
      if (snap.empty) break;
      out.push(...snap.docs);
      last = snap.docs[snap.docs.length - 1] ?? null;
      if (snap.docs.length < PAGE_RANGO) break;
    }
    return out;
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

    if (usarRangoFecha) {
      // 1) Rango filtrado por punto (barato). 2) por punto normalizado. 3) fallback global acotado.
      let docsRango = await listarPorRangoFechaCampo("puntoVenta", pvCanon);
      if (docsRango === null && pvNorm) {
        docsRango = await listarPorRangoFechaCampo("puntoVentaNorm", pvNorm);
      }
      if (docsRango === null) {
        docsRango = await listarPorRangoFecha();
      }
      absorber(docsRango);
    }

    let docsPv = usarRangoFecha && porId.size > 0 ? [] : await listarConOrderBy("puntoVenta", pvCanon);
    let usoFallback = docsPv === null;
    if (docsPv === null) {
      console.warn(
        "pos_ventas_cloud: sin índice compuesto; listando sin orderBy (despliega firestore.indexes.json)."
      );
      docsPv = await listarSinOrderBy("puntoVenta", pvCanon);
    }
    absorber(docsPv);

    if (!usarRangoFecha && porId.size < PAGE) {
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

    if (cacheKey) {
      rangoCache.set(cacheKey, { at: Date.now(), ventas });
    }

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
