/**
 * Registro de movimientos de inventario con Firestore Admin (solo servidor).
 * Evita permission-denied del cliente cuando las reglas de Firestore no están alineadas o fallan en transacciones.
 */
import type { App } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { idSaldoInventario, nuevoCostoUnitarioPromedioCargue } from "@/lib/inventario-pos-firestore";
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
    precioCompraUnitario?: number;
  }
): Promise<{ ok: true } | { ok: false; message: string }> {
  const pv = params.puntoVentaPerfil.trim();
  if (!pv) return { ok: false, message: "Falta punto de venta." };
  const delta = deltaPorTipo(params.tipo, params.cantidad);
  if (delta === 0) return { ok: false, message: "La cantidad debe ser mayor que cero." };
  if (params.tipo === "cargue") {
    const pc = Number(params.precioCompraUnitario);
    if (!Number.isFinite(pc) || pc <= 0) {
      return {
        ok: false,
        message: "Indicá el precio de compra unitario (mayor que cero) para registrar el cargue.",
      };
    }
  }

  const db = getFirestore(app);
  const saldoDocId = idSaldoInventario(pv, params.insumo.id);
  const saldoRef = db.collection(SALDOS).doc(saldoDocId);

  try {
    await db.runTransaction(async (t) => {
      const saldoSnap = await t.get(saldoRef);
      const prevData = saldoSnap.exists ? saldoSnap.data() : {};
      const anterior = Number(prevData?.cantidad) || 0;
      const costoPrevRaw = Number(prevData?.costoUnitarioPromedio);
      const costoBase = Number.isFinite(costoPrevRaw) && costoPrevRaw >= 0 ? costoPrevRaw : 0;
      const nueva = anterior + delta;
      if (!params.permitirNegativo && nueva < 0) {
        throw new Error("STOCK_NEGATIVO");
      }
      let costoNuevo = costoBase;
      if (params.tipo === "cargue" && delta > 0) {
        const p = Number(params.precioCompraUnitario);
        if (Number.isFinite(p) && p > 0) {
          costoNuevo = nuevoCostoUnitarioPromedioCargue(anterior, costoBase, delta, p);
        }
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
          costoUnitarioPromedio: costoNuevo,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      const precioDoc =
        params.tipo === "cargue" && params.precioCompraUnitario != null
          ? Math.round(Number(params.precioCompraUnitario) * 100) / 100
          : undefined;
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
        ...(precioDoc != null && Number.isFinite(precioDoc) && precioDoc > 0
          ? { precioCompraUnitario: precioDoc }
          : {}),
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
