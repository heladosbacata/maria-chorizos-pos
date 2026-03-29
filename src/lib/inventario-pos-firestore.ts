import {
  arrayUnion,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
  orderBy,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { mediodiaColombiaDesdeYmd, ymdColombia } from "@/lib/fecha-colombia";
import { normPuntoVentaCatalogo } from "@/lib/punto-venta-catalogo-norm";
import type {
  InsumoKitItem,
  InventarioMovimientoDoc,
  InventarioMovimientoEdicionLogEntry,
  TipoMovimientoInventario,
} from "@/types/inventario-pos";

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

/** Mínimos sugeridos editados por el usuario en el POS (por PV + SKU). */
export const POS_INVENTARIO_MINIMOS_COLLECTION = "posInventarioMinimos";

function parseEdicionesLogMovimiento(raw: unknown): InventarioMovimientoEdicionLogEntry[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: InventarioMovimientoEdicionLogEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    out.push({
      en: o.en,
      uid: str(o.uid),
      email: str(o.email),
      texto: str(o.texto),
    });
  }
  return out.length ? out : undefined;
}

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
  const pv = normPuntoVentaCatalogo(puntoVenta);
  if (!pv) return true;

  let algunCampoPvDefinido = false;
  for (const k of CATALOGO_PV_FIELD_KEYS) {
    const raw = str(data[k]);
    if (!raw) continue;
    algunCampoPvDefinido = true;
    if (normPuntoVentaCatalogo(raw) === pv) return true;
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
  const rawMin =
    str(data.minimoSugerido) ||
    str(data.minimoSugeridoSheet) ||
    str(data.minimo) ||
    str(data.Minimo) ||
    str(data.stockMinimo) ||
    str(data.stock_minimo);
  let minimoSugeridoSheet: number | undefined;
  if (rawMin) {
    const n = Number(rawMin.replace(/\s/g, "").replace(",", "."));
    if (Number.isFinite(n) && n >= 0) minimoSugeridoSheet = Math.round(n * 1000) / 1000;
  }
  return {
    id,
    sku,
    descripcion,
    unidad,
    categoria,
    puntoVentaOrigen,
    ...(minimoSugeridoSheet != null ? { minimoSugeridoSheet } : {}),
  };
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
function variantesPuntoVentaConsulta(puntoVenta: string): string[] {
  const t = puntoVenta.trim();
  if (!t) return [];
  const n = normPuntoVentaCatalogo(t);
  return Array.from(new Set([t, n].filter((x) => x.length > 0)));
}

export async function listarInsumosKitPorPuntoVenta(puntoVenta: string): Promise<InsumoKitItem[]> {
  if (!db) return [];
  const pv = puntoVenta.trim();
  if (!pv) return [];

  const col = collection(db, CATALOGO_INSUMOS_KIT_COLLECTION);
  const merged = new Map<string, InsumoKitItem>();
  const lim = readCatalogQueryLimit();
  const pvConsulta = variantesPuntoVentaConsulta(pv);

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
    for (const candidato of pvConsulta) {
      tasks.push(runQuery(query(col, where(field, "==", candidato), limit(lim))));
    }
  }

  tasks.push(runQuery(query(col, where(CATALOGO_CAMPO_GLOBAL, "==", true), limit(lim))));
  tasks.push(runQuery(query(col, where("pos_catalogo_global", "==", true), limit(lim))));

  const codesAny = [...pvConsulta, "__ALL__"];
  tasks.push(
    (async () => {
      try {
        const snap = await getDocs(
          query(col, where(CATALOGO_CAMPO_PV_CODES, "array-contains-any", codesAny), limit(lim))
        );
        ingestSnap(snap);
      } catch {
        /* sin campo o tipo incorrecto o límite 10 valores en array-contains-any */
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

/** Fila de saldo en Firestore (para cruzar catálogo hoja vs ids históricos). */
export interface InventarioSaldoRow {
  insumoId: string;
  insumoSku: string;
  cantidad: number;
}

/** Clave estable para cruzar SKU entre hoja, Firestore y mínimos guardados. */
export function normSkuInventario(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Resuelve un ítem del catálogo por SKU o por id de documento (misma lógica que en recibos / hoja). */
export function insumoKitDesdeCatalogoPorSku(catalog: InsumoKitItem[], skuOCodigo: string): InsumoKitItem | null {
  const k = normSkuInventario(skuOCodigo);
  if (!k) return null;
  for (const it of catalog) {
    if (normSkuInventario(it.sku) === k) return it;
    if (normSkuInventario(it.id) === k) return it;
  }
  return null;
}

/**
 * Saldo mostrado para un ítem del catálogo: primero por `insumoId`; si no hay fila, suma por SKU
 * (compat. catálogo Firestore vs hoja Google con distinto id).
 */
export function cantidadSaldoParaInsumoKit(item: InsumoKitItem, rows: InventarioSaldoRow[]): number {
  const direct = rows.find((r) => r.insumoId === item.id);
  if (direct) return Number(direct.cantidad) || 0;
  const k = normSkuInventario(item.sku);
  if (!k) return 0;
  let sum = 0;
  for (const r of rows) {
    if (normSkuInventario(r.insumoSku) === k) sum += Number(r.cantidad) || 0;
  }
  return sum;
}

export async function listarSaldosInventarioPorPuntoVenta(puntoVenta: string): Promise<InventarioSaldoRow[]> {
  const out: InventarioSaldoRow[] = [];
  if (!db) return out;
  const pv = puntoVenta.trim();
  if (!pv) return out;
  try {
    const q = query(collection(db, POS_INVENTARIO_SALDOS_COLLECTION), where("puntoVenta", "==", pv));
    const snap = await getDocs(q);
    snap.forEach((d) => {
      const x = d.data();
      const insumoId = str(x.insumoId);
      if (!insumoId) return;
      const c = Number(x.cantidad);
      out.push({
        insumoId,
        insumoSku: str(x.insumoSku),
        cantidad: Number.isFinite(c) ? c : 0,
      });
    });
  } catch {
    /* ignore */
  }
  return out;
}

export async function obtenerSaldosPorPuntoVenta(
  puntoVenta: string
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  for (const r of await listarSaldosInventarioPorPuntoVenta(puntoVenta)) {
    map.set(r.insumoId, r.cantidad);
  }
  return map;
}

export function idMinimoInventarioDoc(puntoVenta: string, sku: string): string {
  const safePv = puntoVenta.trim().replace(/\//g, "|");
  const slug = sku
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 100);
  return `${safePv}__min__${slug || "sku"}`;
}

/** Mínimos editados por el usuario (clave SKU tal como en el catálogo). */
export async function listarMinimosUsuarioInventario(puntoVenta: string): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!db) return map;
  const pv = puntoVenta.trim();
  if (!pv) return map;
  try {
    const q = query(collection(db, POS_INVENTARIO_MINIMOS_COLLECTION), where("puntoVenta", "==", pv));
    const snap = await getDocs(q);
    snap.forEach((d) => {
      const x = d.data();
      const sku = str(x.insumoSku);
      const m = Number(x.minimo);
      if (sku && Number.isFinite(m) && m >= 0) map.set(normSkuInventario(sku), m);
    });
  } catch {
    /* ignore */
  }
  return map;
}

export async function guardarMinimoUsuarioInventario(params: {
  puntoVenta: string;
  insumoSku: string;
  minimo: number;
  uid: string;
}): Promise<{ ok: boolean; message?: string }> {
  if (!db) return { ok: false, message: "Firestore no está disponible." };
  const pv = params.puntoVenta.trim();
  const sku = params.insumoSku.trim();
  if (!pv || !sku) return { ok: false, message: "Falta punto de venta o código de producto." };
  const m = params.minimo;
  if (!Number.isFinite(m) || m < 0) return { ok: false, message: "El mínimo debe ser un número ≥ 0." };
  const docId = idMinimoInventarioDoc(pv, sku);
  try {
    await setDoc(
      doc(db, POS_INVENTARIO_MINIMOS_COLLECTION, docId),
      {
        puntoVenta: pv,
        insumoSku: sku,
        minimo: Math.round(m * 1000) / 1000,
        updatedAt: serverTimestamp(),
        uid: params.uid.trim(),
      },
      { merge: true }
    );
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "No se pudo guardar el mínimo." };
  }
}

export async function eliminarMinimoUsuarioInventario(
  puntoVenta: string,
  insumoSku: string
): Promise<{ ok: boolean; message?: string }> {
  if (!db) return { ok: false, message: "Firestore no está disponible." };
  const pv = puntoVenta.trim();
  const sku = insumoSku.trim();
  if (!pv || !sku) return { ok: false, message: "Falta punto de venta o código." };
  try {
    await deleteDoc(doc(db, POS_INVENTARIO_MINIMOS_COLLECTION, idMinimoInventarioDoc(pv, sku)));
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "No se pudo quitar el mínimo guardado." };
  }
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
        edicionesLog: parseEdicionesLogMovimiento(x.edicionesLog),
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
          edicionesLog: parseEdicionesLogMovimiento(x.edicionesLog),
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
  const dt = mediodiaColombiaDesdeYmd(s);
  if (Number.isNaN(dt.getTime()) || ymdColombia(dt) !== s) return undefined;
  return s;
}

/** Resumen legible de diferencias entre el movimiento actual y la corrección pedida. */
function partesResumenCorreccionCargue(
  m: Record<string, unknown>,
  newDelta: number,
  fechaQuitar: boolean,
  fechaNorm: string | undefined,
  notasNueva: string
): string[] {
  const oldDelta = Number(m.delta) || 0;
  const oldFecha = str(m.fechaCargue) || "";
  const oldNotas = str(m.notas);
  const partes: string[] = [];
  if (oldDelta !== newDelta) {
    partes.push(`Cantidad: +${oldDelta} → +${newDelta}`);
  }
  const nuevoFechaKey = fechaQuitar ? "" : fechaNorm ?? "";
  if ((oldFecha || "") !== nuevoFechaKey) {
    const oldFechaShow = oldFecha || "(sin fecha)";
    const newFechaShow = fechaQuitar ? "(sin fecha)" : fechaNorm ?? "";
    partes.push(`Fecha cargue: ${oldFechaShow} → ${newFechaShow}`);
  }
  if (oldNotas !== notasNueva) {
    partes.push("Notas actualizadas");
  }
  return partes;
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
  const pv = params.puntoVenta.trim();
  if (!pv) return { ok: false, message: "Falta punto de venta." };
  const delta = deltaPorTipo(params.tipo, params.cantidad);
  if (delta === 0) return { ok: false, message: "La cantidad debe ser mayor que cero." };

  if (typeof window !== "undefined" && auth?.currentUser) {
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch("/api/pos_inventario_movimiento", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          puntoVenta: pv,
          insumo: params.insumo,
          tipo: params.tipo,
          cantidad: params.cantidad,
          notas: params.notas,
          fechaCargue: params.fechaCargue,
          permitirNegativo: params.permitirNegativo === true,
        }),
      });
      let data: { ok?: boolean; message?: string } = {};
      try {
        data = (await res.json()) as { ok?: boolean; message?: string };
      } catch {
        /* cuerpo vacío o no JSON */
      }
      if (res.ok && data.ok) {
        return { ok: true };
      }
      const msgLower = String(data.message ?? "").toLowerCase();
      const sinAdmin =
        res.status === 503 && (msgLower.includes("firebase_service_account") || msgLower.includes("no está configurada"));
      if (sinAdmin) {
        /* continuar con SDK web abajo */
      } else {
        return {
          ok: false,
          message:
            data.message ??
            (res.status === 401
              ? "Sesión expirada. Volvé a iniciar sesión."
              : "No se pudo registrar el movimiento."),
        };
      }
    } catch {
      /* sin red o API caída → intentar cliente */
    }
  }

  if (!db) return { ok: false, message: "Firestore no está disponible." };

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

