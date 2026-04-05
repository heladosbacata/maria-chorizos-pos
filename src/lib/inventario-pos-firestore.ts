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
  type QuerySnapshot,
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

/** Saldos por punto de venta + ítem de catálogo (cargue / ajustes desde el POS). */
export const POS_INVENTARIO_SALDOS_COLLECTION = "posInventarioSaldos";

/** Bitácora de movimientos (cargue, salidas, ajustes) desde el POS. */
export const POS_INVENTARIO_MOVIMIENTOS_COLLECTION = "posInventarioMovimientos";

/** Saldos actualizados por el WMS al descontar ensamble por venta (`aplicar-venta-ensamble`). */
export const POS_INVENTARIO_ENSAMBLE_SALDOS_COLLECTION = "pos_inventario_ensamble_saldo";

/** Movimientos generados por el WMS al aplicar ensamble. */
export const POS_INVENTARIO_ENSAMBLE_MOVIMIENTOS_COLLECTION = "pos_inventario_ensamble_movimientos";

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
  /** Costo promedio ponderado (COP / unidad) según cargues POS; no lo escribe el WMS ensamble. */
  costoUnitarioPromedio?: number;
}

/** Clave estable para cruzar SKU entre hoja, Firestore y mínimos guardados. */
export function normSkuInventario(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Clave para fusionar saldos legacy (`posInventarioSaldos` con `insumoId` tipo `sheet-fran-kit-6`)
 * con los del WMS (`insumoId` = código kit `FRAN-KIT-6`). Sin esto, la pantalla seguía mostrando
 * solo el cargue legacy porque `cantidadSaldoParaInsumoKit` encontraba primero la fila por `item.id` hoja.
 */
export function claveParaConsolidarSaldoKit(r: InventarioSaldoRow): string {
  const skuNorm = normSkuInventario(r.insumoSku);
  if (skuNorm) return skuNorm;
  let id = normSkuInventario(r.insumoId);
  const stripped = id.replace(/^(sheet|gs|firestore)-/, "");
  if (stripped && stripped !== id) return stripped;
  return id;
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

function textoBusquedaInsumoKit(it: InsumoKitItem): string {
  return `${it.descripcion} ${it.sku} ${it.categoria ?? ""}`.toLowerCase();
}

/**
 * Bolsa de papel para «para llevar»: primero `skuEnv` (NEXT_PUBLIC_POS_SKU_BOLSA_PAPEL), si no coincide o falta,
 * heurística por descripción/SKU en el catálogo del punto.
 */
export function insumoBolsaPapelParaLlevarResolver(
  catalog: InsumoKitItem[],
  skuEnv: string | null | undefined
): InsumoKitItem | null {
  const e = skuEnv?.trim();
  if (e) {
    const hit = insumoKitDesdeCatalogoPorSku(catalog, e);
    if (hit) return hit;
  }
  for (const it of catalog) {
    const t = textoBusquedaInsumoKit(it);
    if (/(bolsa).{0,24}(papel)|(papel).{0,24}(bolsa)/i.test(t)) return it;
  }
  for (const it of catalog) {
    const t = textoBusquedaInsumoKit(it);
    if (!/\bbolsa\b|\bbolsas\b/i.test(t)) continue;
    if (/papel|domicilio|empaque|para\s*llevar|delivery/i.test(t)) return it;
  }
  return null;
}

/**
 * Sticker de domicilio para «para llevar»: env (NEXT_PUBLIC_POS_SKU_STICKER_DOMICILIO) o heurística en catálogo.
 */
export function insumoStickerDomicilioParaLlevarResolver(
  catalog: InsumoKitItem[],
  skuEnv: string | null | undefined
): InsumoKitItem | null {
  const e = skuEnv?.trim();
  if (e) {
    const hit = insumoKitDesdeCatalogoPorSku(catalog, e);
    if (hit) return hit;
  }
  for (const it of catalog) {
    const t = textoBusquedaInsumoKit(it);
    if (/(sticker|etiqueta).{0,28}(domicilio|llevar|delivery)|(domicilio|llevar|delivery).{0,28}(sticker|etiqueta)/i.test(t)) {
      return it;
    }
  }
  for (const it of catalog) {
    const t = textoBusquedaInsumoKit(it);
    if (!/sticker|etiqueta|tarjeta/i.test(t)) continue;
    if (/domicilio|entrega|llevar|delivery|para\s*llevar/i.test(t)) return it;
  }
  return null;
}

/**
 * Saldo mostrado para un ítem del catálogo: prioriza coincidencia por **SKU kit** (mismo string que el WMS
 * en `insumoId` / DB_POS_Composición); luego por `insumoId` hoja (`sheet-…`); por último suma por `insumoSku`.
 */
export function cantidadSaldoParaInsumoKit(item: InsumoKitItem, rows: InventarioSaldoRow[]): number {
  const k = normSkuInventario(item.sku);
  if (k) {
    for (const r of rows) {
      if (normSkuInventario(r.insumoSku) === k || normSkuInventario(r.insumoId) === k) {
        return Number(r.cantidad) || 0;
      }
    }
  }
  const direct = rows.find((r) => r.insumoId === item.id);
  if (direct) return Number(direct.cantidad) || 0;
  if (!k) return 0;
  let sum = 0;
  for (const r of rows) {
    if (normSkuInventario(r.insumoSku) === k) sum += Number(r.cantidad) || 0;
  }
  return sum;
}

/**
 * Interpreta un documento de saldo (legacy o `pos_inventario_ensamble_saldo`).
 * El WMS a veces persiste el código kit solo en `skuComponente` (como en el JSON de `detalle` del ensamble),
 * no en `insumoId`; sin esto el POS ignoraba el doc y el saldo no bajaba en pantalla.
 */
export function saldoRowDesdeFirestoreSaldoDoc(data: Record<string, unknown>): InventarioSaldoRow | null {
  const idish =
    str(data.insumoId) ||
    str(data.skuComponente) ||
    str(data.sku_componente) ||
    str(data.codigoInsumo) ||
    str(data.codigo_insumo);
  if (!idish) return null;
  const sku =
    str(data.insumoSku) ||
    str(data.skuComponente) ||
    str(data.sku_componente) ||
    idish;
  const rawCant = data.cantidad ?? data.stock ?? data.saldo ?? data.qty ?? data.quantity ?? data.cantidadActual;
  const c = Number(rawCant);
  const costoRaw = data.costoUnitarioPromedio ?? data.costo_unitario_promedio;
  const costo = Number(costoRaw);
  return {
    insumoId: idish,
    insumoSku: sku,
    cantidad: Number.isFinite(c) ? c : 0,
    ...(Number.isFinite(costo) && costo >= 0 ? { costoUnitarioPromedio: Math.round(costo * 100) / 100 } : {}),
  };
}

/** Convierte un snapshot de consulta (getDocs u onSnapshot) en filas de saldo. */
export function querySnapshotToSaldoRows(snap: QuerySnapshot): InventarioSaldoRow[] {
  const rows: InventarioSaldoRow[] = [];
  snap.forEach((d) => {
    const row = saldoRowDesdeFirestoreSaldoDoc(d.data() as Record<string, unknown>);
    if (row) rows.push(row);
  });
  return rows;
}

/**
 * Une saldos POS (`posInventarioSaldos`) con ensamble WMS (`pos_inventario_ensamble_saldo`).
 * Misma clave lógica que `listarSaldosInventarioPorPuntoVenta` (`claveParaConsolidarSaldoKit`).
 * Si existe en ambas fuentes, consolida como: saldo POS + neto ensamble WMS.
 */
export function mergeSaldosInventarioLegacyYEnsamble(
  legacy: InventarioSaldoRow[],
  ensamble: InventarioSaldoRow[]
): InventarioSaldoRow[] {
  const legacyByKey = new Map<string, InventarioSaldoRow>();
  for (const r of legacy) legacyByKey.set(claveParaConsolidarSaldoKit(r), r);
  const ensambleByKey = new Map<string, InventarioSaldoRow>();
  for (const r of ensamble) ensambleByKey.set(claveParaConsolidarSaldoKit(r), r);

  const keys = new Set<string>([...legacyByKey.keys(), ...ensambleByKey.keys()]);
  const out: InventarioSaldoRow[] = [];
  for (const k of keys) {
    const l = legacyByKey.get(k);
    const e = ensambleByKey.get(k);
    if (l && e) {
      out.push({
        insumoId: l.insumoId || e.insumoId,
        insumoSku: l.insumoSku || e.insumoSku,
        cantidad: Math.round((Number(l.cantidad || 0) + Number(e.cantidad || 0)) * 1000) / 1000,
        ...(typeof l.costoUnitarioPromedio === "number" && Number.isFinite(l.costoUnitarioPromedio)
          ? { costoUnitarioPromedio: l.costoUnitarioPromedio }
          : typeof e.costoUnitarioPromedio === "number" && Number.isFinite(e.costoUnitarioPromedio)
            ? { costoUnitarioPromedio: e.costoUnitarioPromedio }
            : {}),
      });
      continue;
    }
    if (l) out.push(l);
    else if (e) out.push(e);
  }
  return out;
}

/** Origen del saldo mostrado: POS legacy vs WMS ensamble (este último no se puede corregir desde esta pantalla). */
export type InventarioSaldoConFuente = {
  row: InventarioSaldoRow;
  fuente: "legacy" | "ensamble";
  /** Si el saldo visible viene del WMS, conservamos el costo medio del doc POS (cargue) para valorización. */
  costoUnitarioDesdeLegacy?: number;
};

/**
 * Igual que `mergeSaldosInventarioLegacyYEnsamble` pero indica si el valor consolidado proviene del WMS
 * o del POS. Si existe en ambas fuentes, usa saldo POS + neto ensamble WMS.
 */
export function mapSaldosLegacyYEnsambleConFuente(
  legacy: InventarioSaldoRow[],
  ensamble: InventarioSaldoRow[]
): Map<string, InventarioSaldoConFuente> {
  const legacyByKey = new Map<string, InventarioSaldoRow>();
  for (const r of legacy) legacyByKey.set(claveParaConsolidarSaldoKit(r), r);
  const ensambleByKey = new Map<string, InventarioSaldoRow>();
  for (const r of ensamble) ensambleByKey.set(claveParaConsolidarSaldoKit(r), r);

  const keys = new Set<string>([...legacyByKey.keys(), ...ensambleByKey.keys()]);
  const map = new Map<string, InventarioSaldoConFuente>();
  for (const ck of keys) {
    const l = legacyByKey.get(ck);
    const e = ensambleByKey.get(ck);
    if (l && e) {
      const costoLegacy =
        typeof l.costoUnitarioPromedio === "number" && Number.isFinite(l.costoUnitarioPromedio) && l.costoUnitarioPromedio >= 0
          ? l.costoUnitarioPromedio
          : undefined;
      map.set(ck, {
        row: {
          insumoId: l.insumoId || e.insumoId,
          insumoSku: l.insumoSku || e.insumoSku,
          cantidad: Math.round((Number(l.cantidad || 0) + Number(e.cantidad || 0)) * 1000) / 1000,
          ...(typeof costoLegacy === "number"
            ? { costoUnitarioPromedio: costoLegacy }
            : typeof e.costoUnitarioPromedio === "number" &&
                Number.isFinite(e.costoUnitarioPromedio) &&
                e.costoUnitarioPromedio >= 0
              ? { costoUnitarioPromedio: e.costoUnitarioPromedio }
              : {}),
        },
        // Cuando existe saldo POS, permitimos ajuste desde la pantalla (impacta la parte legacy).
        fuente: "legacy",
        ...(typeof costoLegacy === "number" ? { costoUnitarioDesdeLegacy: costoLegacy } : {}),
      });
      continue;
    }
    if (l) {
      const c = l.costoUnitarioPromedio;
      map.set(ck, {
        row: l,
        fuente: "legacy",
        ...(typeof c === "number" && Number.isFinite(c) && c >= 0 ? { costoUnitarioDesdeLegacy: c } : {}),
      });
      continue;
    }
    if (e) {
      map.set(ck, {
        row: e,
        fuente: "ensamble",
      });
    }
  }
  return map;
}

/** Prefijo en `notas` de movimientos creados desde «clic en saldo» en Inventarios (historial filtrable). */
export const NOTAS_PREFIJO_AJUSTE_SALDO_STOCK = "[Ajuste saldo]";

/**
 * Saldo mostrado y si permite ajuste por clic (solo filas cuyo saldo consolidado viene de `posInventarioSaldos`,
 * no del WMS).
 */
export function saldoMostradoYFuenteParaInsumoKit(
  item: InsumoKitItem,
  porClave: Map<string, InventarioSaldoConFuente>,
  saldoRowsMerged: InventarioSaldoRow[]
): {
  saldo: number;
  fuente: "legacy" | "ensamble" | "ninguno";
  editable: boolean;
  /** COP/unidad desde cargues POS (costo medio); null si aún no hay costo registrado. */
  costoUnitarioReferencia: number | null;
} {
  const saldo = cantidadSaldoParaInsumoKit(item, saldoRowsMerged);
  const synthetic: InventarioSaldoRow = { insumoId: item.id, insumoSku: item.sku, cantidad: 0 };
  const ck = claveParaConsolidarSaldoKit(synthetic);
  const ent = porClave.get(ck);
  if (ent) {
    const costoRef =
      ent.fuente === "legacy"
        ? ent.row.costoUnitarioPromedio
        : ent.costoUnitarioDesdeLegacy ?? ent.row.costoUnitarioPromedio;
    const costoOk =
      typeof costoRef === "number" && Number.isFinite(costoRef) && costoRef > 0 ? costoRef : null;
    return {
      saldo,
      fuente: ent.fuente,
      editable: ent.fuente !== "ensamble",
      costoUnitarioReferencia: costoOk,
    };
  }
  const k = normSkuInventario(item.sku);
  if (k) {
    for (const e of Array.from(porClave.values())) {
      const r = e.row;
      if (normSkuInventario(r.insumoSku) === k || normSkuInventario(r.insumoId) === k) {
        const costoRef =
          e.fuente === "legacy"
            ? r.costoUnitarioPromedio
            : e.costoUnitarioDesdeLegacy ?? r.costoUnitarioPromedio;
        const costoOk =
          typeof costoRef === "number" && Number.isFinite(costoRef) && costoRef > 0 ? costoRef : null;
        return { saldo, fuente: e.fuente, editable: e.fuente !== "ensamble", costoUnitarioReferencia: costoOk };
      }
    }
  }
  for (const e of Array.from(porClave.values())) {
    if (e.row.insumoId === item.id) {
      const costoRef =
        e.fuente === "legacy"
          ? e.row.costoUnitarioPromedio
          : e.costoUnitarioDesdeLegacy ?? e.row.costoUnitarioPromedio;
      const costoOk =
        typeof costoRef === "number" && Number.isFinite(costoRef) && costoRef > 0 ? costoRef : null;
      return { saldo, fuente: e.fuente, editable: e.fuente !== "ensamble", costoUnitarioReferencia: costoOk };
    }
  }
  return { saldo, fuente: "ninguno", editable: true, costoUnitarioReferencia: null };
}

/**
 * Saldos + mapa por clave de kit con fuente (legacy vs ensamble). Misma lectura que
 * `listarSaldosInventarioPorPuntoVenta`.
 */
export async function listarSaldosInventarioConFuentePorPuntoVenta(puntoVenta: string): Promise<{
  saldoRows: InventarioSaldoRow[];
  porClave: Map<string, InventarioSaldoConFuente>;
}> {
  const empty = (): { saldoRows: InventarioSaldoRow[]; porClave: Map<string, InventarioSaldoConFuente> } => ({
    saldoRows: [],
    porClave: new Map(),
  });
  if (!db) return empty();
  const pv = puntoVenta.replace(/\u00a0/g, " ").trim();
  if (!pv) return empty();

  const legacyByClave = new Map<string, InventarioSaldoRow>();
  try {
    const qLegacy = query(collection(db, POS_INVENTARIO_SALDOS_COLLECTION), where("puntoVenta", "==", pv));
    const snapLegacy = await getDocs(qLegacy);
    for (const r of querySnapshotToSaldoRows(snapLegacy)) {
      legacyByClave.set(claveParaConsolidarSaldoKit(r), r);
    }
  } catch {
    /* ignore */
  }
  const legacyRows = Array.from(legacyByClave.values());

  const ensByClave = new Map<string, InventarioSaldoRow>();
  try {
    const colEns = collection(db, POS_INVENTARIO_ENSAMBLE_SALDOS_COLLECTION);
    const byDocId = new Map<string, InventarioSaldoRow>();
    const ingestEnsambleSnap = (snap: QuerySnapshot) => {
      snap.forEach((d) => {
        const row = saldoRowDesdeFirestoreSaldoDoc(d.data() as Record<string, unknown>);
        if (row) byDocId.set(d.id, row);
      });
    };
    const snapPv = await getDocs(query(colEns, where("puntoVenta", "==", pv)));
    ingestEnsambleSnap(snapPv);
    const pvClave = normPuntoVentaCatalogo(pv);
    if (pvClave) {
      try {
        const snapClave = await getDocs(query(colEns, where("puntoVentaClave", "==", pvClave)));
        ingestEnsambleSnap(snapClave);
      } catch {
        /* índice faltante o campo no usado en Firestore */
      }
    }
    for (const r of Array.from(byDocId.values())) {
      ensByClave.set(claveParaConsolidarSaldoKit(r), r);
    }
  } catch {
    /* ignore: colección nueva o reglas */
  }
  const ensRows = Array.from(ensByClave.values());

  const porClave = mapSaldosLegacyYEnsambleConFuente(legacyRows, ensRows);
  return {
    saldoRows: Array.from(porClave.values()).map((v) => v.row),
    porClave,
  };
}

/**
 * Saldos mostrados en Inventarios: lee `posInventarioSaldos` (cargue/ajustes POS) y
 * `pos_inventario_ensamble_saldo` (WMS tras ventas). Fusiona por **clave de kit** (`insumoSku` o
 * sufijo tras `sheet-`/`gs-` en `insumoId`) y, cuando existe en ambas fuentes, calcula
 * `saldo final = saldo POS + neto ensamble WMS`.
 */
export async function listarSaldosInventarioPorPuntoVenta(puntoVenta: string): Promise<InventarioSaldoRow[]> {
  const x = await listarSaldosInventarioConFuentePorPuntoVenta(puntoVenta);
  return x.saldoRows;
}

export async function obtenerSaldosPorPuntoVenta(
  puntoVenta: string
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  for (const r of await listarSaldosInventarioPorPuntoVenta(puntoVenta)) {
    map.set(claveParaConsolidarSaldoKit(r), r.cantidad);
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

function movimientoDocDesdeFirestore(
  d: { id: string; data: () => Record<string, unknown> },
  idPrefix = ""
): InventarioMovimientoDoc {
  const x = d.data();
  return {
    id: idPrefix ? `${idPrefix}${d.id}` : d.id,
    puntoVenta: str(x.puntoVenta),
    insumoId: str(x.insumoId),
    insumoSku: str(x.insumoSku),
    insumoDescripcion: str(x.insumoDescripcion),
    tipo: tipoMovimientoDesdeFirestore(x.tipo),
    delta: Number(x.delta) || 0,
    cantidadAnterior: Number(x.cantidadAnterior) || 0,
    cantidadNueva: Number(x.cantidadNueva) || 0,
    notas: str(x.notas),
    fechaCargue: str(x.fechaCargue) || undefined,
    uid: str(x.uid),
    email: x.email != null ? str(x.email) : null,
    createdAt: x.createdAt,
    edicionesLog: parseEdicionesLogMovimiento(x.edicionesLog),
    precioCompraUnitario:
      typeof x.precioCompraUnitario === "number" && Number.isFinite(x.precioCompraUnitario)
        ? x.precioCompraUnitario
        : undefined,
  };
}

function secondsCreatedAt(m: InventarioMovimientoDoc): number {
  const c = m.createdAt;
  if (c && typeof c === "object" && typeof (c as { seconds?: number }).seconds === "number") {
    return (c as { seconds: number }).seconds;
  }
  return 0;
}

async function listarMovimientosUnaColeccion(
  colName: string,
  pv: string,
  maxPerCol: number,
  idPrefix = ""
): Promise<InventarioMovimientoDoc[]> {
  if (!db) return [];
  try {
    const q = query(
      collection(db, colName),
      where("puntoVenta", "==", pv),
      orderBy("createdAt", "desc"),
      limit(maxPerCol)
    );
    const snap = await getDocs(q);
    const out: InventarioMovimientoDoc[] = [];
    snap.forEach((d) => out.push(movimientoDocDesdeFirestore(d, idPrefix)));
    return out;
  } catch {
    try {
      const q2 = query(collection(db, colName), where("puntoVenta", "==", pv), limit(maxPerCol));
      const snap = await getDocs(q2);
      const out: InventarioMovimientoDoc[] = [];
      snap.forEach((d) => out.push(movimientoDocDesdeFirestore(d, idPrefix)));
      out.sort((a, b) => secondsCreatedAt(b) - secondsCreatedAt(a));
      return out;
    } catch {
      return [];
    }
  }
}

/** Incluye movimientos del POS y del WMS (`pos_inventario_ensamble_movimientos`), unificados por fecha. */
export async function listarMovimientosInventario(
  puntoVenta: string,
  max: number = 80
): Promise<InventarioMovimientoDoc[]> {
  if (!db) return [];
  const pv = puntoVenta.trim();
  if (!pv) return [];
  const per = Math.max(max, Math.ceil(max / 2) + 20);
  const [legacy, ensamble] = await Promise.all([
    listarMovimientosUnaColeccion(POS_INVENTARIO_MOVIMIENTOS_COLLECTION, pv, per, ""),
    listarMovimientosUnaColeccion(POS_INVENTARIO_ENSAMBLE_MOVIMIENTOS_COLLECTION, pv, per, "wmsEns:"),
  ]);
  const merged = [...legacy, ...ensamble];
  merged.sort((a, b) => secondsCreatedAt(b) - secondsCreatedAt(a));
  return merged.slice(0, max);
}

/** Indica si un movimiento (POS o WMS) corresponde al ítem del catálogo (id hoja o SKU kit). */
export function movimientoInventarioCorrespondeAInsumoKit(
  m: InventarioMovimientoDoc,
  item: InsumoKitItem
): boolean {
  if (m.insumoId === item.id) return true;
  const k = normSkuInventario(item.sku);
  if (!k) return false;
  return normSkuInventario(m.insumoSku) === k || normSkuInventario(m.insumoId) === k;
}

/**
 * Últimos movimientos de un insumo en el punto de venta (legacy + ensamble WMS), más recientes primero.
 * Filtra en cliente sobre un barrido acotado para no exigir índices compuestos en Firestore.
 */
export async function listarMovimientosRecientesPorInsumoKit(
  puntoVenta: string,
  item: InsumoKitItem,
  opciones?: { maxScan?: number; maxResultados?: number }
): Promise<InventarioMovimientoDoc[]> {
  const maxScan = opciones?.maxScan ?? 400;
  const maxResultados = opciones?.maxResultados ?? 50;
  const todos = await listarMovimientosInventario(puntoVenta, maxScan);
  return todos.filter((m) => movimientoInventarioCorrespondeAInsumoKit(m, item)).slice(0, maxResultados);
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
    case "venta_ensamble":
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
  venta_ensamble: "Venta POS — descuento ensamble (WMS)",
};

export function etiquetaTipoMovimiento(tipo: TipoMovimientoInventario): string {
  return ETIQUETA_TIPO[tipo] ?? tipo;
}

const TIPOS_MOVIMIENTO_CONOCIDOS: TipoMovimientoInventario[] = [
  "cargue",
  "salida_danio",
  "ajuste_positivo",
  "ajuste_negativo",
  "merma",
  "consumo_interno",
  "venta_ensamble",
];

function tipoMovimientoDesdeFirestore(raw: unknown): TipoMovimientoInventario {
  const t = str(raw);
  if (TIPOS_MOVIMIENTO_CONOCIDOS.includes(t as TipoMovimientoInventario)) {
    return t as TipoMovimientoInventario;
  }
  if (/ensamble|venta_?pos|aplicar_?venta/i.test(t)) return "venta_ensamble";
  return "consumo_interno";
}

function fechaCargueValida(iso: string | undefined): string | undefined {
  if (iso == null || !iso.trim()) return undefined;
  const s = iso.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const dt = mediodiaColombiaDesdeYmd(s);
  if (Number.isNaN(dt.getTime()) || ymdColombia(dt) !== s) return undefined;
  return s;
}

/** Costo medio ponderado (COP/unidad) tras sumar `deltaEntrada` a `cantidadAnterior` al precio `precioCompraUnitario`. */
export function nuevoCostoUnitarioPromedioCargue(
  cantidadAnterior: number,
  costoUnitarioActual: number,
  deltaEntrada: number,
  precioCompraUnitario: number
): number {
  const q0 = Math.max(0, cantidadAnterior);
  const d = Math.max(0, deltaEntrada);
  const p = Number(precioCompraUnitario);
  const c0 = Number.isFinite(costoUnitarioActual) && costoUnitarioActual >= 0 ? costoUnitarioActual : 0;
  if (d <= 0 || !Number.isFinite(p) || p <= 0) return Math.round(c0 * 100) / 100;
  const q1 = q0 + d;
  if (q1 <= 0) return Math.round(c0 * 100) / 100;
  if (q0 <= 1e-9) return Math.round(p * 100) / 100;
  const merged = (q0 * c0 + d * p) / q1;
  return Math.round(merged * 100) / 100;
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
  /** Precio de compra unitario en COP; obligatorio para tipo «cargue». */
  precioCompraUnitario?: number;
}): Promise<{ ok: boolean; message?: string }> {
  const pv = params.puntoVenta.trim();
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
          ...(params.tipo === "cargue" && params.precioCompraUnitario != null
            ? { precioCompraUnitario: params.precioCompraUnitario }
            : {}),
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
      const prevData = saldoSnap.exists() ? saldoSnap.data() : {};
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
      const movRef = doc(movsCol);
      const fechaCargueNorm = fechaCargueValida(params.fechaCargue);
      transaction.set(
        saldoRef,
        {
          puntoVenta: pv,
          insumoId: params.insumo.id,
          insumoSku: params.insumo.sku,
          cantidad: nueva,
          costoUnitarioPromedio: costoNuevo,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      const precioDoc =
        params.tipo === "cargue" && params.precioCompraUnitario != null
          ? Math.round(Number(params.precioCompraUnitario) * 100) / 100
          : undefined;
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
        ...(precioDoc != null && Number.isFinite(precioDoc) && precioDoc > 0
          ? { precioCompraUnitario: precioDoc }
          : {}),
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
