import { describe, expect, it } from "vitest";
import type { ItemCuenta } from "@/types/pos-caja-item";
import {
  contarAplicadosEnsambleReportados,
  lineasWmsEnsambleDesdeItemsCuenta,
  skuBaseDesdeSkuProductoEnsamble,
} from "./wms-aplicar-venta-ensamble";

function item(
  sku: string,
  cantidad: number,
  opts?: Partial<Pick<ItemCuenta, "varianteChorizo" | "varianteArepaCombo">>
): ItemCuenta {
  return {
    lineId: `${sku}-x`,
    producto: {
      sku,
      descripcion: "Test",
      precioUnitario: 1000,
      urlImagen: null,
    },
    cantidad,
    ...opts,
  };
}

describe("skuBaseDesdeSkuProductoEnsamble", () => {
  it("devuelve el string completo si no hay pipe", () => {
    expect(skuBaseDesdeSkuProductoEnsamble("FRAN-X-1")).toBe("FRAN-X-1");
  });
  it("toma solo la parte antes del primer pipe", () => {
    expect(skuBaseDesdeSkuProductoEnsamble("SKU|chorizo:picante|arepa:arepa_queso")).toBe("SKU");
  });
});

describe("lineasWmsEnsambleDesdeItemsCuenta", () => {
  it("arma skuProducto, cantidad y sku base", () => {
    const lines = lineasWmsEnsambleDesdeItemsCuenta([item("MC-001", 2)]);
    expect(lines).toEqual([{ skuProducto: "MC-001", cantidad: 2, sku: "MC-001" }]);
  });
  it("incluye variantes María Chorizos en skuProducto", () => {
    const lines = lineasWmsEnsambleDesdeItemsCuenta([
      item("MC-CHO", 1, { varianteChorizo: "picante", varianteArepaCombo: "arepa_queso" }),
    ]);
    expect(lines[0]?.skuProducto).toBe("MC-CHO|chorizo:picante|arepa:arepa_queso");
    expect(lines[0]?.sku).toBe("MC-CHO");
    expect(lines[0]?.cantidad).toBe(1);
  });
  it("redondea cantidad y mínimo 1", () => {
    const lines = lineasWmsEnsambleDesdeItemsCuenta([item("A", 0.4)]);
    expect(lines[0]?.cantidad).toBe(1);
  });
  it("omite productos sin sku", () => {
    const bad: ItemCuenta = {
      lineId: "x",
      producto: { sku: "   ", descripcion: "x", precioUnitario: 1, urlImagen: null },
      cantidad: 1,
    };
    expect(lineasWmsEnsambleDesdeItemsCuenta([bad])).toEqual([]);
  });
});

describe("contarAplicadosEnsambleReportados", () => {
  it("lee número", () => {
    expect(contarAplicadosEnsambleReportados({ ok: true, status: 200, aplicados: 3 })).toBe(3);
  });
  it("lee longitud de array", () => {
    expect(
      contarAplicadosEnsambleReportados({ ok: true, status: 200, aplicados: [{}, {}] })
    ).toBe(2);
  });
  it("null si no viene aplicados", () => {
    expect(contarAplicadosEnsambleReportados({ ok: true, status: 200 })).toBeNull();
  });
});
