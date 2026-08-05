import { describe, expect, it } from "vitest";
import {
  productoEsChimichurriPorLitroTab,
  subtituloTarjetaCatalogoPedidos,
  tabCatalogoDeProducto,
} from "@/lib/pos-pedidos-catalogo-tabs";
import type { ProductoPOS } from "@/types";

function prod(partial: Partial<ProductoPOS> & Pick<ProductoPOS, "sku" | "descripcion">): ProductoPOS {
  return {
    sku: partial.sku,
    descripcion: partial.descripcion,
    precioUnitario: partial.precioUnitario ?? 10000,
    categoria: partial.categoria,
    urlImagen: partial.urlImagen,
  } as ProductoPOS;
}

describe("tabCatalogoDeProducto", () => {
  it("manda categoría Básicos al tab basicos", () => {
    expect(
      tabCatalogoDeProducto(prod({ sku: "1", descripcion: "Chorizo con salsa de ajo", categoria: "Básicos" }))
    ).toBe("basicos");
  });

  it("no clasifica un básico como adicional por la palabra salsa", () => {
    expect(
      tabCatalogoDeProducto(prod({ sku: "2", descripcion: "Arepa con salsa", categoria: "Basicos" }))
    ).toBe("basicos");
  });

  it("clasifica Complementos como adicionales", () => {
    expect(
      tabCatalogoDeProducto(prod({ sku: "3", descripcion: "Salsa extra", categoria: "Complementos" }))
    ).toBe("adicionales");
  });

  it("clasifica bebidas por categoría", () => {
    expect(tabCatalogoDeProducto(prod({ sku: "4", descripcion: "Agua Brisa", categoria: "Bebidas" }))).toBe(
      "bebidas"
    );
  });

  it("clasifica combos por nombre", () => {
    expect(tabCatalogoDeProducto(prod({ sku: "5", descripcion: "Combo familiar", categoria: "Especialidades" }))).toBe(
      "combos"
    );
  });

  it("manda especialidades sin categoría especial a basicos para que no desaparezcan", () => {
    expect(
      tabCatalogoDeProducto(prod({ sku: "6", descripcion: "Plato del día", categoria: "Especialidades" }))
    ).toBe("basicos");
  });

  it("pone chimichurri por litro en paquetes (aunque sea Complemento)", () => {
    expect(
      tabCatalogoDeProducto(
        prod({ sku: "CHI-1L", descripcion: "Salsa chimichurri por litro", categoria: "Complementos" })
      )
    ).toBe("paquetes");
    expect(
      tabCatalogoDeProducto(prod({ sku: "CHI-LT", descripcion: "Chimichurri 1L", categoria: "Especialidades" }))
    ).toBe("paquetes");
    expect(
      productoEsChimichurriPorLitroTab(prod({ sku: "X", descripcion: "Salsa de chimichurri (porción)" }))
    ).toBe(false);
  });

  it("clasifica paquetes por nombre", () => {
    expect(
      tabCatalogoDeProducto(prod({ sku: "PQ-1", descripcion: "Paquete chorizos x10", categoria: "Especialidades" }))
    ).toBe("paquetes");
  });

  it("subtítulo listo para llevar solo en paquetes", () => {
    expect(
      subtituloTarjetaCatalogoPedidos(
        prod({ sku: "PQ-1", descripcion: "Paquete chorizos", categoria: "Especialidades" })
      )
    ).toBe("Producto fresco listo para llevar.");
    expect(
      subtituloTarjetaCatalogoPedidos(
        prod({ sku: "CHI-1L", descripcion: "Chimichurri por litro", categoria: "Complementos" })
      )
    ).toBe("Producto fresco listo para llevar.");
    expect(
      subtituloTarjetaCatalogoPedidos(prod({ sku: "1", descripcion: "Chorizo con pan", categoria: "Básicos" }))
    ).toBe("Producto fresco, preparado al momento.");
  });
});