/**
 * Corrige un movimiento de tipo «cargue»: ajusta el saldo como si se deshiciera el delta anterior y se aplicara el nuevo,
 * y deja trazabilidad en `edicionesLog`.
 */
export async function corregirMovimientoCargueInventario(params: {
  movimientoId: string;
  puntoVenta: string;
  nuevaCantidad: number;
  /** YYYY-MM-DD; cadena vacía borra la fecha en el movimiento. */
  fechaCargue: string;
  notas: string;
  uid: string;
  email: string | null;
  permitirNegativo?: boolean;
}): Promise<{ ok: boolean; message?: string }> {
  if (!db) return { ok: false, message: "Firestore no está disponible." };
  const fs = db;
  const pv = params.puntoVenta.trim();
  if (!pv) return { ok: false, message: "Falta punto de venta." };
  const movId = params.movimientoId.trim();
  if (!movId) return { ok: false, message: "Falta el movimiento." };
  const newDelta = Math.abs(Number(params.nuevaCantidad));
  if (!Number.isFinite(newDelta) || newDelta <= 0) {
    return { ok: false, message: "La cantidad debe ser un número mayor que cero." };
  }

  const movRef = doc(fs, POS_INVENTARIO_MOVIMIENTOS_COLLECTION, movId);
  const notasNueva = params.notas.trim().slice(0, 500);
  const fechaInput = params.fechaCargue.trim();
  const fechaNorm = fechaInput ? fechaCargueValida(fechaInput) : undefined;
  if (fechaInput && !fechaNorm) {
    return { ok: false, message: "La fecha de cargue debe ser válida (AAAA-MM-DD)." };
  }
  const fechaQuitar = fechaInput === "";

  try {
    const preSnap = await getDoc(movRef);
    if (!preSnap.exists()) return { ok: false, message: "No se encontró el movimiento." };
    const pre = preSnap.data() as Record<string, unknown>;
    if (str(pre.puntoVenta) !== pv) return { ok: false, message: "El movimiento no pertenece a este punto de venta." };
    if (pre.tipo !== "cargue") return { ok: false, message: "Solo se pueden corregir movimientos de cargue." };

    const partesPre = partesResumenCorreccionCargue(pre, newDelta, fechaQuitar, fechaNorm, notasNueva);
    if (partesPre.length === 0) {
      return { ok: false, message: "No hay cambios para guardar." };
    }

    await runTransaction(fs, async (transaction) => {
      const movSnap = await transaction.get(movRef);
      if (!movSnap.exists()) throw new Error("MOV_NO_EXISTE");
      const m = movSnap.data() as Record<string, unknown>;
      if (str(m.puntoVenta) !== pv) throw new Error("PV_DISTINTO");
      if (m.tipo !== "cargue") throw new Error("NO_ES_CARGUE");

      const oldDelta = Number(m.delta) || 0;
      const insumoId = str(m.insumoId);
      if (!insumoId) throw new Error("SIN_INSUMO");

      const saldoDocId = idSaldoInventario(pv, insumoId);
      const saldoRef = doc(fs, POS_INVENTARIO_SALDOS_COLLECTION, saldoDocId);
      const saldoSnap = await transaction.get(saldoRef);
      const saldoActual = saldoSnap.exists() ? Number(saldoSnap.data()?.cantidad) || 0 : 0;
      const saldoNuevo = saldoActual - oldDelta + newDelta;
      if (!params.permitirNegativo && saldoNuevo < 0) throw new Error("STOCK_NEGATIVO");

      const partesTx = partesResumenCorreccionCargue(m, newDelta, fechaQuitar, fechaNorm, notasNueva);
      const logEntry =
        partesTx.length > 0
          ? {
              en: serverTimestamp(),
              uid: params.uid,
              email: params.email ?? "",
              texto: partesTx.join(" · "),
            }
          : null;

      transaction.set(
        saldoRef,
        {
          puntoVenta: pv,
          insumoId,
          insumoSku: str(m.insumoSku) || str(saldoSnap.data()?.insumoSku),
          cantidad: saldoNuevo,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      const patch: Record<string, unknown> = {
        delta: newDelta,
        cantidadAnterior: saldoNuevo - newDelta,
        cantidadNueva: saldoNuevo,
        notas: notasNueva,
      };
      if (logEntry) {
        patch.edicionesLog = arrayUnion(logEntry);
      }
      if (fechaQuitar) {
        patch.fechaCargue = deleteField();
      } else if (fechaNorm) {
        patch.fechaCargue = fechaNorm;
      }
      transaction.update(movRef, patch);
    });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "STOCK_NEGATIVO") {
      return {
        ok: false,
        message: "El ajuste dejaría stock negativo. Revisa la cantidad o habilita corrección con saldo negativo (solo administración).",
      };
    }
    if (msg === "MOV_NO_EXISTE") return { ok: false, message: "No se encontró el movimiento." };
    if (msg === "PV_DISTINTO") return { ok: false, message: "El movimiento no pertenece a este punto de venta." };
    if (msg === "NO_ES_CARGUE") return { ok: false, message: "Solo se pueden corregir movimientos de cargue." };
    if (msg === "SIN_INSUMO") return { ok: false, message: "El movimiento no tiene insumo asociado." };
    return { ok: false, message: e instanceof Error ? e.message : "No se pudo guardar la corrección." };
  }
}
