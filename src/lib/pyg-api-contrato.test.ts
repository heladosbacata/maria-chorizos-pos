import { describe, expect, it } from "vitest";
import {
  construirPygApiResponse,
  ingresosVentasEnPeriodo,
  periodoAnteriorMismoLargo,
} from "./pyg-api-contrato";
import type { VentaGuardadaLocal } from "@/lib/pos-ventas-local-storage";

function venta(partial: Partial<VentaGuardadaLocal> & Pick<VentaGuardadaLocal, "id" | "fechaYmd" | "total">): VentaGuardadaLocal {
  return {
    isoTimestamp: `${partial.fechaYmd}T15:00:00.000Z`,
    puntoVenta: "Punto Demo App",
    lineas: [{ lineId: "X", sku: "X", descripcion: "x", cantidad: 1, precioUnitario: partial.total }],
    ...partial,
  };
}

describe("pyg-api-contrato", () => {
  it("suma solo ventas vigentes en el periodo", () => {
    const ventas = [
      venta({ id: "1", fechaYmd: "2026-09-01", total: 100_000 }),
      venta({ id: "2", fechaYmd: "2026-09-02", total: 50_000, anulada: true }),
      venta({ id: "3", fechaYmd: "2026-08-31", total: 999_000 }),
    ];
    expect(ingresosVentasEnPeriodo(ventas, "2026-09-01", "2026-09-07")).toEqual({
      ingresos: 100_000,
      numeroTransacciones: 1,
    });
  });

  it("periodo anterior mismo largo", () => {
    expect(periodoAnteriorMismoLargo("2026-09-01", "2026-09-07")).toEqual({
      desde: "2026-08-25",
      hasta: "2026-08-31",
    });
  });

  it("reutiliza fórmula PyG: insumos 44% y utilidad neta", () => {
    const ventas = [
      venta({ id: "a", fechaYmd: "2026-09-01", total: 1_000_000 }),
      venta({ id: "b", fechaYmd: "2026-09-02", total: 500_000 }),
    ];
    const r = construirPygApiResponse({
      puntoVenta: "Punto Demo App",
      desde: "2026-09-01",
      hasta: "2026-09-02",
      ventas,
      rentaMensual: 0,
      personalMensual: 0,
      incluirComparativo: false,
    });
    expect(r.ventasNetas).toBe(1_500_000);
    expect(r.costoInsumos).toBe(660_000);
    expect(r.utilidadBruta).toBe(840_000);
    expect(r.numeroTransacciones).toBe(2);
    expect(r.ticketPromedio).toBe(750_000);
    expect(r.descuentos).toBe(0);
    expect(r.calculo.costoInsumos).toBe(r.costoInsumos);
    expect(r.margenBruto).toBe(56); // 840/1500 = 56%
  });
});
