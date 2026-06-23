import type { NextApiRequest, NextApiResponse } from "next";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getFirebaseAdminApp, getCreadorFirestoreContext } from "@/lib/firebase-admin-server";
import { getWmsPublicBaseUrl } from "@/lib/wms-public-base";
import { normPuntoVentaCatalogo } from "@/lib/punto-venta-catalogo-norm";
import { normalizarPrefijoFactura, soloDigitosDian } from "@/lib/dian-habilitacion-campos";
import { POS_CONTADOR_ROLE } from "@/lib/auth-roles";

/** Colección visible para administración (Grupo Bacatá / WMS) por punto de venta. */
export const POS_DIAN_HABILITACION_COLLECTION = "posDianHabilitacion";

/** Bandeja de notificaciones en el POS (por usuario cajero). */
export const POS_NOTIFICACIONES_CAJA_COLLECTION = "posNotificacionesCaja";

const CONSECUTIVO_FE_INICIAL = "1";

function docIdFromPuntoVenta(puntoVenta: string): string {
  return normPuntoVentaCatalogo(puntoVenta).replace(/\s+/g, "_").replace(/[^\w-]/g, "") || "sin_pv";
}

function normalizarTestSetId(raw: string): string {
  return raw.trim().replace(/\s+/g, "");
}

function leerCamposHabilitacion(body: Record<string, unknown>) {
  const dianTestSetId = normalizarTestSetId(String(body.dianTestSetId ?? ""));
  const dianResolutionNumber = soloDigitosDian(String(body.dianResolutionNumber ?? ""));
  const prefijoFactura = normalizarPrefijoFactura(String(body.prefijoFactura ?? ""));
  const consecutivoDesde = CONSECUTIVO_FE_INICIAL;
  const consecutivoHasta = soloDigitosDian(String(body.consecutivoHasta ?? ""));
  return { dianTestSetId, dianResolutionNumber, prefijoFactura, consecutivoDesde, consecutivoHasta };
}

function mensajeAdminHabilitacion(
  puntoVenta: string,
  campos: ReturnType<typeof leerCamposHabilitacion>
): string {
  const lineas = [
    "[DIAN · Habilitación punto]",
    `Punto: ${puntoVenta}`,
    `TestSetId: ${campos.dianTestSetId}`,
    `Número de resolución DIAN: ${campos.dianResolutionNumber}`,
    `Prefijo de facturación: ${campos.prefijoFactura}`,
  ];
  if (campos.consecutivoDesde || campos.consecutivoHasta) {
    lineas.push(
      `Rango de consecutivos autorizado: ${campos.consecutivoDesde || "—"} al ${campos.consecutivoHasta || "—"}`
    );
  }
  lineas.push(
    "El franquiciado confirmó estos datos.",
    "Registrar en Alegra / asociar prefijos en la DIAN."
  );
  return lineas.join("\n");
}

function camposDesdeFirestore(data: Record<string, unknown>) {
  return {
    dianTestSetId: String(data.dianTestSetId ?? "").trim(),
    dianResolutionNumber: String(data.dianResolutionNumber ?? "").trim(),
    prefijoFactura: String(data.prefijoFactura ?? "").trim(),
    consecutivoDesde: CONSECUTIVO_FE_INICIAL,
    consecutivoHasta: String(data.consecutivoHasta ?? "").trim(),
  };
}

async function notificarAdminEnWms(params: {
  token: string;
  puntoVenta: string;
  campos: ReturnType<typeof leerCamposHabilitacion>;
  uid: string;
}): Promise<{ ok: boolean; canal?: string }> {
  const base = getWmsPublicBaseUrl().replace(/\/$/, "");
  const headers: HeadersInit = {
    Authorization: `Bearer ${params.token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  const mensaje = mensajeAdminHabilitacion(params.puntoVenta, params.campos);
  const payload = {
    tipo: "dian_test_set_registrado",
    puntoVenta: params.puntoVenta,
    ...params.campos,
    mensaje,
    senderUid: params.uid,
  };

  const rutasAdmin = [
    "/api/pos/notificaciones/admin",
    "/api/pos/dian-habilitacion/registrar-test-set",
  ];

  for (const path of rutasAdmin) {
    try {
      const res = await fetch(`${base}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (res.ok && data.ok !== false) {
        return { ok: true, canal: path };
      }
    } catch {
      /* siguiente ruta */
    }
  }

  try {
    const res = await fetch(`${base}/api/pos/caja-mensajes/responder`, {
      method: "POST",
      headers,
      body: JSON.stringify({ text: mensaje }),
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean };
    if (res.ok && data.ok !== false) {
      return { ok: true, canal: "/api/pos/caja-mensajes/responder" };
    }
  } catch {
    /* ignore */
  }

  return { ok: false };
}

