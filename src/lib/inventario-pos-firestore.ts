import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  runTransaction,
  serverTimestamp,
  where,
  orderBy,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { InsumoKitItem, InventarioMovimientoDoc, TipoMovimientoInventario } from "@/types/inventario-pos";

/** Catálogo maestro de insumos / kit por franquicia (origen de productos del inventario POS). */
export const CATALOGO_INSUMOS_KIT_COLLECTION = "DB_Franquicia_Insumos_Kit";

/**
 * Campo booleano opcional: `true` = insumo visible en todos los PV (consulta indexada).
 * Alternativa: `pos_catalogo_global` (snake_case).
 */
export const CATALOGO_CAMPO_GLOBAL = "posCatalogoGlobal";

/**
 * Array opcional de códigos de PV + sentinel `"__ALL__"` para globales (una consulta indexada).
 */
export const CATALOGO_CAMPO_PV_CODES = "posCatalogoPvCodes";

/** Saldos por punto de venta + ítem de catálogo. */
export const POS_INVENTARIO_SALDOS_COLLECTION = "posInventarioSaldos";

/** Bitácora de movimientos (cargue, salidas, ajustes). */
export const POS_INVENTARIO_MOVIMIENTOS_COLLECTION = "posInventarioMovimientos";

function str(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return String(v).trim();
}

/**
 * Campos de documento Firestore que asignan un insumo a un punto de venta.
 * Si ninguno viene con valor, el ítem es de catálogo global (todos los PV lo ven).
 */
const CATALOGO_PV_FIELD_KEYS = [
  "puntoVenta",
  "PuntoVenta",
  "punto_venta",
  "PV",
  "pv",
  "Codigo_punto",
  "codigo_punto",
  "codigoPunto",
  "sucursal",
  "franquicia",
  "tienda",
] as const;

/**
 * Incluye el documento si: no tiene punto de venta definido (global) o coincide con `puntoVenta`.
 */
function matchesPuntoVenta(data: Record<string, unknown>, puntoVenta: string): boolean {
  const pv = puntoVenta.trim().toLowerCase();
  if (!pv) return true;

  let algunCampoPvDefinido = false;
  for (const k of CATALOGO_PV_FIELD_KEYS) {
    const v = str(data[k]).toLowerCase();
    if (v) {
      algunCampoPvDefinido = true;
      if (v === pv) return true;
    }
  }
  if (!algunCampoPvDefinido) return true;
  return false;
}

/** Normaliza un documento de la colección de insumos a `InsumoKitItem`. */
export function normalizarDocInsumoKit(id: string, data: Record<string, unknown>): InsumoKitItem {
  const sku =
    str(data.sku) ||
    str(data.SKU) ||
    str(data.Codigo) ||
    str(data.codigo) ||
    str(data.Codigo_insumo) ||
    id;
  const descripcion =
    str(data.descripcion) ||
    str(data.Descripcion) ||
    str(data.nombre) ||
    str(data.Nombre) ||
    str(data.Nombre_producto) ||
    str(data.nombre_producto) ||
    sku;
  const unidad = str(data.unidad) || str(data.Unidad) || str(data.UM) || "und";
  const categoria = str(data.categoria) || str(data.Categoria) || str(data.Rubro) || undefined;
  const puntoVentaOrigen =
    str(data.puntoVenta) ||
    str(data.PuntoVenta) ||
    str(data.PV) ||
    str(data.pv) ||
    str(data.codigo_punto) ||
    str(data.sucursal) ||
    str(data.tienda) ||
    undefined;
  return { id, sku, descripcion, unidad, categoria, puntoVentaOrigen };
}

function readCatalogQueryLimit(): number {
  if (typeof process === "undefined") return 500;
  const raw = process.env.NEXT_PUBLIC_POS_CATALOGO_FIRESTORE_LIMIT?.trim();
  const n = raw ? parseInt(raw, 10) : 500;
  if (!Number.isFinite(n) || n < 50) return 500;
  return Math.min(n, 1000);
}

function readLegacyScanLimit(): number {
  if (typeof process === "undefined") return 2500;
  const raw = process.env.NEXT_PUBLIC_POS_CATALOGO_LEGACY_SCAN_LIMIT?.trim();
  const n = raw ? parseInt(raw, 10) : 2500;
  if (!Number.isFinite(n) || n < 0) return 2500;
  return Math.min(n, 5000);
}

function useFirestoreCatalogIndexedOnly(): boolean {
  if (typeof process === "undefined") return false;
  const v = process.env.NEXT_PUBLIC_POS_CATALOGO_FIRESTORE_INDEXED_ONLY?.trim();
  return v === "1" || v?.toLowerCase() === "true";
}

