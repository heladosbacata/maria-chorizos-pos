import { describe, expect, it } from "vitest";
import {
  esCumpleanosHoyColombia,
  parseCumpleCorto,
  ventanaCumpleanosActivaColombia,
} from "./liga-cumpleanos-colombia";

describe("liga-cumpleanos-colombia", () => {
  it("parsea cumple corto en español", () => {
    expect(parseCumpleCorto("15 may")).toEqual({ dia: 15, mes: 5 });
    expect(parseCumpleCorto("3 dic")).toEqual({ dia: 3, mes: 12 });
  });

  it("detecta cumpleaños hoy con YMD", () => {
    const ok = esCumpleanosHoyColombia({
      fechaNacimiento: "1990-06-10",
      ahora: new Date("2026-06-10T15:00:00-05:00"),
    });
    expect(ok).toBe(true);
  });

  it("ventana activa entre 6:00 y 23:59 Colombia", () => {
    expect(ventanaCumpleanosActivaColombia(new Date("2026-06-10T05:30:00-05:00"))).toBe(false);
    expect(ventanaCumpleanosActivaColombia(new Date("2026-06-10T06:00:00-05:00"))).toBe(true);
    expect(ventanaCumpleanosActivaColombia(new Date("2026-06-10T23:30:00-05:00"))).toBe(true);
  });
});
