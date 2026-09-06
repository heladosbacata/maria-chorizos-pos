import { describe, expect, it } from "vitest";
import {
  cantidadUnidadesDesdeCarguePaquetes,
  desglosarSaldoUnidades,
  inferirUnidadesPorPaquete,
  itemParecePaqueteCargue,
  presentacionCargueInventario,
  vistaSaldoConEmpaque,
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

  it("presentación pide paquetes y avisa conversión a und", () => {
    const p = presentacionCargueInventario({
      sku: "PT-ARE-PETOQB-X6",
      descripcion: "Arepa Bocadillo y queso x6",
      unidad: "und",
    });
    expect(p.esPaquete).toBe(true);
    expect(p.unidadesPorPaquete).toBe(6);
    expect(p.labelCantidad).toMatch(/paquetes/i);
    expect(p.ayuda).toMatch(/und/i);
    expect(cantidadUnidadesDesdeCarguePaquetes(10, 6)).toBe(60);
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

  it("desglosa unidades a paquetes + sueltas", () => {
    expect(desglosarSaldoUnidades(85, 6)).toEqual({
      paquetesEnteros: 14,
      unidadesSueltas: 1,
      totalUnidades: 85,
    });
    expect(desglosarSaldoUnidades(521, 10)).toEqual({
      paquetesEnteros: 52,
      unidadesSueltas: 1,
      totalUnidades: 521,
    });
  });

  it("vista saldo legible desde unidades del sistema", () => {
    const v = vistaSaldoConEmpaque(85, {
      sku: "PT-ARE-PETOQB-X6",
      descripcion: "Arepa Bocadillo y queso x6",
      unidad: "und",
    });
    expect(v.textoPrincipal).toBe("14 paquetes + 1 unidad");
    expect(v.textoSecundario).toMatch(/85 und/);
    expect(v.paquetes).toBe(14);
    expect(v.unidadesSueltas).toBe(1);

    const entero = vistaSaldoConEmpaque(72, {
      sku: "PT-ARE-PETOQB-X6",
      descripcion: "Arepa Bocadillo y queso x6",
      unidad: "und",
    });
    expect(entero.textoPrincipal).toBe("12 paquetes");
    expect(entero.unidadesSueltas).toBe(0);
  });
});
