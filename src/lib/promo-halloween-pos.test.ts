import { describe, expect, it } from "vitest";
import {
  esProductoPromoHalloween,
  esVentanaPromoHalloween,
  priorizarPromoHalloween,
} from "./promo-halloween-pos";

describe("promo halloween POS", () => {
  it("está activa el 30 y 31 de octubre y el 1 de noviembre", () => {
    expect(esVentanaPromoHalloween(new Date("2026-10-30T08:00:00-05:00"))).toBe(true);
    expect(esVentanaPromoHalloween(new Date("2026-10-31T23:30:00-05:00"))).toBe(true);
    expect(esVentanaPromoHalloween(new Date("2026-11-01T12:00:00-05:00"))).toBe(true);
    expect(esVentanaPromoHalloween(new Date("2026-10-29T21:00:00-05:00"))).toBe(false);
    expect(esVentanaPromoHalloween(new Date("2026-11-02T00:30:00-05:00"))).toBe(false);
  });

  it("reconoce la promo por sku o por nombre", () => {
    expect(esProductoPromoHalloween({ sku: "promoha", descripcion: "Promocion Halloween" })).toBe(true);
    expect(esProductoPromoHalloween({ sku: "CH-01", descripcion: "Chorizo tradicional" })).toBe(false);
  });

  it("la pone de primera solo dentro de la ventana", () => {
    const lista = [
      { sku: "A", descripcion: "Arepa" },
      { sku: "promoha", descripcion: "Promocion Halloween" },
      { sku: "B", descripcion: "Gaseosa" },
    ];
    expect(priorizarPromoHalloween(lista, new Date("2026-10-30T10:00:00-05:00")).map((p) => p.sku)).toEqual([
      "promoha",
      "A",
      "B",
    ]);
    expect(priorizarPromoHalloween(lista, new Date("2026-11-02T10:00:00-05:00")).map((p) => p.sku)).toEqual([
      "A",
      "promoha",
      "B",
    ]);
  });
});
