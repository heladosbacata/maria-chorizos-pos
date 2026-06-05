import { fetchCatalogoInsumosDesdeSheet } from "@/lib/catalogo-insumos-sheet-client";
import { getCatalogoPOS } from "@/lib/catalogo-pos";
import {
  expandirItemsInventarioDesdeProductosPos,
  mergeCatalogoInventarioBase,
  mergeCatalogoInventarioConProductosPos,
} from "@/lib/inventario-pos-catalogo";
import {
  claveParaConsolidarSaldoKit,
  listarInsumosKitPorPuntoVenta,
  listarMovimientosInventario,
  listarSaldosInventarioConFuentePorPuntoVenta,
  movimientoInventarioCorrespondeAInsumoKit,
  normSkuInventario,
  saldoMostradoYFuenteParaInsumoKit,
  type InventarioSaldoConFuente,
  type InventarioSaldoRow,
} from "@/lib/inventario-pos-firestore";
import type { InsumoKitItem, InventarioMovimientoDoc } from "@/types/inventario-pos";

export const LIMITE_MOVIMIENTOS_AUDITORIA_INVENTARIO = 500;

export type SeveridadHallazgoInventario = "critico" | "advertencia" | "info";

export type GrupoDuplicadoCatalogo = {
  claveKit: string;
  entradas: { sku: string; id: string; descripcion: string; origen: string }[];
};

export type GrupoDescripcionSimilar = {
  claveDescripcion: string;
  skus: string[];
  descripciones: string[];
};

export type FilaAuditoriaInventarioProducto = {
  sku: string;
  id: string;
  descripcion: string;
  categoria: string;
  saldoMostrado: number;
  saldoLegacy: number | null;
  saldoEnsamble: number | null;
  fuenteSaldo: "legacy" | "ensamble" | "ninguno";
  ajusteEditableEnPantalla: boolean;
  descuentoVentas: string;
  movLegacy: number;
  movEnsamble: number;
  cargues: number;
  ventasEnsamble: number;
  ajustes: number;
  otrasSalidas: number;
  sumaDeltaLegacy: number;
  sumaDeltaEnsamble: number;
  desajusteLegacy: number | null;
  desajusteEnsamble: number | null;
  severidad: SeveridadHallazgoInventario;
  hallazgos: string[];
  recomendaciones: string[];
};

export type ResumenAuditoriaInventario = {
  productosCatalogo: number;
  conSaldo: number;
  saldoNegativo: number;
  duplicadosCatalogo: number;
  descripcionesSimilares: number;
  desajusteLegacy: number;
  desajusteEnsamble: number;
  soloEnsambleSinLegacy: number;
  criticos: number;
  advertencias: number;
};

export type DatosAuditoriaInventarioPos = {
  puntoVenta: string;
  generadoIso: string;
  fuenteCatalogo: "sheet" | "firestore" | "wms";
  incluyeCatalogoPos: boolean;
  limiteMovimientos: number;
  resumen: ResumenAuditoriaInventario;
  duplicadosCatalogo: GrupoDuplicadoCatalogo[];
  descripcionesSimilares: GrupoDescripcionSimilar[];
  productos: FilaAuditoriaInventarioProducto[];
  notasMetodologia: string[];
};

function claveKitDesdeInsumo(item: InsumoKitItem): string {
  const synthetic: InventarioSaldoRow = { insumoId: item.id, insumoSku: item.sku, cantidad: 0 };
  return claveParaConsolidarSaldoKit(synthetic);
}

function claveDescripcionSimilar(descripcion: string): string {
  const s = descripcion
    .trim()
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/\bx\s*\d+\b/gi, "")
    .replace(/\b(paquete|und|unidad|ml|litro|l)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return s.length >= 8 ? s.slice(0, 56) : "";
}

function saldoPorClaveKit(rows: InventarioSaldoRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    m.set(claveParaConsolidarSaldoKit(r), Number(r.cantidad) || 0);
  }
  return m;
}

function esMovimientoEnsamble(m: InventarioMovimientoDoc): boolean {
  return m.id.startsWith("wmsEns:");
}

type EntradaCatalogoCruda = { item: InsumoKitItem; origen: string };

