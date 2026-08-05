import { describe, expect, it } from "vitest";
import type { ProductoPOS } from "@/types";
import {
  esTokenSalsaPedido,
  etiquetaSalsaFavorita,
  etiquetaTokenSalsaPedido,
  productoEsHawaiano,
  productoRequiereSalsaFavorita,
  toggleSalsaFavoritaEnToken,
  tokenDesdeSalsas,
  tokenSinSalsa,
} from "@/lib/chorizo-variante-pos";

function prod(partial: Partial<ProductoPOS> & Pick<ProductoPOS, "sku" | "descripcion">): ProductoPOS {
  return {
    precioUnitario: 10000,
    categoria: "Platos",
    ...partial,
  } as ProductoPOS;
}

describe("salsa favorita pedidos", () => {
  it("etiquetas", () => {
    expect(etiquetaSalsaFavorita("ajo")).toBe("Salsa de ajo");
    expect(etiquetaSalsaFavorita("chimichurri")).toBe("Salsa de chimichurri");
    expect(etiquetaTokenSalsaPedido("sin")).toBe("Sin salsas");
    expect(etiquetaTokenSalsaPedido("ajo+chimichurri")).toBe("Salsa de ajo + Salsa de chimichurri");
  });

  it("detecta hawaiano", () => {
    expect(productoEsHawaiano(prod({ sku: "HAW-01", descripcion: "Chorizo Hawaiano" }))).toBe(true);
    expect(productoEsHawaiano(prod({ sku: "X", descripcion: "Combo hawaiana especial" }))).toBe(true);
    expect(productoEsHawaiano(prod({ sku: "CHO-1", descripcion: "Chorizo con pan" }))).toBe(false);
  });

  it("exige elección de salsa en chorizo pan/arepa y hawaiano", () => {
    expect(
      productoRequiereSalsaFavorita(prod({ sku: "CHO-PAN", descripcion: "Chorizo con pan" }))
    ).toBe(true);
    expect(
      productoRequiereSalsaFavorita(prod({ sku: "CHO-ARE", descripcion: "Chorizo con arepa de peto" }))
    ).toBe(true);
    expect(
      productoRequiereSalsaFavorita(prod({ sku: "COMBO-1", descripcion: "Combo chorizo arepa" }))
    ).toBe(true);
    expect(
      productoRequiereSalsaFavorita(prod({ sku: "HAW", descripcion: "Hawaiano" }))
    ).toBe(true);
    expect(
      productoRequiereSalsaFavorita(prod({ sku: "PET-QUESO", descripcion: "Arepa de peto con queso" }))
    ).toBe(false);
    expect(
      productoRequiereSalsaFavorita(prod({ sku: "BEB-1", descripcion: "Gaseosa", categoria: "Bebidas" }))
    ).toBe(false);
  });

  it("permite sin salsas o ambas", () => {
    expect(tokenSinSalsa()).toBe("sin");
    expect(esTokenSalsaPedido("sin")).toBe(true);
    expect(tokenDesdeSalsas(["chimichurri", "ajo"])).toBe("ajo+chimichurri");
    expect(esTokenSalsaPedido("ajo+chimichurri")).toBe(true);
    expect(esTokenSalsaPedido("chimichurri+ajo")).toBe(false);

    expect(toggleSalsaFavoritaEnToken(null, "ajo")).toBe("ajo");
    expect(toggleSalsaFavoritaEnToken("ajo", "chimichurri")).toBe("ajo+chimichurri");
    expect(toggleSalsaFavoritaEnToken("ajo+chimichurri", "ajo")).toBe("chimichurri");
    expect(toggleSalsaFavoritaEnToken("sin", "ajo")).toBe("ajo");
    expect(toggleSalsaFavoritaEnToken("ajo", "ajo")).toBe(null);
  });
});
