import { describe, expect, it } from "vitest";
import {
  aplicarPieClubMillasEnTicket,
  esAvisoErrorClubMillasEnTicket,
  ticketTieneQrAcumulacionClubMillas,
} from "@/lib/club-millas-invitacion-ticket";
import type { TicketVentaPayload } from "@/types/impresion-pos";

const base: TicketVentaPayload = {
  titulo: "T",
  puntoVenta: "PV",
  precuentaNombre: "C",
  fechaHora: "2026-01-01",
  clienteNombre: "X",
  tipoComprobanteLabel: "Interno",
  vendedorLabel: "V",
  lineas: [],
  total: 10000,
};

describe("club-millas-invitacion-ticket", () => {
  it("detecta acumulación por URL en payload", () => {
    const url = "https://maria-chorizos-wms.vercel.app/club-de-millas?c=BACATA-CLUB-V1-abc";
    expect(
      ticketTieneQrAcumulacionClubMillas({ ...base, fidelizacionPayloadTexto: url })
    ).toBe(true);
  });

  it("mensaje de error no cuenta como acumulación pero sí como aviso", () => {
    const msg = "Club de Millas: el total no alcanza el mínimo.";
    const t = { ...base, fidelizacionPayloadTexto: msg };
    expect(ticketTieneQrAcumulacionClubMillas(t)).toBe(false);
    expect(esAvisoErrorClubMillasEnTicket(t)).toBe(true);
  });

  it("aviso de error no bloquea invitación al pie", async () => {
    const t = { ...base, fidelizacionPayloadTexto: "Club de Millas: error de prueba." };
    const out = await aplicarPieClubMillasEnTicket(t);
    expect(out.clubMillasInvitacionUrl?.trim()).toBeTruthy();
  });
});
