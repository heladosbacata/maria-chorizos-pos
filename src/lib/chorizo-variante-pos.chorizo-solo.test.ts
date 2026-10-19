import { describe, expect, it } from "vitest";
import type { ProductoPOS } from "@/types";
import { productoRequiereSoloChorizoPan, productoRequiereVarianteChorizo } from "@/lib/chorizo-variante-pos";

function prod(partial: Partial<ProductoPOS> & Pick<ProductoPOS, "sku" | "descripcion">): ProductoPOS {
  return {
    precioUnitario: 7000,
    categoria: "Chorizos",
    urlImagen: null,
    ...partial,
  } as ProductoPOS;
}

describe("chorizo solo pide picante o tradicional", () => {
  it("abre el selector en Chorizo Solo y en el SKU LMO-SOLO", () => {
    expect(productoRequiereSoloChorizoPan(prod({ sku: "LMO-SOLO-unidad", descripcion: "Chorizo Solo" }))).toBe(
      true
    );
    expect(productoRequiereVarianteChorizo(prod({ sku: "LMO-SOLO-unidad", descripcion: "LMO-SOLO-unidad" }))).toBe(
      true
    );
  });

  it("abre el selector si el WMS guardó las claves picante y tradicional", () => {
    expect(
      productoRequiereSoloChorizoPan(
        prod({
          sku: "OTRO",
          descripcion: "Unidad",
          variantes: [
            { clave: "tradicional", etiqueta: "Tradicional" },
            { clave: "picante", etiqueta: "Picante" },
          ],
        })
      )
    ).toBe(true);
  });

  it("no cambia el chorizo con arepa", () => {
    expect(
      productoRequiereSoloChorizoPan(
        prod({ sku: "CHO-ARE", descripcion: "Chorizo con arepa", variantes: [{ clave: "picante", etiqueta: "Picante" }, { clave: "tradicional", etiqueta: "Tradicional" }] })
      )
    ).toBe(false);
  });
});
