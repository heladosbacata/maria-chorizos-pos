import { describe, expect, it } from "vitest";
import {
  normalizarCatalogoDomiciliosPorSku,
  productoHabilitadoEnDomiciliosPunto,
} from "@/lib/pos-domicilios-catalogo-sku";

describe("pos-domicilios-catalogo-sku", () => {
  it("normaliza solo booleanos por sku", () => {
    expect(
      normalizarCatalogoDomiciliosPorSku({
        " A ": false,
        B: true,
        C: "no",
        "": false,
      })
    ).toEqual({ A: false, B: true });
  });

  it("por defecto habilita si no hay entrada", () => {
    expect(productoHabilitadoEnDomiciliosPunto("SKU-1", {})).toBe(true);
    expect(productoHabilitadoEnDomiciliosPunto("SKU-1", undefined)).toBe(true);
    expect(productoHabilitadoEnDomiciliosPunto("SKU-1", { "SKU-1": true })).toBe(true);
    expect(productoHabilitadoEnDomiciliosPunto("SKU-1", { "SKU-1": false })).toBe(false);
  });
});
