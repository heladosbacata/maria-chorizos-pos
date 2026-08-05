import { describe, expect, it } from "vitest";
import type { ProductoPOS } from "@/types";
import {
  canonEtiquetaVarianteBebida,
  descripcionBebidaParaUi,
  descripcionProductoSinTamanoEnNombre,
  esProductoAguaBrisa,
  unificarAguaBrisaEnCatalogo,
  variantesAguaBrisaUnificada,
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
      { clave: "CON_GAS", etiqueta: "Con Gas", precioVenta: 3200 },
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
    expect(descripcionBebidaParaUi(agua({ descripcion: "Agua Brisa 600ml (Con Gas)" }))).toBe(
      "Agua Brisa"
    );
  });

  it("Agua Brisa unificada: solo 600 ml sin gas / 600 ml con gas", () => {
    const vars = variantesBebidaParaUi(agua());
    expect(vars.map((v) => v.etiqueta)).toEqual(["600 ml sin gas", "600 ml con gas"]);
    expect(vars[0]?.precioVenta).toBe(3000);
    expect(vars[1]?.precioVenta).toBe(3200);
    expect(esProductoAguaBrisa(agua())).toBe(true);
  });

  it("unifica varias filas de Agua Brisa en una sola tarjeta", () => {
    const catalogo: ProductoPOS[] = [
      {
        sku: "BRISA-SIN",
        descripcion: "Agua Brisa 600ml Sin Gas",
        categoria: "Bebidas",
        precioUnitario: 3000,
        urlImagen: null,
      },
      {
        sku: "BRISA-CON",
        descripcion: "Agua Brisa 600ml (Con Gas)",
        categoria: "Bebidas",
        precioUnitario: 3500,
        urlImagen: "/brisa.png",
      },
      {
        sku: "GASEOSA-1",
        descripcion: "Gaseosa personal",
        categoria: "Bebidas",
        precioUnitario: 4000,
        urlImagen: null,
      },
    ];
    const out = unificarAguaBrisaEnCatalogo(catalogo);
    expect(out).toHaveLength(2);
    const brisa = out.find((p) => esProductoAguaBrisa(p));
    expect(brisa?.descripcion).toBe("Agua Brisa");
    expect(brisa?.urlImagen).toBe("/brisa.png");
    const vars = variantesAguaBrisaUnificada(brisa!);
    expect(vars.map((v) => v.etiqueta)).toEqual(["600 ml sin gas", "600 ml con gas"]);
    expect(vars[0]?.precioVenta).toBe(3000);
    expect(vars[1]?.precioVenta).toBe(3500);
  });

  it("otras bebidas siguen agregando tamaño del nombre y dedupe Pet", () => {
    const vars = variantesBebidaParaUi({
      sku: "OTRA",
      descripcion: "Agua Manantial 600ml",
      categoria: "Bebidas",
      precioUnitario: 2500,
      urlImagen: null,
      variantes: [
        { clave: "PET_250", etiqueta: "Pet 250", precioVenta: 1800 },
        { clave: "PET_250_ML", etiqueta: "Pet 250 ML", precioVenta: 1800 },
      ],
    });
    const labels = vars.map((v) => v.etiqueta);
    expect(labels).toContain("600 ml");
    expect(labels.filter((l) => canonEtiquetaVarianteBebida(l) === "pet 250 ml")).toHaveLength(1);
  });
});
