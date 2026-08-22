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

  it("excluye SKU carrito PT-*", () => {
    const pt: InsumoKitItem = {
      id: "pt-1",
      sku: "PT-ARE-PETOQ-X6",
      descripcion: "Arepa paquete x6",
      unidad: "und",
    };
    expect(itemEsEnsambleOCatalogoPos(pt)).toBe(true);
    expect(filtrarCatalogoSoloInsumos([insumo, pt])).toEqual([insumo]);
  });

  it("excluye útiles administrativos del franquiciado", () => {
    const util: InsumoKitItem = {
      id: "sheet-14",
      sku: "14",
      descripcion: "Base caja menor / sencillo en efectivo para dar cambio",
      unidad: "Operación",
      categoria: "Operación",
    };
    const dotacion: InsumoKitItem = {
      id: "sheet-23",
      sku: "23",
      descripcion: "Bolsas plásticas para llevar producto congelado",
      unidad: "Dotación y seguridad",
      categoria: "Dotación y seguridad",
    };
    expect(filtrarCatalogoSoloInsumos([insumo, util, dotacion])).toEqual([insumo]);
  });

  it("prefiere Firestore DB_Franquicia_Insumos_Kit cuando existe", () => {
    const hoja: InsumoKitItem = { id: "sheet-2", sku: "2", descripcion: "Arepa bocadillo", unidad: "Paquete" };
    const fsDup: InsumoKitItem = {
      id: "FRAN-KIT-2",
      sku: "FRAN-KIT-2",
      descripcion: "Arepa bocadillo",
      unidad: "Paquete",
    };
    const fsExtra: InsumoKitItem = {
      id: "GAS-PV-6",
      sku: "GAS-PV-6 · Con Gas",
      descripcion: "Agua Brisa",
      unidad: "und",
      categoria: "DB_POS_Productos",
    };
    const items = catalogoInsumosParaCargue([hoja], [fsDup, fsExtra, insumo]);
    expect(items.map((i) => i.sku)).toEqual(["FRAN-KIT-2", "FRAN-KIT-5"]);
  });

  it("usa DB_Carrito como respaldo para productos comprables del franquiciado", () => {
    const items = catalogoInsumosParaCargue(
      [],
      [],
      [
        {
          sku: "PT-ARE-PETOQ-X6",
          producto: "Arepa de Peto con Queso x6,Arepas,Paquete",
          categoria: "Insumos Franquiciado",
          precio: 16800,
        },
      ]
    );
    expect(items).toMatchObject([
      {
        id: "PT-ARE-PETOQ-X6",
        sku: "PT-ARE-PETOQ-X6",
        descripcion: "Arepa de Peto con Queso x6,Arepas,Paquete",
        categoria: "Insumos Franquiciado",
        precioCompraUnitario: 16800,
      },
    ]);
  });
});