/**
 * GET/PUT datos de habilitación DIAN (paso 1) por punto de venta.
 * PUT con `confirmar` + `enviarABacata`: guarda, notifica WMS y crea aviso en bandeja POS.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "PUT") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const app = getFirebaseAdminApp();
  if (!app) {
    return res.status(503).json({
      ok: false,
      error: "Firestore Admin no configurado (FIREBASE_SERVICE_ACCOUNT_JSON).",
    });
  }

  const token = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7).trim()
    : "";
  if (!token) {
    return res.status(401).json({ ok: false, error: "Sin sesión." });
  }

  const ctx = await getCreadorFirestoreContext(app, token);
  if (!ctx.ok) {
    return res.status(401).json({ ok: false, error: ctx.message });
  }
  if (ctx.role === POS_CONTADOR_ROLE) {
    return res.status(403).json({ ok: false, error: "Las cuentas de contador no registran habilitación DIAN." });
  }
  if (!ctx.puntoVenta) {
    return res.status(400).json({ ok: false, error: "Tu usuario no tiene punto de venta asignado." });
  }

  const db = getFirestore(app);
  const puntoVenta = ctx.puntoVenta;
  const docId = docIdFromPuntoVenta(puntoVenta);
  const ref = db.collection(POS_DIAN_HABILITACION_COLLECTION).doc(docId);

  if (req.method === "GET") {
    try {
      const snap = await ref.get();
      if (!snap.exists) {
        return res.status(200).json({
          ok: true,
          dianTestSetId: "",
          dianResolutionNumber: "",
          prefijoFactura: "",
          consecutivoDesde: CONSECUTIVO_FE_INICIAL,
          consecutivoHasta: "",
          puntoVenta,
          updatedAt: null,
          enviadoABacataAt: null,
        });
      }
      const data = snap.data() ?? {};
      return res.status(200).json({
        ok: true,
        ...camposDesdeFirestore(data),
        puntoVenta: String(data.puntoVenta ?? puntoVenta),
        updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() ?? null,
        enviadoABacataAt: data.enviadoABacataAt?.toDate?.()?.toISOString?.() ?? null,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Error al leer";
      return res.status(500).json({ ok: false, error: message });
    }
  }

  const body = typeof req.body === "object" && req.body ? req.body : {};
  const campos = leerCamposHabilitacion(body);
  const enviarABacata = Boolean(body.enviarABacata ?? body.confirmar);

  if (!campos.dianTestSetId) {
    return res.status(400).json({ ok: false, error: "Pegá el identificador del set de pruebas que te dio la DIAN." });
  }
  if (campos.dianTestSetId.length > 80) {
    return res.status(400).json({ ok: false, error: "El identificador del set de pruebas es demasiado largo." });
  }
  if (enviarABacata && campos.dianResolutionNumber.length < 5) {
    return res.status(400).json({ ok: false, error: "Ingresá el número de resolución DIAN (mínimo 5 dígitos)." });
  }
  if (enviarABacata && !campos.prefijoFactura) {
    return res.status(400).json({ ok: false, error: "Ingresá el prefijo de facturación (ej. FE)." });
  }
  if (
    enviarABacata &&
    campos.consecutivoDesde &&
    campos.consecutivoHasta &&
    Number(campos.consecutivoDesde) > Number(campos.consecutivoHasta)
  ) {
    return res.status(400).json({ ok: false, error: "El consecutivo «desde» no puede ser mayor que el «hasta»." });
  }

  try {
    const ahora = FieldValue.serverTimestamp();
    const patch: Record<string, unknown> = {
      puntoVenta,
      puntoVentaNorm: normPuntoVentaCatalogo(puntoVenta),
      ...campos,
      updatedAt: ahora,
      updatedByUid: ctx.uid,
    };

    let notificacionAdmin = false;
    let canalAdmin: string | undefined;
    let notificacionPos = false;

    if (enviarABacata) {
      patch.enviadoABacataAt = ahora;
      patch.estado = "pendiente_configuracion_bacata";

      const admin = await notificarAdminEnWms({
        token,
        puntoVenta,
        campos,
        uid: ctx.uid,
      });
      notificacionAdmin = admin.ok;
      canalAdmin = admin.canal;

      await db.collection(POS_NOTIFICACIONES_CAJA_COLLECTION).add({
        uid: ctx.uid,
        puntoVenta,
        tipo: "dian_test_set_registrado",
        titulo: "Datos DIAN enviados a Grupo Bacatá",
        mensaje: `TestSetId, resolución ${campos.dianResolutionNumber} y prefijo ${campos.prefijoFactura}. Administración fue notificada.`,
        ...campos,
        leida: false,
        createdAt: ahora,
      });
      notificacionPos = true;
    }

    await ref.set(patch, { merge: true });

    return res.status(200).json({
      ok: true,
      ...campos,
      puntoVenta,
      enviadoABacata: enviarABacata,
      notificacionAdmin,
      notificacionPos,
      ...(canalAdmin ? { canalAdmin } : {}),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error al guardar";
    return res.status(500).json({ ok: false, error: message });
  }
}