/**
 * Lista insumos del catálogo para este punto de venta.
 *
 * 1) Consultas indexadas en paralelo: cada campo PV común con `== pv`, `posCatalogoGlobal == true`,
 *    `posCatalogoPvCodes` array-contains-any `[pv, "__ALL__"]`.
 * 2) Si `NEXT_PUBLIC_POS_CATALOGO_FIRESTORE_INDEXED_ONLY` no es true, añade un escaneo acotado + filtro
 *    `matchesPuntoVenta` para documentos antiguos sin campos de índice.
 */
export async function listarInsumosKitPorPuntoVenta(puntoVenta: string): Promise<InsumoKitItem[]> {
  if (!db) return [];
  const pv = puntoVenta.trim();
  if (!pv) return [];

  const col = collection(db, CATALOGO_INSUMOS_KIT_COLLECTION);
  const merged = new Map<string, InsumoKitItem>();
  const lim = readCatalogQueryLimit();

  const ingestSnap = (snap: Awaited<ReturnType<typeof getDocs>>) => {
    snap.forEach((d) => {
      merged.set(d.id, normalizarDocInsumoKit(d.id, d.data() as Record<string, unknown>));
    });
  };

  const runQuery = async (q: ReturnType<typeof query>) => {
    try {
      const snap = await getDocs(q);
      ingestSnap(snap);
    } catch {
      // Campo ausente, índice compuesto pendiente o reglas: ignorar esta rama
    }
  };

  const tasks: Promise<void>[] = [];

  for (const field of CATALOGO_PV_FIELD_KEYS) {
    tasks.push(runQuery(query(col, where(field, "==", pv), limit(lim))));
  }

  tasks.push(runQuery(query(col, where(CATALOGO_CAMPO_GLOBAL, "==", true), limit(lim))));
  tasks.push(runQuery(query(col, where("pos_catalogo_global", "==", true), limit(lim))));

  tasks.push(
    (async () => {
      try {
        const snap = await getDocs(
          query(col, where(CATALOGO_CAMPO_PV_CODES, "array-contains-any", [pv, "__ALL__"]), limit(lim))
        );
        ingestSnap(snap);
      } catch {
        /* sin campo o tipo incorrecto */
      }
    })()
  );

  await Promise.all(tasks);

  if (!useFirestoreCatalogIndexedOnly()) {
    try {
      const legacyLim = readLegacyScanLimit();
      const snap = await getDocs(query(col, limit(legacyLim)));
      snap.forEach((d) => {
        if (merged.has(d.id)) return;
        const raw = d.data() as Record<string, unknown>;
        if (matchesPuntoVenta(raw, pv)) {
          merged.set(d.id, normalizarDocInsumoKit(d.id, raw));
        }
      });
    } catch {
      // ignore
    }
  }

  const out = Array.from(merged.values());
  out.sort((a, b) => a.descripcion.localeCompare(b.descripcion, "es"));
  return out;
}

export function idSaldoInventario(puntoVenta: string, insumoId: string): string {
  const safePv = puntoVenta.trim().replace(/\//g, "|");
  return `${safePv}__${insumoId}`;
}

export async function obtenerSaldosPorPuntoVenta(
  puntoVenta: string
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!db) return map;
  const pv = puntoVenta.trim();
  if (!pv) return map;
  try {
    const q = query(collection(db, POS_INVENTARIO_SALDOS_COLLECTION), where("puntoVenta", "==", pv));
    const snap = await getDocs(q);
    snap.forEach((d) => {
      const x = d.data();
      const insumoId = str(x.insumoId);
      const c = Number(x.cantidad);
      if (insumoId) map.set(insumoId, Number.isFinite(c) ? c : 0);
    });
  } catch {
    // ignore
  }
  return map;
}

