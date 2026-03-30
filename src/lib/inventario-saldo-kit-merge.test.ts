import { describe, expect, it } from "vitest";
import {
  cantidadSaldoParaInsumoKit,
  claveParaConsolidarSaldoKit,
  type InventarioSaldoRow,
} from "./inventario-pos-firestore";
import type { InsumoKitItem } from "@/types/inventario-pos";

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
