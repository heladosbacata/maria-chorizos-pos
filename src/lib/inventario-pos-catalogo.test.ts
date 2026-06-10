import { describe, expect, it } from "vitest";
import {
  catalogoInsumosParaCargue,
  filtrarCatalogoSoloInsumos,
  itemEsEnsambleOCatalogoPos,
} from "./inventario-pos-catalogo";
import type { InsumoKitItem } from "@/types/inventario-pos";

const insumo: InsumoKitItem = {
  id: "fran-kit-5",
  sku: "FRAN-KIT-5",
  descripcion: "Chorizo tradicional",
  unidad: "und",
};

const ensamblePos: InsumoKitItem = {
  id: "GAS-PV-6|var:con-gas",
  sku: "GAS-PV-6 · Con Gas",
  descripcion: "Agua Brisa 600ml (Con Gas)",
  unidad: "und",
  categoria: "DB_POS_Productos",
};

describe("filtrarCatalogoSoloInsumos", () => {
  it("excluye variantes del catálogo POS", () => {
    expect(itemEsEnsambleOCatalogoPos(ensamblePos)).toBe(true);
    expect(filtrarCatalogoSoloInsumos([insumo, ensamblePos])).toEqual([insumo]);
  });

  it("catalogoInsumosParaCargue no mezcla ensambles", () => {
    const items = catalogoInsumosParaCargue([insumo, ensamblePos], []);
    expect(items).toEqual([insumo]);
  });
});
