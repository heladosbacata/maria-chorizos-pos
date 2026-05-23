import { describe, expect, it } from "vitest";
import {
  construirUrlPortalClubMillasConCodigo,
  contenidoQrImpresoClubMillas,
  extraerCodigoQrClubDesdeTextoLeido,
  parametroQueryQrClubMillas,
} from "@/lib/fidelizacion-qr";

const TOKEN = "BACATA-CLUB-V1-a1b2c3d4e5f6789012345678abcdef01";

describe("fidelizacion-qr cliente frecuente", () => {
  it("usa parametro c por defecto (WMS landing)", () => {
    expect(parametroQueryQrClubMillas()).toBe("c");
  });

  it("genera URL del portal club-de-millas", () => {
    const url = construirUrlPortalClubMillasConCodigo(TOKEN);
    expect(url).toContain("/club-de-millas");
    expect(url).toContain(`c=${encodeURIComponent(TOKEN)}`);
  });

  it("contenido impreso por defecto es URL (no token plano)", () => {
    const contenido = contenidoQrImpresoClubMillas(TOKEN);
    expect(contenido).toMatch(/^https:\/\//);
    expect(contenido).toContain("club-de-millas");
  });

  it("extrae token desde URL con ?c=", () => {
    const url = `https://maria-chorizos-wms.vercel.app/club-de-millas?c=${TOKEN}`;
    expect(extraerCodigoQrClubDesdeTextoLeido(url)).toBe(TOKEN);
  });
});