function recolectarCatalogoCrudo(
  sheet: InsumoKitItem[],
  firestore: InsumoKitItem[],
  productosPos: ReturnType<typeof expandirItemsInventarioDesdeProductosPos>
): EntradaCatalogoCruda[] {
  const out: EntradaCatalogoCruda[] = [];
  for (const item of sheet) out.push({ item, origen: "Hoja Google" });
  for (const item of firestore) out.push({ item, origen: "Firestore kit" });
  for (const item of productosPos) out.push({ item, origen: "Catálogo POS" });
  return out;
}

function detectarDuplicadosCatalogo(crudo: EntradaCatalogoCruda[]): GrupoDuplicadoCatalogo[] {
  const porClave = new Map<string, EntradaCatalogoCruda[]>();
  for (const e of crudo) {
    const ck = claveKitDesdeInsumo(e.item);
    if (!ck) continue;
    const arr = porClave.get(ck) ?? [];
    arr.push(e);
    porClave.set(ck, arr);
  }
  const grupos: GrupoDuplicadoCatalogo[] = [];
  for (const [claveKit, entradas] of Array.from(porClave.entries())) {
    const idsUnicos = new Set(entradas.map((x: EntradaCatalogoCruda) => `${x.item.id}|${normSkuInventario(x.item.sku)}`));
    if (idsUnicos.size <= 1) continue;
    grupos.push({
      claveKit,
      entradas: entradas.map((x: EntradaCatalogoCruda) => ({
        sku: x.item.sku,
        id: x.item.id,
        descripcion: x.item.descripcion,
        origen: x.origen,
      })),
    });
  }
  return grupos.sort((a, b) => a.claveKit.localeCompare(b.claveKit, "es"));
}

function detectarDescripcionesSimilares(insumos: InsumoKitItem[]): GrupoDescripcionSimilar[] {
  const porDesc = new Map<string, InsumoKitItem[]>();
  for (const item of insumos) {
    const k = claveDescripcionSimilar(item.descripcion);
    if (!k) continue;
    const arr = porDesc.get(k) ?? [];
    arr.push(item);
    porDesc.set(k, arr);
  }
  const grupos: GrupoDescripcionSimilar[] = [];
  for (const [claveDescripcion, items] of Array.from(porDesc.entries())) {
    const skus = Array.from(
      new Set(items.map((i: InsumoKitItem) => normSkuInventario(i.sku)).filter((s): s is string => Boolean(s)))
    );
    if (skus.length <= 1) continue;
    grupos.push({
      claveDescripcion,
      skus,
      descripciones: Array.from(new Set(items.map((i: InsumoKitItem) => i.descripcion.trim()))),
    });
  }
  return grupos.sort((a, b) => a.claveDescripcion.localeCompare(b.claveDescripcion, "es"));
}

function contarPorTipo(movs: InventarioMovimientoDoc[]): Record<string, number> {
  const c: Record<string, number> = {};
  for (const m of movs) {
    c[m.tipo] = (c[m.tipo] ?? 0) + 1;
  }
  return c;
}

function textoDescuentoVentas(fuente: "legacy" | "ensamble" | "ninguno", tieneVentasEnsamble: boolean): string {
  const base =
    "Cobro POS → WMS (aplicar-venta-ensamble) → DB_POS_Composición → mov. venta_ensamble en pos_inventario_ensamble_movimientos";
  if (fuente === "ensamble") {
    return `${base}. Saldo visible solo en WMS; cargue manual en pantalla no aplica hasta tener doc en posInventarioSaldos.`;
  }
  if (fuente === "legacy") {
    return tieneVentasEnsamble
      ? `${base} + cargues/ajustes en posInventarioMovimientos (ajuste editable en Inventarios).`
      : "Cargues y ajustes en posInventarioMovimientos (editable en Inventarios). Sin ventas ensamble recientes en el barrido.";
  }
  return "Sin saldo registrado; ventas pueden descontar al primer cobro con composición válida.";
}

function calcularSeveridad(hallazgos: string[]): SeveridadHallazgoInventario {
  if (
    hallazgos.some(
      (h) =>
        h.includes("Saldo negativo") ||
        h.includes("Desajuste legacy") ||
        h.includes("Desajuste ensamble") ||
        h.includes("Duplicado en catálogo")
    )
  ) {
    return "critico";
  }
  if (hallazgos.some((h) => h.includes("Descripción similar") || h.includes("Solo ensamble WMS"))) {
    return "advertencia";
  }
  return "info";
}

