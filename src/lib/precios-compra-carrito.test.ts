import { describe, expect, it } from "vitest";
import {
  buildMapaPreciosCarrito,
  precioCompraCarritoParaInsumo,
  precioCompraDesdeHojaInsumo,
  precioCompraParaInsumo,
  preciosCompraInicialesDesdeCarrito,
} from "@/lib/precios-compra-carrito";
import type { InsumoKitItem } from "@/types/inventario-pos";

describe("precios-compra-carrito", () => {
  const carrito = buildMapaPreciosCarrito([
    { sku: "PT-ARE-PETOQ-X6", producto: "Arepa de Peto con Queso x6,Arepas,Paquete", precio: 16800 },
    { sku: "PT-CHO-TRADI-X10", producto: "Chorizo Tradicional x10", precio: 29000, promo: true, precioPromo: 25000 },
  ]);

  it("empareja por SKU del carrito (skuCarrito en insumo)", () => {
    const item: InsumoKitItem = {
      id: "gs-fran-kit-2",
      sku: "FRAN-KIT-2",
      skuCarrito: "PT-ARE-PETOQ-X6",
      descripcion: "Arepa de Peto con Queso x6",
      unidad: "und",
    };
    expect(precioCompraCarritoParaInsumo(item, carrito)).toBe(16800);
  });

  it("empareja por nombre cuando el SKU kit es distinto (FRAN-KIT vs PT-*)", () => {
    const item: InsumoKitItem = {
      id: "gs-fran-kit-2",
      sku: "FRAN-KIT-2",
      descripcion: "Arepa de Peto con Queso x6",
      unidad: "und",
    };
    expect(precioCompraCarritoParaInsumo(item, carrito)).toBe(16800);
  });

  it("usa precio promo del carrito cuando aplica", () => {
    const item: InsumoKitItem = {
      id: "x",
      sku: "FRAN-KIT-99",
      descripcion: "Chorizo Tradicional x10",
      unidad: "und",
    };
    expect(precioCompraCarritoParaInsumo(item, carrito)).toBe(25000);
  });

  it("rellena preciosCompraInicialesDesdeCarrito por id de catálogo", () => {
    const insumos: InsumoKitItem[] = [
      { id: "a", sku: "FRAN-KIT-1", descripcion: "Arepa de Peto con Queso x6", unidad: "und" },
      { id: "b", sku: "SIN-MATCH", descripcion: "Producto desconocido", unidad: "und" },
    ];
    expect(preciosCompraInicialesDesdeCarrito(insumos, carrito)).toEqual({ a: "16800" });
  });

  it("prioriza PRECIO_COMPRA_UNITARIO de la hoja insumos sobre DB_Carrito", () => {
    const item: InsumoKitItem = {
      id: "gs-fran-kit-2",
      sku: "FRAN-KIT-2",
      skuCarrito: "PT-ARE-PETOQ-X6",
      descripcion: "Arepa de Peto con Queso x6",
      unidad: "und",
      precioCompraUnitario: 2800,
    };
    expect(precioCompraDesdeHojaInsumo(item)).toBe(2800);
    expect(precioCompraParaInsumo(item, carrito)).toBe(2800);
    expect(precioCompraCarritoParaInsumo(item, carrito)).toBe(16800);
  });

  it("usa carrito como respaldo si falta precio en hoja insumos", () => {
    const item: InsumoKitItem = {
      id: "gs-fran-kit-2",
      sku: "FRAN-KIT-2",
      descripcion: "Arepa de Peto con Queso x6",
      unidad: "und",
    };
    expect(precioCompraParaInsumo(item, carrito)).toBe(16800);
  });
});
