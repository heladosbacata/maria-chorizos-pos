import { describe, expect, it } from "vitest";
import { construirUrlConsultaClubMillas } from "@/lib/club-millas-consulta-url";

describe("construirUrlConsultaClubMillas", () => {
  it("añade documento sin puntos ni guiones", () => {
    const u = new URL(construirUrlConsultaClubMillas("12.345.678"));
    expect(u.searchParams.get("documento")).toBe("12345678");
  });

  it("no añade documento si es muy corto", () => {
    const u = new URL(construirUrlConsultaClubMillas("1234"));
    expect(u.searchParams.has("documento")).toBe(false);
  });
});
