import { describe, expect, it } from "vitest";
import {
  estadoDomicilioRequiereFacturacion,
  pedidoDomicilioTieneVentaFacturacion,
} from "@/lib/pos-domicilios-facturacion-guard";

describe("pos-domicilios-facturacion-guard", () => {
  it("exige facturación para entrega y entregado", () => {
    expect(estadoDomicilioRequiereFacturacion("EN_ENTREGA")).toBe(true);
    expect(estadoDomicilioRequiereFacturacion("ENTREGADO")).toBe(true);
    expect(estadoDomicilioRequiereFacturacion("LISTO_PARA_DESPACHO")).toBe(false);
  });

  it("detecta venta de facturación por id, iso o cufe", () => {
    expect(pedidoDomicilioTieneVentaFacturacion({})).toBe(false);
    expect(pedidoDomicilioTieneVentaFacturacion({ facturaVentaLocalId: "v1" })).toBe(true);
    expect(pedidoDomicilioTieneVentaFacturacion({ enviadoAFacturacionEnIso: "2026-01-01T00:00:00.000Z" })).toBe(
      true
    );
    expect(pedidoDomicilioTieneVentaFacturacion({ facturaElectronicaCufe: "CUFE" })).toBe(true);
  });
});
