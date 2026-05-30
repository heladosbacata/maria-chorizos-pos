import { describe, expect, it } from "vitest";
import {
  lineaVentaCoincideReto,
  skuLineaCoincideReto,
  unidadesVendidasSkuEnRango,
} from "@/lib/metas-retos-avance-ventas";
import type { VentaGuardadaLocal } from "@/lib/pos-ventas-local-storage";

const SKU_RETO = "CHO-PET-QUESO|chorizo:tradicional|arepa:peto_queso";

describe("skuLineaCoincideReto", () => {
  it("coincide SKU base del ticket con meta compuesta", () => {
    expect(skuLineaCoincideReto("CHO-PET-QUESO", SKU_RETO)).toBe(true);
  });

  it("coincide lineId POS (arepa_queso) con meta WMS (peto_queso)", () => {
    expect(
      skuLineaCoincideReto("CHO-PET-QUESO|chorizo:tradicional|arepa:arepa_queso", SKU_RETO)
    ).toBe(true);
  });

  it("no cuenta otro producto", () => {
    expect(skuLineaCoincideReto("OTRO-SKU", SKU_RETO)).toBe(false);
  });
});

describe("unidadesVendidasSkuEnRango", () => {
  it("suma cantidades de ventas vigentes en el rango", () => {
    const ventas: VentaGuardadaLocal[] = [
      {
        id: "v1",
        fechaYmd: "2026-05-30",
        isoTimestamp: "2026-05-30T15:00:00.000Z",
        puntoVenta: "Punto Demo App",
        total: 1000,
        lineas: [
          {
            lineId: "CHO-PET-QUESO|chorizo:tradicional|arepa:arepa_queso",
            sku: "CHO-PET-QUESO",
            descripcion: "Combo",
            cantidad: 49,
            precioUnitario: 1000,
          },
        ],
      },
    ];
    expect(unidadesVendidasSkuEnRango(ventas, SKU_RETO, "2026-05-30", "2026-05-31")).toBe(49);
    expect(lineaVentaCoincideReto(ventas[0]!.lineas[0]!, SKU_RETO)).toBe(true);
  });
});
