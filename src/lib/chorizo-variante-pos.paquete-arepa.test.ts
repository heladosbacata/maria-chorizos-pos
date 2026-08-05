import { describe, expect, it } from "vitest";
import type { ProductoPOS } from "@/types";
import {
  productoEsPaqueteArepa,
  productoRequiereSoloTipoArepaPeto,
} from "@/lib/chorizo-variante-pos";

function prod(partial: Partial<ProductoPOS> & Pick<ProductoPOS, "sku" | "descripcion">): ProductoPOS {
  return {
    precioUnitario: 10000,
    categoria: "Especialidades",
    urlImagen: null,
    ...partial,
  } as ProductoPOS;
}

describe("paquetes de arepas sin variante", () => {
  it("detecta paquete de arepas", () => {
    expect(
      productoEsPaqueteArepa(prod({ sku: "PQ-ARE-Q", descripcion: "Paquete Arepa de Peto con Queso x6" }))
    ).toBe(true);
    expect(
      productoEsPaqueteArepa(
        prod({ sku: "PQ-ARE-B", descripcion: "Paquete Arepa de Peto con Queso y Bocadillo x6" })
      )
    ).toBe(true);
    expect(productoEsPaqueteArepa(prod({ sku: "PET-QUESO", descripcion: "Arepa de peto con queso" }))).toBe(
      false
    );
  });

  it("no exige selector queso/bocadillo en paquetes de arepas", () => {
    expect(
      productoRequiereSoloTipoArepaPeto(
        prod({ sku: "PQ-ARE-Q", descripcion: "Paquete Arepa de Peto con Queso x6" })
      )
    ).toBe(false);
    expect(
      productoRequiereSoloTipoArepaPeto(
        prod({
          sku: "PET-PQ-QUESO",
          descripcion: "Paquete arepas peto queso",
          categoria: "Paquetes",
        })
      )
    ).toBe(false);
    // Unidad suelta (no paquete) sí puede pedir tipo de arepa
    expect(
      productoRequiereSoloTipoArepaPeto(prod({ sku: "PET-QUESO", descripcion: "Arepa de peto con queso" }))
    ).toBe(true);
  });
});
