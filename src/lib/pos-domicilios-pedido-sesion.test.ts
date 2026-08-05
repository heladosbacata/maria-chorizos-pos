import { describe, expect, it } from "vitest";
import {
  esEstadoTerminalPedidoDomicilio,
  telefonoDomicilioNorm,
} from "@/lib/pos-domicilios-pedido-sesion";

describe("pos-domicilios-pedido-sesion", () => {
  it("normaliza teléfono a 10 dígitos", () => {
    expect(telefonoDomicilioNorm("300 123 4567")).toBe("3001234567");
    expect(telefonoDomicilioNorm("+57 300 123 4567")).toBe("3001234567");
  });

  it("detecta estados terminales", () => {
    expect(esEstadoTerminalPedidoDomicilio("ENTREGADO")).toBe(true);
    expect(esEstadoTerminalPedidoDomicilio("ACEPTADO")).toBe(false);
  });
});
