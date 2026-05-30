import { describe, expect, it } from "vitest";
import { mergeVentasParaMetasAvance } from "@/lib/pos-ventas-metas-sync";
import { unidadesVendidasSkuEnRango } from "@/lib/metas-retos-avance-ventas";
import type { VentaGuardadaLocal } from "@/lib/pos-ventas-local-storage";

const SKU_RETO = "CHO-PET-QUESO|chorizo:tradicional|arepa:peto_queso";
const PV = "Punto Demo App";

describe("mergeVentasParaMetasAvance", () => {
  it("combina venta en nube con línea base y venta local con lineId compuesto", () => {
    const nube: VentaGuardadaLocal[] = [
      {
        id: "cloud-1",
        fechaYmd: "2026-05-30",
        isoTimestamp: "2026-05-30T10:00:00.000Z",
        puntoVenta: PV,
        total: 45000,
        lineas: [
          {
            lineId: "CHO-PET-QUESO",
            sku: "CHO-PET-QUESO",
            descripcion: "Combo",
            cantidad: 10,
            precioUnitario: 4500,
          },
        ],
      },
    ];
    const local: VentaGuardadaLocal[] = [
      {
        id: "cloud-1",
        fechaYmd: "2026-05-30",
        isoTimestamp: "2026-05-30T10:00:00.000Z",
        puntoVenta: PV,
        total: 45000,
        lineas: [
          {
            lineId: "CHO-PET-QUESO|chorizo:tradicional|arepa:arepa_queso",
            inventarioLookupKey: "CHO-PET-QUESO|chorizo:tradicional|arepa:arepa_queso",
            sku: "CHO-PET-QUESO|chorizo:tradicional|arepa:arepa_queso",
            descripcion: "Combo",
            cantidad: 10,
            precioUnitario: 4500,
          },
        ],
      },
      {
        id: "local-2",
        fechaYmd: "2026-05-30",
        isoTimestamp: "2026-05-30T11:00:00.000Z",
        puntoVenta: PV,
        total: 175500,
        lineas: [
          {
            lineId: "CHO-PET-QUESO|chorizo:tradicional|arepa:arepa_queso",
            sku: "CHO-PET-QUESO",
            descripcion: "Combo",
            cantidad: 39,
            precioUnitario: 4500,
          },
        ],
      },
    ];

    const merged = mergeVentasParaMetasAvance(local, nube, PV);
    expect(merged).toHaveLength(2);
    expect(unidadesVendidasSkuEnRango(merged, SKU_RETO, "2026-05-30", "2026-05-31")).toBe(49);
  });
});
