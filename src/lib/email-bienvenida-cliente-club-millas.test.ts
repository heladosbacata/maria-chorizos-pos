import { describe, expect, it } from "vitest";
import { construirCorreoBienvenidaClubMillas, generarPinClubMillas4Digitos } from "@/lib/email-bienvenida-cliente-club-millas";

describe("generarPinClubMillas4Digitos", () => {
  it("devuelve 4 caracteres numéricos", () => {
    const p = generarPinClubMillas4Digitos();
    expect(p).toMatch(/^\d{4}$/);
  });
});

describe("construirCorreoBienvenidaClubMillas", () => {
  it("incluye el pin y enlaces en texto plano", () => {
    const { text, subject } = construirCorreoBienvenidaClubMillas({ nombreDisplay: "Ana", pin: "0421" });
    expect(subject).toContain("millas");
    expect(text).toContain("0421");
    expect(text).toContain("club-de-millas/mi-plan");
    expect(text).toContain("mariachorizos.com");
  });
});
