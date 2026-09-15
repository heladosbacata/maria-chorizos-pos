import { describe, expect, it } from "vitest";
import {
  cantidadSaldoParaInsumoKit,
  claveParaConsolidarSaldoKit,
  mergeSaldosInventarioLegacyYEnsamble,
  saldoRowDesdeFirestoreSaldoDoc,
  unirSaldosEnsamblePorClave,
  type InventarioSaldoRow,
} from "./inventario-pos-firestore";
import type { InsumoKitItem } from "@/types/inventario-pos";

describe("saldoRowDesdeFirestoreSaldoDoc (WMS)", () => {
  it("arma fila solo con skuComponente y cantidad (sin insumoId)", () => {
    const row = saldoRowDesdeFirestoreSaldoDoc({
      skuComponente: "FRAN-KIT-5",
      cantidad: 97,
      puntoVenta: "CC Altavista Usme",
    });
    expect(row).toEqual({
      insumoId: "FRAN-KIT-5",
      insumoSku: "FRAN-KIT-5",
      cantidad: 97,
    });
  });

  it("acepta stock como alias de cantidad", () => {
    const row = saldoRowDesdeFirestoreSaldoDoc({ insumoId: "FRAN-KIT-1", stock: 42 });
    expect(row?.cantidad).toBe(42);
  });
});

describe("claveParaConsolidarSaldoKit", () => {
  it("usa insumoSku cuando existe", () => {
    const r: InventarioSaldoRow = { insumoId: "FRAN-KIT-5", insumoSku: "FRAN-KIT-5", cantidad: 1 };
    expect(claveParaConsolidarSaldoKit(r)).toBe("fran-kit-5");
  });

  it("quita prefijo sheet- del insumoId si no hay sku", () => {
    const r: InventarioSaldoRow = { insumoId: "sheet-fran-kit-6", insumoSku: "", cantidad: 10 };
    expect(claveParaConsolidarSaldoKit(r)).toBe("fran-kit-6");
  });

  it("quita prefijo gs-", () => {
    const r: InventarioSaldoRow = { insumoId: "gs-fran-kit-1", insumoSku: "", cantidad: 3 };
    expect(claveParaConsolidarSaldoKit(r)).toBe("fran-kit-1");
  });
});

describe("cantidadSaldoParaInsumoKit con hoja vs WMS", () => {
  const itemHoja: InsumoKitItem = {
    id: "sheet-fran-kit-5",
    sku: "FRAN-KIT-5",
    descripcion: "Chorizo Tradicional",
    unidad: "und",
  };

  it("prefiere fila WMS (insumoId = código kit) sobre legacy con id hoja", () => {
    const legacy: InventarioSaldoRow = {
      insumoId: "sheet-fran-kit-5",
      insumoSku: "FRAN-KIT-5",
      cantidad: 100,
    };
    const wms: InventarioSaldoRow = { insumoId: "FRAN-KIT-5", insumoSku: "FRAN-KIT-5", cantidad: 94 };
    const merged = [wms];
    expect(cantidadSaldoParaInsumoKit(itemHoja, merged)).toBe(94);
  });

  it("con ambas filas sin fusionar previa, elige por SKU (primera coincidencia)", () => {
    const legacy: InventarioSaldoRow = {
      insumoId: "sheet-fran-kit-5",
      insumoSku: "FRAN-KIT-5",
      cantidad: 100,
    };
    const wms: InventarioSaldoRow = { insumoId: "FRAN-KIT-5", insumoSku: "FRAN-KIT-5", cantidad: 94 };
    expect(cantidadSaldoParaInsumoKit(itemHoja, [legacy, wms])).toBe(100);
  });

  it("tras fusionar por clave (WMS último), un solo row con cantidad WMS", () => {
    const map = new Map<string, InventarioSaldoRow>();
    const legacy: InventarioSaldoRow = {
      insumoId: "sheet-fran-kit-5",
      insumoSku: "FRAN-KIT-5",
      cantidad: 100,
    };
    const wms: InventarioSaldoRow = { insumoId: "FRAN-KIT-5", insumoSku: "FRAN-KIT-5", cantidad: 94 };
    map.set(claveParaConsolidarSaldoKit(legacy), legacy);
    map.set(claveParaConsolidarSaldoKit(wms), wms);
    const rows = Array.from(map.values());
    expect(cantidadSaldoParaInsumoKit(itemHoja, rows)).toBe(94);
  });
});

describe("mergeSaldosInventarioLegacyYEnsamble", () => {
  it("prevalece saldo absoluto del WMS sobre el cargue POS", () => {
    const legacy: InventarioSaldoRow = {
      insumoId: "sheet-fran-kit-5",
      insumoSku: "FRAN-KIT-5",
      cantidad: 100,
    };
    const wms: InventarioSaldoRow = { insumoId: "FRAN-KIT-5", insumoSku: "FRAN-KIT-5", cantidad: 94 };
    const merged = mergeSaldosInventarioLegacyYEnsamble([legacy], [wms]);
    expect(merged).toHaveLength(1);
    expect(merged[0].cantidad).toBe(94);
  });

  it("suma neto negativo del WMS al cargue POS", () => {
    const legacy: InventarioSaldoRow = {
      insumoId: "sheet-fran-kit-5",
      insumoSku: "FRAN-KIT-5",
      cantidad: 100,
    };
    const wms: InventarioSaldoRow = { insumoId: "FRAN-KIT-5", insumoSku: "FRAN-KIT-5", cantidad: -3 };
    const merged = mergeSaldosInventarioLegacyYEnsamble([legacy], [wms]);
    expect(merged[0].cantidad).toBe(97);
  });
});

describe("unirSaldosEnsamblePorClave", () => {
  it("no duplica el mismo kit si aparece en dos consultas", () => {
    const a: InventarioSaldoRow = { insumoId: "FRAN-KIT-1", insumoSku: "FRAN-KIT-1", cantidad: 10 };
    const b: InventarioSaldoRow = { insumoId: "FRAN-KIT-1", insumoSku: "FRAN-KIT-1", cantidad: 10 };
    expect(unirSaldosEnsamblePorClave([a, b])).toHaveLength(1);
    expect(unirSaldosEnsamblePorClave([a, b])[0].cantidad).toBe(10);
  });
});
