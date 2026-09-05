import type { NextApiRequest, NextApiResponse } from "next";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getFirebaseAdminApp } from "@/lib/firebase-admin-server";
import { esContadorInvitado } from "@/lib/auth-roles";
import { puntoVentaCoincide } from "@/lib/punto-venta-clave";
import { ymdColombia } from "@/lib/fecha-colombia";
import {
  calcularIndice,
  fusionarAreasPreservandoRespuestasWms,
  listarAreasSeguimientoWms,
  normalizarRegistroMes,
  puedeEditarYmIndice,
  validarParaGuardar,
  type AreasCalificacionMap,
  type IndiceSatisfaccionMes,
} from "@/lib/indice-satisfaccion-franquiciado";
import {
  COL_INDICE_SATISFACCION,
  docIdIndiceSatisfaccion,
  puntoVentaClaveIndice,
} from "@/lib/pos-indice-satisfaccion-cloud";

type OkGetMes = { ok: true; registro: IndiceSatisfaccionMes | null };
type OkGetAnio = { ok: true; registros: IndiceSatisfaccionMes[] };
type OkPut = { ok: true; registro: IndiceSatisfaccionMes };
type Err = { ok: false; message: string };

async function authYPunto(req: NextApiRequest): Promise<
  | { ok: true; uid: string; pvUsuario: string; role: string | null }
  | { ok: false; status: number; message: string }
> {
  const app = getFirebaseAdminApp();
  if (!app) {
    return {
      ok: false,
      status: 503,
      message: "Firebase Admin no configurado (FIREBASE_SERVICE_ACCOUNT_JSON).",
    };
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) {
    return { ok: false, status: 401, message: "Falta Authorization Bearer." };
  }

  let uid: string;
  try {
    uid = (await getAuth(app).verifyIdToken(token)).uid;
  } catch {
    return { ok: false, status: 401, message: "Sesión inválida o token expirado." };
  }

  const db = getFirestore(app);
  const userSnap = await db.collection("users").doc(uid).get();
  const userData = userSnap.data() ?? {};
  const role = typeof userData.role === "string" ? userData.role : null;
  const pvUsuario =
    typeof userData.puntoVenta === "string" && userData.puntoVenta.trim()
      ? userData.puntoVenta.trim()
      : "";
  if (!pvUsuario) {
    return { ok: false, status: 400, message: "Tu usuario no tiene punto de venta asignado." };
  }

  return { ok: true, uid, pvUsuario, role };
}

function docARegistro(ym: string, data: Record<string, unknown>): IndiceSatisfaccionMes {
  return normalizarRegistroMes(ym, {
    ym,
    areas: data.areas,
    guardadoAt: data.guardadoAt,
    indice: data.indice,
  });
}

