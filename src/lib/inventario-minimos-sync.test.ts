import { describe, expect, it } from "vitest";
import {
  combinarMinimosUsuarioInventario,
  minimoEfectivoInventario,
} from "./inventario-minimos-sync";

describe("combinarMinimosUsuarioInventario", () => {
  it("Firestore prevalece sobre localStorage para el mismo SKU", () => {
    const local = new Map([
      ["pt-are-petoq-x6", 10],
      ["solo-local", 3],
    ]);
    const fs = new Map([["pt-are-petoq-x6", 15]]);
    const m = combinarMinimosUsuarioInventario(fs, local);
    expect(m.get("pt-are-petoq-x6")).toBe(15);
    expect(m.get("solo-local")).toBe(3);
  });

  it("normaliza claves de SKU", () => {
    const local = new Map([["PT-ARE-PETOQ-X6", 8]]);
    const fs = new Map([["pt-are-petoq-x6", 12]]);
    const m = combinarMinimosUsuarioInventario(fs, local);
    expect(m.size).toBe(1);
    expect(m.get("pt-are-petoq-x6")).toBe(12);
  });
});

describe("minimoEfectivoInventario", () => {
  it("usa usuario, luego hoja, luego null", () => {
    expect(minimoEfectivoInventario(15, 10)).toBe(15);
    expect(minimoEfectivoInventario(undefined, 10)).toBe(10);
    expect(minimoEfectivoInventario(null, null)).toBe(null);
    expect(minimoEfectivoInventario(0, 10)).toBe(0);
  });
});
