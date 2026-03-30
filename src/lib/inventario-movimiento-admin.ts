/**
 * Registro de movimientos de inventario con Firestore Admin (solo servidor).
 * Evita permission-denied del cliente cuando las reglas de Firestore no están alineadas o fallan en transacciones.
 */
import type { App } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { idSaldoInventario } from "@/lib/inventario-pos-firestore";
import { mediodiaColombiaDesdeYmd, ymdColombia } from "@/lib/fecha-colombia";
import type { InsumoKitItem, TipoMovimientoInventario } from "@/types/inventario-pos";

const SALDOS = "posInventarioSaldos";
const MOVS = "posInventarioMovimientos";

function deltaPorTipo(tipo: TipoMovimientoInventario, cantidad: number): number {
  const c = Math.abs(cantidad);
  switch (tipo) {
    case "cargue":
    case "ajuste_positivo":
      return c;
    case "salida_danio":
    case "ajuste_negativo":
    case "merma":
    case "consumo_interno":
    case "venta_ensamble":
      return -c;
    default:
      return 0;
  }
}

function fechaCargueValida(iso: string | undefined): string | undefined {
  if (iso == null || !iso.trim()) return undefined;
  const s = iso.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const dt = mediodiaColombiaDesdeYmd(s);
  if (Number.isNaN(dt.getTime()) || ymdColombia(dt) !== s) return undefined;
  return s;
}

export async function registrarMovimientoInventarioAdmin(
  app: App,
  params: {
    uid: string;
    email: string | null;
    puntoVentaPerfil: string;
    insumo: InsumoKitItem;
    tipo: TipoMovimientoInventario;
    cantidad: number;
    notas: string;
    permitirNegativo?: boolean;
    fechaCargue?: string;
  }
): Promise<{ ok: true } | { ok: false; message: string }> {
  const pv = params.puntoVentaPerfil.trim();
  if (!pv) return { ok: false, message: "Falta punto de venta." };
  const delta = deltaPorTipo(params.tipo, params.cantidad);
  if (delta === 0) return { ok: false, message: "La cantidad debe ser mayor que cero." };

  const db = getFirestore(app);
  const saldoDocId = idSaldoInventario(pv, params.insumo.id);
  const saldoRef = db.collection(SALDOS).doc(saldoDocId);

  try {
    await db.runTransaction(async (t) => {
      const saldoSnap = await t.get(saldoRef);
      const anterior = saldoSnap.exists ? Number(saldoSnap.data()?.cantidad) || 0 : 0;
      const nueva = anterior + delta;
      if (!params.permitirNegativo && nueva < 0) {
        throw new Error("STOCK_NEGATIVO");
      }
      const movRef = db.collection(MOVS).doc();
      const fechaCargueNorm = fechaCargueValida(params.fechaCargue);
      t.set(
        saldoRef,
        {
          puntoVenta: pv,
          insumoId: params.insumo.id,
          insumoSku: params.insumo.sku,
          cantidad: nueva,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      t.set(movRef, {
        puntoVenta: pv,
        insumoId: params.insumo.id,
        insumoSku: params.insumo.sku,
        insumoDescripcion: params.insumo.descripcion,
        tipo: params.tipo,
        delta,
        cantidadAnterior: anterior,
        cantidadNueva: nueva,
        notas: params.notas.trim().slice(0, 500),
        ...(fechaCargueNorm ? { fechaCargue: fechaCargueNorm } : {}),
        uid: params.uid,
        email: params.email,
        createdAt: FieldValue.serverTimestamp(),
      });
    });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "STOCK_NEGATIVO") {
      return {
        ok: false,
        message: "Stock insuficiente para esta salida. Revisa el saldo o usa ajuste a más primero.",
      };
    }
    return { ok: false, message: e instanceof Error ? e.message : "No se pudo registrar el movimiento." };
  }
}