export async function listarMovimientosInventario(
  puntoVenta: string,
  max: number = 80
): Promise<InventarioMovimientoDoc[]> {
  if (!db) return [];
  const pv = puntoVenta.trim();
  if (!pv) return [];
  try {
    const q = query(
      collection(db, POS_INVENTARIO_MOVIMIENTOS_COLLECTION),
      where("puntoVenta", "==", pv),
      orderBy("createdAt", "desc"),
      limit(max)
    );
    const snap = await getDocs(q);
    const out: InventarioMovimientoDoc[] = [];
    snap.forEach((d) => {
      const x = d.data();
      out.push({
        id: d.id,
        puntoVenta: str(x.puntoVenta),
        insumoId: str(x.insumoId),
        insumoSku: str(x.insumoSku),
        insumoDescripcion: str(x.insumoDescripcion),
        tipo: x.tipo as TipoMovimientoInventario,
        delta: Number(x.delta) || 0,
        cantidadAnterior: Number(x.cantidadAnterior) || 0,
        cantidadNueva: Number(x.cantidadNueva) || 0,
        notas: str(x.notas),
        fechaCargue: str(x.fechaCargue) || undefined,
        uid: str(x.uid),
        email: x.email != null ? str(x.email) : null,
        createdAt: x.createdAt,
      });
    });
    return out;
  } catch {
    try {
      const q2 = query(
        collection(db, POS_INVENTARIO_MOVIMIENTOS_COLLECTION),
        where("puntoVenta", "==", pv),
        limit(max)
      );
      const snap = await getDocs(q2);
      const out: InventarioMovimientoDoc[] = [];
      snap.forEach((d) => {
        const x = d.data();
        out.push({
          id: d.id,
          puntoVenta: str(x.puntoVenta),
          insumoId: str(x.insumoId),
          insumoSku: str(x.insumoSku),
          insumoDescripcion: str(x.insumoDescripcion),
          tipo: x.tipo as TipoMovimientoInventario,
          delta: Number(x.delta) || 0,
          cantidadAnterior: Number(x.cantidadAnterior) || 0,
          cantidadNueva: Number(x.cantidadNueva) || 0,
          notas: str(x.notas),
          fechaCargue: str(x.fechaCargue) || undefined,
          uid: str(x.uid),
          email: x.email != null ? str(x.email) : null,
          createdAt: x.createdAt,
        });
      });
      out.sort((a, b) => {
        const sa = a.createdAt && typeof (a.createdAt as { seconds?: number }).seconds === "number" ? (a.createdAt as { seconds: number }).seconds : 0;
        const sb = b.createdAt && typeof (b.createdAt as { seconds?: number }).seconds === "number" ? (b.createdAt as { seconds: number }).seconds : 0;
        return sb - sa;
      });
      return out.slice(0, max);
    } catch {
      return [];
    }
  }
}

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
      return -c;
    default:
      return 0;
  }
}

const ETIQUETA_TIPO: Record<TipoMovimientoInventario, string> = {
  cargue: "Cargue / entrada",
  salida_danio: "Salida por daño (autorizada)",
  ajuste_positivo: "Ajuste a más (conteo)",
  ajuste_negativo: "Ajuste a menos (conteo)",
  merma: "Merma / vencimiento",
  consumo_interno: "Consumo interno / uso en tienda",
};

export function etiquetaTipoMovimiento(tipo: TipoMovimientoInventario): string {
  return ETIQUETA_TIPO[tipo] ?? tipo;
}

function fechaCargueValida(iso: string | undefined): string | undefined {
  if (iso == null || !iso.trim()) return undefined;
  const s = iso.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const [y, mo, d] = s.split("-").map(Number);
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return undefined;
  return s;
}

export async function registrarMovimientoInventario(params: {
  puntoVenta: string;
  insumo: InsumoKitItem;
  tipo: TipoMovimientoInventario;
  cantidad: number;
  notas: string;
  uid: string;
  email: string | null;
  permitirNegativo?: boolean;
  /** Fecha del cargue (solo informativa; YYYY-MM-DD). */
  fechaCargue?: string;
}): Promise<{ ok: boolean; message?: string }> {
  if (!db) return { ok: false, message: "Firestore no está disponible." };
  const pv = params.puntoVenta.trim();
  if (!pv) return { ok: false, message: "Falta punto de venta." };
  const delta = deltaPorTipo(params.tipo, params.cantidad);
  if (delta === 0) return { ok: false, message: "La cantidad debe ser mayor que cero." };

  const saldoDocId = idSaldoInventario(pv, params.insumo.id);
  const saldoRef = doc(db, POS_INVENTARIO_SALDOS_COLLECTION, saldoDocId);
  const movsCol = collection(db, POS_INVENTARIO_MOVIMIENTOS_COLLECTION);

  try {
    await runTransaction(db, async (transaction) => {
      const saldoSnap = await transaction.get(saldoRef);
      const anterior = saldoSnap.exists() ? Number(saldoSnap.data()?.cantidad) || 0 : 0;
      const nueva = anterior + delta;
      if (!params.permitirNegativo && nueva < 0) {
        throw new Error("STOCK_NEGATIVO");
      }
      const movRef = doc(movsCol);
      const fechaCargueNorm = fechaCargueValida(params.fechaCargue);
      transaction.set(
        saldoRef,
        {
          puntoVenta: pv,
          insumoId: params.insumo.id,
          insumoSku: params.insumo.sku,
          cantidad: nueva,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      transaction.set(movRef, {
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
        createdAt: serverTimestamp(),
      });
    });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "STOCK_NEGATIVO") {
      return { ok: false, message: "Stock insuficiente para esta salida. Revisa el saldo o usa ajuste a más primero." };
    }
    return { ok: false, message: e instanceof Error ? e.message : "No se pudo registrar el movimiento." };
  }
}
