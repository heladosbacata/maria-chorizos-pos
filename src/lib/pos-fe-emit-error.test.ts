import { describe, expect, it } from "vitest";
import {
  esErrorFeReintentable,
  mensajeAlertaFeFallida,
  mensajeColaFeTrasError,
} from "./pos-fe-emit-error";

describe("esErrorFeReintentable", () => {
  it("no reintenta Regla 90 / documento ya procesado", () => {
    expect(
      esErrorFeReintentable(
        "Factura rechazada por la DIAN. Regla: 90, Rechazo: Documento procesado anteriormente."
      )
    ).toBe(false);
    expect(esErrorFeReintentable("Documento procesado anteriormente")).toBe(false);
  });

  it("no reintenta otros rechazos DIAN / AEP", () => {
    expect(esErrorFeReintentable("Factura rechazada por la DIAN. Regla: 90")).toBe(false);
    expect(esErrorFeReintentable("AEP6008 empresa no autorizada")).toBe(false);
  });

  it("sí reintenta fallos de red / 5xx", () => {
    expect(esErrorFeReintentable("Red")).toBe(true);
    expect(esErrorFeReintentable("Failed to fetch")).toBe(true);
    expect(esErrorFeReintentable("Error 502")).toBe(true);
    expect(esErrorFeReintentable("gateway timeout")).toBe(true);
  });
});

describe("mensajes FE", () => {
  it("alerta Regla 90 explica sync de consecutivo", () => {
    const m = mensajeAlertaFeFallida(
      "Factura rechazada por la DIAN. Regla: 90, Rechazo: Documento procesado anteriormente.",
      false
    );
    expect(m).toMatch(/no se reintentará/i);
    expect(m).toMatch(/consecutivo/i);
    expect(m).not.toMatch(/recuperar conexión/);
  });

  it("cola Regla 90 no dice reintento", () => {
    const m = mensajeColaFeTrasError("Regla: 90 Documento procesado anteriormente", false);
    expect(m).toMatch(/no se encoló/i);
  });
});