/**
 * GET — ?puntoVenta=&ym=YYYY-MM → un mes
 * GET — ?puntoVenta=&anio=YYYY → todos los meses del año
 * PUT — body { puntoVenta, ym, areas } → guarda (franquiciado; no contador)
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<OkGetMes | OkGetAnio | OkPut | Err>
) {
  if (req.method !== "GET" && req.method !== "PUT") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  const auth = await authYPunto(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, message: auth.message });
  }

  const app = getFirebaseAdminApp();
  if (!app) {
    return res.status(503).json({
      ok: false,
      message: "Firebase Admin no configurado (FIREBASE_SERVICE_ACCOUNT_JSON).",
    });
  }
  const db = getFirestore(app);

  if (req.method === "GET") {
    const puntoVenta =
      typeof req.query.puntoVenta === "string" ? req.query.puntoVenta.trim() : "";
    if (!puntoVenta || !puntoVentaCoincide(puntoVenta, auth.pvUsuario)) {
      return res.status(403).json({ ok: false, message: "El punto de venta no coincide con tu sesión." });
    }

    const ym = typeof req.query.ym === "string" ? req.query.ym.trim() : "";
    const anioRaw = typeof req.query.anio === "string" ? req.query.anio.trim() : "";

    try {
      if (ym) {
        if (!/^\d{4}-\d{2}$/.test(ym)) {
          return res.status(400).json({ ok: false, message: "ym inválido (use YYYY-MM)." });
        }
        const snap = await db.collection(COL_INDICE_SATISFACCION).doc(docIdIndiceSatisfaccion(auth.pvUsuario, ym)).get();
        if (!snap.exists) {
          return res.status(200).json({ ok: true, registro: null });
        }
        return res.status(200).json({
          ok: true,
          registro: docARegistro(ym, (snap.data() ?? {}) as Record<string, unknown>),
        });
      }

      const anio = Number(anioRaw);
      if (!Number.isFinite(anio) || anio < 2000 || anio > 2100) {
        return res.status(400).json({ ok: false, message: "Indique ym=YYYY-MM o anio=YYYY." });
      }

      const prefijo = `${anio}-`;
      const pvClave = puntoVentaClaveIndice(auth.pvUsuario);
      const snap = await db
        .collection(COL_INDICE_SATISFACCION)
        .where("puntoVentaClave", "==", pvClave)
        .get();

      const registros = snap.docs
        .map((d) => {
          const data = d.data() as Record<string, unknown>;
          const y = typeof data.ym === "string" ? data.ym : "";
          return docARegistro(y, data);
        })
        .filter((r) => r.guardadoAt && r.ym.startsWith(prefijo));

      return res.status(200).json({ ok: true, registros });
    } catch (e) {
      console.error("pos_indice_satisfaccion GET", e);
      return res.status(500).json({
        ok: false,
        message: e instanceof Error ? e.message : "No se pudo leer el índice.",
      });
    }
  }

  // PUT
  if (esContadorInvitado(auth.role)) {
    return res.status(403).json({
      ok: false,
      message: "Las cuentas de contador no registran el índice de satisfacción.",
    });
  }

  const body = (typeof req.body === "object" && req.body !== null ? req.body : {}) as Record<string, unknown>;
  const puntoVenta = typeof body.puntoVenta === "string" ? body.puntoVenta.trim() : "";
  const ym = typeof body.ym === "string" ? body.ym.trim() : "";
  if (!puntoVenta || !puntoVentaCoincide(puntoVenta, auth.pvUsuario)) {
    return res.status(403).json({ ok: false, message: "El punto de venta no coincide con tu sesión." });
  }
  if (!/^\d{4}-\d{2}$/.test(ym)) {
    return res.status(400).json({ ok: false, message: "ym inválido (use YYYY-MM)." });
  }
  if (!puedeEditarYmIndice(ym, ymdColombia())) {
    return res.status(400).json({
      ok: false,
      message:
        "Solo puede calificar el mes en curso, o el mes anterior durante los primeros 15 días del mes actual.",
    });
  }

  const borrador = normalizarRegistroMes(ym, { areas: body.areas });
  const err = validarParaGuardar(borrador.areas);
  if (err) {
    return res.status(400).json({
      ok: false,
      message:
        err.tipo === "incompleto"
          ? `Faltan ${err.faltan.length} área(s) por calificar.`
          : err.mensaje,
    });
  }

  const docRef = db.collection(COL_INDICE_SATISFACCION).doc(docIdIndiceSatisfaccion(auth.pvUsuario, ym));
  let prevAreas: AreasCalificacionMap | null = null;
  try {
    const prevSnap = await docRef.get();
    if (prevSnap.exists) {
      prevAreas = normalizarRegistroMes(ym, prevSnap.data() as Record<string, unknown>).areas;
    }
  } catch {
    prevAreas = null;
  }

  const areasMerged = fusionarAreasPreservandoRespuestasWms(borrador.areas, prevAreas);
  const indice = calcularIndice(areasMerged);
  const seguimientoWmsAreaIds = listarAreasSeguimientoWms(areasMerged);
  const guardadoAt = new Date().toISOString();
  const pvClave = puntoVentaClaveIndice(auth.pvUsuario);
  const registro: IndiceSatisfaccionMes = {
    ym,
    areas: areasMerged,
    guardadoAt,
    indice,
    seguimientoWmsAreaIds,
  };

  try {
    await docRef.set(
      {
        puntoVenta: auth.pvUsuario,
        puntoVentaClave: pvClave,
        ym,
        areas: registro.areas,
        indice: registro.indice,
        guardadoAt,
        seguimientoWmsAreaIds,
        /** true si hay al menos un área ≤3 pendiente de respuesta WMS */
        seguimientoWmsPendiente: seguimientoWmsAreaIds.some(
          (id) => registro.areas[id]?.respuestaWms?.estado !== "respondida"
        ),
        uid: auth.uid,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return res.status(200).json({ ok: true, registro });
  } catch (e) {
    console.error("pos_indice_satisfaccion PUT", e);
    return res.status(500).json({
      ok: false,
      message: e instanceof Error ? e.message : "No se pudo guardar en la nube.",
    });
  }
}
