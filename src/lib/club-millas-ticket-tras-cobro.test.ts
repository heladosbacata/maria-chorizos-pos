import { describe, expect, it, vi } from "vitest";
import { enriquecerTicketConClubMillasTrasCobro } from "@/lib/club-millas-ticket-tras-cobro";

vi.mock("@/lib/fidelizacion-qr", () => ({
  generarDataUrlQrPng: vi.fn(async () => "data:image/png;base64,qr"),
}));

describe("enriquecerTicketConClubMillasTrasCobro", () => {
  it("pone saldo grande y QR consulta tras cobro exitoso", async () => {
    const t = await enriquecerTicketConClubMillasTrasCobro(
      { titulo: "Venta", total: 10000 } as never,
      {
        ok: true,
        saldoMillas: 42,
        puntosSumados: 3,
        urlConsultaMillas: "https://wms.example/mi-plan?documento=12345",
        mensaje: "Sumaste 3 millas.",
      },
      "12345",
      { millasAntes: 39 }
    );
    expect(t.clubMillasSaldoAntes).toBe(39);
    expect(t.clubMillasSaldoTotal).toBe(42);
    expect(t.clubMillasGanadasCompra).toBe(3);
    expect(t.clubMillasConsultaUrl).toContain("mi-plan");
    expect(t.clubMillasConsultaQrDataUrl).toContain("data:image");
    expect(t.fidelizacionQrDataUrl).toBeUndefined();
  });
});
