import { describe, expect, it } from "vitest";
import {
  INFLUENCER_PROMO_DESCUENTO_PCT,
  calcularDescuentoInfluencerMonto,
  esCodigoInfluencerValido,
  normalizarCodigoInfluencer,
  totalConDescuentoInfluencer,
} from "@/lib/influencer-descuento";

describe("influencer-descuento", () => {
  it("normaliza bajo mayúsculas y sin espacios", () => {
    expect(normalizarCodigoInfluencer(" maria10 ")).toBe("MARIA10");
  });

  it("exige al menos 3 caracteres", () => {
    expect(esCodigoInfluencerValido("AB")).toBe(false);
    expect(esCodigoInfluencerValido("ABC")).toBe(true);
  });

  it("calcula 10% sobre el total a pagar", () => {
    expect(INFLUENCER_PROMO_DESCUENTO_PCT).toBe(10);
    expect(calcularDescuentoInfluencerMonto(10_000)).toBe(1_000);
    expect(totalConDescuentoInfluencer(10_000)).toBe(9_000);
    expect(calcularDescuentoInfluencerMonto(0)).toBe(0);
    expect(totalConDescuentoInfluencer(0)).toBe(0);
  });
});