function construirFilaProducto(
  item: InsumoKitItem,
  porClave: Map<string, InventarioSaldoConFuente>,
  saldoRows: InventarioSaldoRow[],
  saldosLegacy: Map<string, number>,
  saldosEnsamble: Map<string, number>,
  movimientos: InventarioMovimientoDoc[],
  clavesDuplicadas: Set<string>,
  clavesSimilares: Set<string>
): FilaAuditoriaInventarioProducto {
  const ck = claveKitDesdeInsumo(item);
  const { saldo, fuente, editable, costoUnitarioReferencia: _c } = saldoMostradoYFuenteParaInsumoKit(
    item,
    porClave,
    saldoRows
  );
  const legacy = saldosLegacy.has(ck) ? saldosLegacy.get(ck)! : null;
  const ensamble = saldosEnsamble.has(ck) ? saldosEnsamble.get(ck)! : null;

  const movsItem = movimientos.filter((m) => movimientoInventarioCorrespondeAInsumoKit(m, item));
  const movLegacy = movsItem.filter((m) => !esMovimientoEnsamble(m));
  const movEns = movsItem.filter((m) => esMovimientoEnsamble(m));

  const sumaDeltaLegacy = Math.round(movLegacy.reduce((a, m) => a + (Number(m.delta) || 0), 0) * 1000) / 1000;
  const sumaDeltaEnsamble = Math.round(movEns.reduce((a, m) => a + (Number(m.delta) || 0), 0) * 1000) / 1000;

  const contLegacy = contarPorTipo(movLegacy);
  const contEns = contarPorTipo(movEns);

  const cargues = (contLegacy.cargue ?? 0) + (contEns.cargue ?? 0);
  const ventasEnsamble = (contLegacy.venta_ensamble ?? 0) + (contEns.venta_ensamble ?? 0);
  const ajustes =
    (contLegacy.ajuste_positivo ?? 0) +
    (contLegacy.ajuste_negativo ?? 0) +
    (contEns.ajuste_positivo ?? 0) +
    (contEns.ajuste_negativo ?? 0);
  const otrasSalidas =
    (contLegacy.salida_danio ?? 0) +
    (contLegacy.merma ?? 0) +
    (contLegacy.consumo_interno ?? 0) +
    (contEns.salida_danio ?? 0) +
    (contEns.merma ?? 0) +
    (contEns.consumo_interno ?? 0);

  const desajusteLegacy =
    legacy != null && movLegacy.length > 0
      ? Math.round((legacy - sumaDeltaLegacy) * 1000) / 1000
      : legacy != null && movLegacy.length === 0 && legacy !== 0
        ? legacy
        : null;
  const desajusteEnsamble =
    ensamble != null && movEns.length > 0
      ? Math.round((ensamble - sumaDeltaEnsamble) * 1000) / 1000
      : ensamble != null && movEns.length === 0 && ensamble !== 0
        ? ensamble
        : null;

  const hallazgos: string[] = [];
  const recomendaciones: string[] = [];

  if (clavesDuplicadas.has(ck)) {
    hallazgos.push("Duplicado en catálogo (misma clave kit, varios id/SKU en fuentes)");
    recomendaciones.push(
      "Dejar una sola fila en DB_Franquicia_Insumos_Kit / Firestore con SKU FRAN-KIT-*; alinear id hoja (sheet-fran-kit-N) con insumoId de movimientos."
    );
  }
  if (clavesSimilares.has(ck)) {
    hallazgos.push("Descripción similar a otro SKU distinto (riesgo de confusión en caja)");
    recomendaciones.push("Capacitar cajeros en el SKU exacto o unificar descripción y código en catálogo.");
  }
  if (saldo < 0) {
    hallazgos.push(`Saldo negativo (${saldo})`);
    recomendaciones.push("Registrar cargue inicial en Inventarios o revisar DB_POS_Composición (ventas sin stock previo).");
  }
  if (fuente === "ensamble" && !editable) {
    hallazgos.push("Solo ensamble WMS (sin doc legacy para ajuste en pantalla)");
    recomendaciones.push(
      "Para corregir stock use ajuste en WMS o registre un cargue que cree posInventarioSaldos; no use clic en saldo si la fila es solo WMS."
    );
  }
  if (desajusteLegacy != null && Math.abs(desajusteLegacy) > 0.05) {
    hallazgos.push(`Desajuste legacy: doc ${legacy} vs Σ mov. ${sumaDeltaLegacy} (Δ ${desajusteLegacy})`);
    recomendaciones.push("Revisar movimientos duplicados o aplicar ajuste de conteo en la parte POS (legacy).");
  }
  if (desajusteEnsamble != null && Math.abs(desajusteEnsamble) > 0.05) {
    hallazgos.push(`Desajuste ensamble: doc ${ensamble} vs Σ mov. ${sumaDeltaEnsamble} (Δ ${desajusteEnsamble})`);
    recomendaciones.push("Revisar composición de venta y logs WMS; el barrido usa hasta 500 movimientos recientes.");
  }
  if (legacy != null && ensamble != null && legacy !== 0 && ensamble !== 0) {
    hallazgos.push("Doble capa de saldo (POS + WMS activas)");
    recomendaciones.push(
      "Saldo mostrado = legacy + ensamble; cargues en pantalla modifican solo legacy; ventas restan vía ensamble."
    );
  }
  if (movsItem.length === 0 && saldo !== 0) {
    hallazgos.push("Saldo sin movimientos en el barrido analizado");
    recomendaciones.push("Ampliar historial en Firestore o verificar puntoVenta / puntoVentaClave del documento.");
  }

  const severidad = calcularSeveridad(hallazgos);

  return {
    sku: item.sku,
    id: item.id,
    descripcion: item.descripcion,
    categoria: item.categoria?.trim() || "—",
    saldoMostrado: saldo,
    saldoLegacy: legacy,
    saldoEnsamble: ensamble,
    fuenteSaldo: fuente,
    ajusteEditableEnPantalla: editable,
    descuentoVentas: textoDescuentoVentas(fuente, ventasEnsamble > 0),
    movLegacy: movLegacy.length,
    movEnsamble: movEns.length,
    cargues,
    ventasEnsamble,
    ajustes,
    otrasSalidas,
    sumaDeltaLegacy,
    sumaDeltaEnsamble,
    desajusteLegacy,
    desajusteEnsamble,
    severidad,
    hallazgos,
    recomendaciones,
  };
}

