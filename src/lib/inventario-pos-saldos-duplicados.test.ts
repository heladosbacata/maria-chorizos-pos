import { describe, expect, it } from "vitest";
import {
  cantidadSaldoParaInsumoKit,
  elegirSaldoPreferido,
  mergeSaldosInventarioLegacyYEnsamble,
  type InventarioSaldoRow,
} from "@/lib/inventario-pos-firestore";
import type { InsumoKitItem } from "@/types/inventario-pos";

const canon: InventarioSaldoRow = {
  insumoId: "FRAN-KIT-5",
  insumoSku: "FRAN-KIT-5",
  cantidad: 400,
  costoUnitarioPromedio: 2900,
};

const leftover: InventarioSaldoRow = {
  insumoId: "sheet-frankit5",
  insumoSku: "FRAN-KIT-5",
  cantidad: 0,
};

const item: InsumoKitItem = {
  id: "FRAN-KIT-5",
  sku: "FRAN-KIT-5",
  descripcion: "Chorizo Tradicional",
  unidad: "und",
};

describe("elegirSaldoPreferido", () => {
  it("prefiere el saldo canónico sobre el leftover sheet-", () => {
    expect(elegirSaldoPreferido(leftover, canon)).toEqual(canon);
    expect(elegirSaldoPreferido(canon, leftover)).toEqual(canon);
  });
});

describe("cantidadSaldoParaInsumoKit", () => {
  it("no deja que el leftover en cero tape el cargue canónico", () => {
    expect(cantidadSaldoParaInsumoKit(item, [leftover, canon])).toBe(400);
    expect(cantidadSaldoParaInsumoKit(item, [canon, leftover])).toBe(400);
  });
});

describe("mergeSaldosInventarioLegacyYEnsamble", () => {
  it("fusiona leftover + canónico y suma solo el canónico con ensamble en cero", () => {
    const merged = mergeSaldosInventarioLegacyYEnsamble(
      [leftover, canon],
      [{ insumoId: "FRAN-KIT-5", insumoSku: "FRAN-KIT-5", cantidad: 0 }]
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]?.cantidad).toBe(400);
    expect(merged[0]?.insumoId).toBe("FRAN-KIT-5");
  });
});
