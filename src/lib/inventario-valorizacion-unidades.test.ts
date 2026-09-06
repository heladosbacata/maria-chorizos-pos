import { describe, expect, it } from "vitest";
import {
  clasificarUnidadInventario,
  metaCostoInventarioItem,
  valorStockValorizado,
} from "./inventario-valorizacion-unidades";

describe("inventario-valorizacion-unidades", () => {
  it("clasifica ml y litro del campo unidad", () => {
    expect(clasificarUnidadInventario("ml", "Salsa ajo")).toBe("ml");
    expect(clasificarUnidadInventario("Mililitros", "")).toBe("ml");
    expect(clasificarUnidadInventario("Litro", "Chimichurri")).toBe("l");
    expect(clasificarUnidadInventario("und", "Chimichurri 500 ml")).toBe("ml");
  });

  it("salsas «1 Litro» con unidad und = saldo en ml (no litros)", () => {
    expect(
      clasificarUnidadInventario("und", "Salsa de Ajo 1 Litro", "PT-SAL-AJO-1L")
    ).toBe("ml");
    expect(
      clasificarUnidadInventario("und", "Salsa de Chimichurri 1 Litro", "PT-SAL-CHIMI-1L")
    ).toBe("ml");
  });

  it("valoriza salsa real POS: 1000 und(ml) × $18.000/L = $18.000", () => {
    const item = {
      unidad: "und",
      descripcion: "Salsa de Ajo 1 Litro",
      sku: "PT-SAL-AJO-1L",
    };
    expect(valorStockValorizado(1000, 18_000, item)).toBe(18_000);
    const meta = metaCostoInventarioItem(18_000, item);
    expect(meta?.convirtioMacroAMicro).toBe(true);
    expect(meta?.etiquetaCosto).toMatch(/ml/i);
  });

  it("valoriza salsa con unidad ml: 1000 ml con precio 18.000/L = 18.000", () => {
    const item = { unidad: "ml", descripcion: "Salsa chimichurri" };
    expect(valorStockValorizado(1000, 18_000, item)).toBe(18_000);
    const meta = metaCostoInventarioItem(18_000, item);
    expect(meta?.convirtioMacroAMicro).toBe(true);
  });

  it("no convierte si el costo ya parece por ml", () => {
    const item = { unidad: "ml", descripcion: "Salsa" };
    expect(valorStockValorizado(1000, 18, item)).toBe(18_000);
    expect(metaCostoInventarioItem(18, item)?.convirtioMacroAMicro).toBe(false);
  });

  it("litro explícito en campo unidad sin conversión", () => {
    const item = { unidad: "litro", descripcion: "Chimichurri por litro" };
    expect(valorStockValorizado(2, 18_000, item)).toBe(36_000);
  });

  it("chorizos x10: 1000 und con precio $29.000/paq = $2.900.000 (no 29 millones)", () => {
    const item = {
      unidad: "und",
      descripcion: "Chorizo Picante x10",
      sku: "PT-CHO-PICAN-X10",
    };
    expect(valorStockValorizado(1000, 29_000, item)).toBe(2_900_000);
    const meta = metaCostoInventarioItem(29_000, item);
    expect(meta?.convirtioMacroAMicro).toBe(true);
    expect(meta?.etiquetaCosto).toMatch(/paq/i);
  });

  it("papel parafinado x100: no valorizar hoja × $15.000", () => {
    const item = {
      unidad: "und",
      descripcion: "Papel Parafinado x 100",
      sku: "PAP-PARAFINADO-X100",
    };
    // 96 paq + 99 und = 9.699 und
    expect(valorStockValorizado(9699, 15_000, item)).toBe(1_454_850);
    expect(metaCostoInventarioItem(15_000, item)?.etiquetaCosto).toBe("COP/paq x100");
  });

  it("servilleta x200: precio por paquete", () => {
    const item = {
      unidad: "und",
      descripcion: "Servilleta Maria Chorizos x 200, Paquete",
      sku: "EMP-SERVILLETA-X200",
    };
    expect(valorStockValorizado(400, 20_000, item)).toBe(40_000);
    expect(metaCostoInventarioItem(20_000, item)?.etiquetaCosto).toBe("COP/paq x200");
  });

  it("arepa x6 con unidadesPorPaquete explícito", () => {
    const item = {
      unidad: "und",
      descripcion: "Arepa Bocadillo y queso",
      sku: "PT-ARE-PETOQB",
      unidadesPorPaquete: 6,
    };
    expect(valorStockValorizado(60, 16_800, item)).toBe(168_000);
  });
});
