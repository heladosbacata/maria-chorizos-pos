import { describe, expect, it } from "vitest";
import {
  inferirUnidadesPorPaquete,
  itemParecePaqueteCargue,
  presentacionCargueInventario,
} from "./inventario-cargue-presentacion";

describe("inventario-cargue-presentacion", () => {
  it("detecta x6 en SKU y descripción de arepas", () => {
    expect(inferirUnidadesPorPaquete("PT-ARE-PETOQB-X6 Arepa Bocadillo y queso x6")).toBe(6);
    expect(
      itemParecePaqueteCargue({
        sku: "PT-ARE-PETOQB-X6",
        descripcion: "Arepa Bocadillo y queso x6",
        unidad: "und",
      })
    ).toBe(true);
  });

  it("presentación pide paquetes y no multiplica", () => {
    const p = presentacionCargueInventario({
      sku: "PT-ARE-PETOQB-X6",
      descripcion: "Arepa Bocadillo y queso x6",
      unidad: "und",
    });
    expect(p.esPaquete).toBe(true);
    expect(p.unidadesPorPaquete).toBe(6);
    expect(p.labelCantidad).toMatch(/paquetes/i);
    expect(p.ayuda).toMatch(/paquetes llegaron/i);
    expect(p.ayuda).toMatch(/ensamble/i);
    expect(p.labelPrecio).toMatch(/paquete/i);
  });

  it("insumo suelto sigue en unidades", () => {
    const p = presentacionCargueInventario({
      sku: "FRAN-KIT-5",
      descripcion: "Chorizo tradicional",
      unidad: "und",
    });
    expect(p.esPaquete).toBe(false);
    expect(p.labelCantidad).toBe("Cantidad");
    expect(p.labelPrecio).toMatch(/und/i);
  });

  it("no confunde 600ml con paquete x6", () => {
    expect(inferirUnidadesPorPaquete("Agua Brisa 600ml")).toBeNull();
    expect(
      itemParecePaqueteCargue({
        sku: "GAS-PV-6",
        descripcion: "Agua Brisa 600ml",
        unidad: "und",
      })
    ).toBe(false);
  });
});
