import type { NextApiRequest, NextApiResponse } from "next";
import { getAuth } from "firebase-admin/auth";
import { getFirebaseAdminApp, getCreadorFirestoreContext } from "@/lib/firebase-admin-server";
import { POS_CONTADOR_ROLE } from "@/lib/auth-roles";
import { registrarMovimientoInventarioAdmin } from "@/lib/inventario-movimiento-admin";
import type { InsumoKitItem, TipoMovimientoInventario } from "@/types/inventario-pos";

const TIPOS: TipoMovimientoInventario[] = [
  "cargue",
  "salida_danio",
  "ajuste_positivo",
  "ajuste_negativo",
  "merma",
  "consumo_interno",
];

function parseInsumo(body: Record<string, unknown>): InsumoKitItem | null {
  const ins = body.insumo;
  if (!ins || typeof ins !== "object") return null;
  const o = ins as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id.trim() : "";
  const sku = typeof o.sku === "string" ? o.sku.trim() : "";
  const descripcion = typeof o.descripcion === "string" ? o.descripcion.trim() : "";
  const unidad = typeof o.unidad === "string" && o.unidad.trim() ? o.unidad.trim() : "und";
  if (!id || !sku || !descripcion) return null;
  const categoria = typeof o.categoria === "string" ? o.categoria.trim() : undefined;
  return {
    id,
    sku,
    descripcion,
    unidad,
    ...(categoria ? { categoria } : {}),
  };
}

/**
 * POST: registra un movimiento de inventario (cargue, salidas, ajustes) con Firestore Admin.
 * El cliente sigue enviando el mismo cuerpo que `registrarMovimientoInventario`; así se evitan
 * errores permission-denied de las reglas del SDK web.
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
        "FIREBASE_SERVICE_ACCOUNT_JSON no está configurada en el servidor. El POS intentará guardar desde el navegador.",
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
    return res.status(403).json({
      ok: false,
      message: "Las cuentas de contador no pueden registrar movimientos de inventario.",
    });
  }
  if (!ctx.puntoVenta) {
    return res.status(400).json({
      ok: false,
      message: "Tu perfil no tiene punto de venta. Configúralo antes de registrar inventario.",
    });
  }

  let emailUsuario: string | null = null;
  try {
    const dec = await getAuth(app).verifyIdToken(token);
    emailUsuario = dec.email ?? null;
  } catch {
    /* ctx ya validó el token */
  }

  const b = req.body as Record<string, unknown>;
  const pvBody = typeof b.puntoVenta === "string" ? b.puntoVenta.trim() : "";
  if (pvBody !== ctx.puntoVenta) {
    return res.status(403).json({
      ok: false,
      message: "El punto de venta enviado no coincide con tu perfil. Recargá la página o revisá tu usuario en Firestore.",
    });
  }

  const tipo = b.tipo as TipoMovimientoInventario;
  if (!TIPOS.includes(tipo)) {
    return res.status(400).json({ ok: false, message: "Tipo de movimiento inválido." });
  }

  const insumo = parseInsumo(b);
  if (!insumo) {
    return res.status(400).json({ ok: false, message: "Datos de insumo incompletos." });
  }

  const cantidad = typeof b.cantidad === "number" ? b.cantidad : Number(b.cantidad);
  if (!Number.isFinite(cantidad)) {
    return res.status(400).json({ ok: false, message: "Cantidad inválida." });
  }

  const notas = typeof b.notas === "string" ? b.notas : "";
  const fechaCargue = typeof b.fechaCargue === "string" ? b.fechaCargue.trim() : undefined;
  const permitirNegativo = b.permitirNegativo === true;
  const precioRaw = b.precioCompraUnitario;
  const precioCompraUnitario =
    typeof precioRaw === "number" ? precioRaw : precioRaw != null ? Number(precioRaw) : undefined;

  if (tipo === "cargue") {
    if (!Number.isFinite(precioCompraUnitario) || (precioCompraUnitario as number) <= 0) {
      return res.status(400).json({
        ok: false,
        message: "El precio de compra unitario es obligatorio y debe ser mayor que cero.",
      });
    }
  }

  const r = await registrarMovimientoInventarioAdmin(app, {
    uid: ctx.uid,
    email: emailUsuario,
    puntoVentaPerfil: ctx.puntoVenta,
    insumo,
    tipo,
    cantidad,
    notas,
    permitirNegativo,
    fechaCargue: fechaCargue || undefined,
    ...(tipo === "cargue" && Number.isFinite(precioCompraUnitario)
      ? { precioCompraUnitario: precioCompraUnitario as number }
      : {}),
  });

  if (!r.ok) {
    return res.status(400).json({ ok: false, message: r.message });
  }
  return res.status(200).json({ ok: true });
}
