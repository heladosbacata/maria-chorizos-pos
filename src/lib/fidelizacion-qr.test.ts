import { describe, expect, it } from "vitest";
import {
  construirUrlPortalClubMillasConCodigo,
  contenidoQrEscaneableClubMillasDesdeTicket,
  contenidoQrImpresoClubMillas,
  elegirContenidoQrTirillaClubMillas,
  esCodigoCortoTirillaClubMillas,
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

  it("contenido impreso por defecto es token BACATA (modo token)", () => {
    const contenido = contenidoQrImpresoClubMillas(TOKEN);
    expect(contenido).toBe(TOKEN);
  });

  it("extrae token desde URL con ?c=", () => {
    const url = `https://maria-chorizos-wms.vercel.app/club-de-millas?c=${TOKEN}`;
    expect(extraerCodigoQrClubDesdeTextoLeido(url)).toBe(TOKEN);
  });

  it("contenido escaneable para ESC/POS es URL o token, no data:", () => {
    const url = `https://maria-chorizos-wms.vercel.app/club-de-millas?c=${TOKEN}&documento=123`;
    expect(contenidoQrEscaneableClubMillasDesdeTicket({ fidelizacionPayloadTexto: url })).toBe(url);
    expect(
      contenidoQrEscaneableClubMillasDesdeTicket({
        fidelizacionPayloadTexto: "data:image/png;base64,abc",
      })
    ).toBe("");
  });

  it("un solo QR: URL del WMS (camara abre login y Mi plan lee la misma URL)", () => {
    const url = `https://maria-chorizos-wms.vercel.app/club-de-millas?c=${TOKEN}&documento=123`;
    expect(elegirContenidoQrTirillaClubMillas(TOKEN, url, "123", "AB3K9M")).toBe(url);
  });

  it("sin URL del WMS usa codigo corto en el QR como respaldo", () => {
    expect(elegirContenidoQrTirillaClubMillas("", "", "1234567890", "AB3K9M")).toBe("AB3K9M");
  });

  it("reconoce código corto de 6 letras del WMS", () => {
    expect(esCodigoCortoTirillaClubMillas("AB3K9M")).toBe(true);
    expect(extraerCodigoQrClubDesdeTextoLeido("ab3k9m")).toBe("AB3K9M");
    expect(
      contenidoQrEscaneableClubMillasDesdeTicket({
        fidelizacionPayloadTexto: "",
        clubMillasCodigoCorto: "AB3K9M",
      })
    ).toBe("AB3K9M");
  });

  it("URL de landing incluye documento cuando se construye desde el POS", () => {
    const url = construirUrlPortalClubMillasConCodigo(TOKEN, "1234567890");
    expect(url).toContain("documento=1234567890");
  });
});
