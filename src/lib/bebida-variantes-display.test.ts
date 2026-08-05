import { describe, expect, it } from "vitest";
import type { ProductoPOS } from "@/types";
import {
  canonEtiquetaVarianteBebida,
  descripcionBebidaParaUi,
  descripcionProductoSinTamanoEnNombre,
  variantesBebidaParaUi,
} from "@/lib/bebida-variantes-display";

function agua(partial?: Partial<ProductoPOS>): ProductoPOS {
  return {
    sku: "AGUA-BRISA",
    descripcion: "Agua Brisa 600ml",
    categoria: "Bebidas",
    precioUnitario: 3000,
    urlImagen: null,
    variantes: [
      { clave: "SIN_GAS", etiqueta: "Sin Gas", precioVenta: 3000 },
      { clave: "CON_GAS", etiqueta: "Con Gas", precioVenta: 3000 },
      { clave: "PET_250", etiqueta: "Pet 250", precioVenta: 2000 },
      { clave: "PET_250_ML", etiqueta: "Pet 250 ML", precioVenta: 2000 },
    ],
    preciosPorVariante: {},
    ...partial,
  };
}

describe("bebida-variantes-display", () => {
  it("quita el tamaño del nombre", () => {
    expect(descripcionProductoSinTamanoEnNombre("Agua Brisa 600ml")).toBe("Agua Brisa");
    expect(descripcionProductoSinTamanoEnNombre("Agua Brisa 600 ml")).toBe("Agua Brisa");
    expect(descripcionBebidaParaUi(agua())).toBe("Agua Brisa");
  });

  it("agrega 600 ml como variante y deduplica Pet 250", () => {
    const vars = variantesBebidaParaUi(agua());
    const labels = vars.map((v) => v.etiqueta);
    expect(labels).toContain("600 ml");
    expect(labels.filter((l) => canonEtiquetaVarianteBebida(l) === "pet 250 ml")).toHaveLength(1);
    expect(labels[0]).toBe("600 ml");
  });

  it("no duplica 600 ml si ya viene en variantes", () => {
    const vars = variantesBebidaParaUi(
      agua({
        variantes: [
          { clave: "600ml", etiqueta: "600 ml", precioVenta: 3000 },
          { clave: "SIN_GAS", etiqueta: "Sin Gas", precioVenta: 3000 },
        ],
      })
    );
    expect(vars.filter((v) => v.etiqueta === "600 ml")).toHaveLength(1);
  });
});
