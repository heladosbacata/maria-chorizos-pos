import { describe, expect, it } from "vitest";
import {
  PROMO_HALLOWEEN_CUPO_MAX,
  cantidadUnidadesPromoHalloween,
  disponiblesPromoHalloween,
  esProductoPromoHalloween,
  esVentanaPromoHalloween,
  idDocumentoCupoPromoHalloween,
  priorizarPromoHalloween,
  textoMarcadorPromoHalloween,
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

  it("baja el disponible hasta promo no disponible", () => {
    expect(PROMO_HALLOWEEN_CUPO_MAX).toBe(5);
    expect(disponiblesPromoHalloween(0)).toBe(5);
    expect(disponiblesPromoHalloween(1)).toBe(4);
    expect(disponiblesPromoHalloween(5)).toBe(0);
    expect(textoMarcadorPromoHalloween(5)).toBe("Disponible: 5 unidades");
    expect(textoMarcadorPromoHalloween(1)).toBe("Disponible: 1 unidad");
    expect(textoMarcadorPromoHalloween(0)).toBe("Promo no disponible");
    expect(
      cantidadUnidadesPromoHalloween([
        { cantidad: 2, producto: { sku: "promoha", descripcion: "Promocion Halloween" } },
        { cantidad: 3, sku: "CH-01", descripcion: "Chorizo" },
      ])
    ).toBe(2);
  });

  it("separa el cupo por punto y por año", () => {
    const a = idDocumentoCupoPromoHalloween("Centro Mayor", new Date("2026-10-30T12:00:00-05:00"));
    const b = idDocumentoCupoPromoHalloween("centro  mayor", new Date("2026-11-01T12:00:00-05:00"));
    const otroAnio = idDocumentoCupoPromoHalloween("Centro Mayor", new Date("2027-10-30T12:00:00-05:00"));
    expect(a).toBe(b);
    expect(a.endsWith("__2026")).toBe(true);
    expect(otroAnio.endsWith("__2027")).toBe(true);
    expect(a).not.toBe(otroAnio);
  });
});
