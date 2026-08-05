import { describe, expect, it } from "vitest";
import { tabCatalogoDeProducto } from "@/lib/pos-pedidos-catalogo-tabs";
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
});