export function nombreArchivoAuditoriaInventarioPdf(puntoVenta: string, generadoIso: string): string {
  const slug = puntoVenta
    .trim()
    .replace(/[^\w\-]+/g, "_")
    .slice(0, 40);
  const fecha = generadoIso.slice(0, 10);
  return `auditoria-inventario-${slug || "pv"}-${fecha}.pdf`;
}

export async function cargarDatosAuditoriaInventarioPos(puntoVenta: string): Promise<DatosAuditoriaInventarioPos> {
  const pv = puntoVenta.replace(/\u00a0/g, " ").trim();
  const generadoIso = new Date().toISOString();

  const [sheetRes, saldosPack, posRes, listaFs, movimientos] = await Promise.all([
    fetchCatalogoInsumosDesdeSheet(pv),
    listarSaldosInventarioConFuentePorPuntoVenta(pv),
    getCatalogoPOS(null, pv),
    listarInsumosKitPorPuntoVenta(pv),
    listarMovimientosInventario(pv, LIMITE_MOVIMIENTOS_AUDITORIA_INVENTARIO),
  ]);

  const productosPos = posRes.ok ? posRes.productos ?? [] : [];
  const itemsPos = expandirItemsInventarioDesdeProductosPos(productosPos);
  const sheet = sheetRes.ok ? sheetRes.data : [];
  const crudo = recolectarCatalogoCrudo(sheet, listaFs, itemsPos);

  let fuenteCatalogo: "sheet" | "firestore" | "wms" = "wms";
  let insumos: InsumoKitItem[] = [];

  if (sheet.length > 0) {
    const mergedBase = mergeCatalogoInventarioBase(sheet, listaFs);
    const merged = mergeCatalogoInventarioConProductosPos(mergedBase, productosPos);
    insumos = merged.items;
    fuenteCatalogo = "sheet";
  } else {
    const merged = mergeCatalogoInventarioConProductosPos(listaFs, productosPos);
    insumos = merged.items;
    fuenteCatalogo = listaFs.length > 0 ? "firestore" : "wms";
  }

  const duplicadosCatalogo = detectarDuplicadosCatalogo(crudo);
  const descripcionesSimilares = detectarDescripcionesSimilares(insumos);

  const clavesDuplicadas = new Set(duplicadosCatalogo.map((g) => g.claveKit));
  const clavesSimilares = new Set<string>();
  for (const g of descripcionesSimilares) {
    for (const item of insumos) {
      if (g.skus.includes(normSkuInventario(item.sku))) {
        clavesSimilares.add(claveKitDesdeInsumo(item));
      }
    }
  }

  const saldosLegacy = saldoPorClaveKit(saldosPack.legacyRows);
  const saldosEnsamble = saldoPorClaveKit(saldosPack.ensambleRows);

  const productos = insumos
    .map((item) =>
      construirFilaProducto(
        item,
        saldosPack.porClave,
        saldosPack.saldoRows,
        saldosLegacy,
        saldosEnsamble,
        movimientos,
        clavesDuplicadas,
        clavesSimilares
      )
    )
    .sort((a, b) => {
      const ord = { critico: 0, advertencia: 1, info: 2 };
      const d = ord[a.severidad] - ord[b.severidad];
      if (d !== 0) return d;
      return a.descripcion.localeCompare(b.descripcion, "es");
    });

  const resumen: ResumenAuditoriaInventario = {
    productosCatalogo: productos.length,
    conSaldo: productos.filter((p) => p.saldoMostrado !== 0).length,
    saldoNegativo: productos.filter((p) => p.saldoMostrado < 0).length,
    duplicadosCatalogo: duplicadosCatalogo.length,
    descripcionesSimilares: descripcionesSimilares.length,
    desajusteLegacy: productos.filter((p) => p.desajusteLegacy != null && Math.abs(p.desajusteLegacy) > 0.05).length,
    desajusteEnsamble: productos.filter((p) => p.desajusteEnsamble != null && Math.abs(p.desajusteEnsamble) > 0.05).length,
    soloEnsambleSinLegacy: productos.filter((p) => p.fuenteSaldo === "ensamble").length,
    criticos: productos.filter((p) => p.severidad === "critico").length,
    advertencias: productos.filter((p) => p.severidad === "advertencia").length,
  };

  return {
    puntoVenta: pv,
    generadoIso,
    fuenteCatalogo,
    incluyeCatalogoPos: productosPos.length > 0,
    limiteMovimientos: LIMITE_MOVIMIENTOS_AUDITORIA_INVENTARIO,
    resumen,
    duplicadosCatalogo,
    descripcionesSimilares,
    productos,
    notasMetodologia: [
      "Saldo mostrado = posInventarioSaldos (legacy) + pos_inventario_ensamble_saldo (WMS) fusionados por SKU/clave kit.",
      "Los movimientos analizados son los más recientes (legacy + ensamble), hasta el límite indicado.",
      "Desajuste compara cantidad del documento de saldo con la suma de delta de movimientos del mismo canal.",
      "Duplicados: varias filas de catálogo con la misma clave kit (p. ej. sheet-fran-kit-6 y FRAN-KIT-6 ya fusionados en pantalla, pero entradas crudas distintas en fuentes).",
      "Ventas en caja descontarán insumos según DB_POS_Composición en el WMS, no según el SKU mostrado en la tabla si es distinto al producto vendido.",
    ],
  };
}

export function etiquetaFuenteCatalogoAuditoria(f: DatosAuditoriaInventarioPos["fuenteCatalogo"]): string {
  switch (f) {
    case "sheet":
      return "Hoja Google (DB_Franquicia_Insumos_Kit)";
    case "firestore":
      return "Firestore DB_Franquicia_Insumos_Kit";
    default:
      return "Catálogo POS / WMS";
  }
}

export function etiquetaSeveridad(s: SeveridadHallazgoInventario): string {
  switch (s) {
    case "critico":
      return "Crítico";
    case "advertencia":
      return "Advertencia";
    default:
      return "OK / info";
  }
}

export function etiquetaFuenteSaldo(f: FilaAuditoriaInventarioProducto["fuenteSaldo"]): string {
  switch (f) {
    case "legacy":
      return "POS (legacy)";
    case "ensamble":
      return "WMS ensamble";
    default:
      return "Sin saldo";
  }
}
