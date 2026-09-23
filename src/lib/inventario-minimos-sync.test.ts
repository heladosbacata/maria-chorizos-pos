import { describe, expect, it } from "vitest";
import {
  combinarMinimosUsuarioInventario,
  faltantePaquetesPedido,
  minimoEfectivoInventario,
  stockMinimoDesdePaquetes,
} from "./inventario-minimos-sync";
import {
  idMinimoInventarioDoc,
  idMinimoInventarioDocLegacy,
  minimoPaquetesDesdeFirestoreDoc,
} from "./inventario-pos-firestore";

describe("idMinimoInventarioDoc (contrato mcapp)", () => {
  it("usa puntoVenta__SKU sin slug __min__", () => {
    expect(idMinimoInventarioDoc("Punto Demo App", "PAP-PARAFINADO-X100")).toBe(
      "Punto Demo App__PAP-PARAFINADO-X100"
    );
  });

  it("sanitiza / y espacios en SKU", () => {
    expect(idMinimoInventarioDoc("A/B", "SKU CON ESP")).toBe("A|B__SKU_CON_ESP");
  });

  it("legacy distinto del nuevo", () => {
    const pv = "Punto Demo App";
    const sku = "PAP-PARAFINADO-X100";
    expect(idMinimoInventarioDoc(pv, sku)).not.toBe(idMinimoInventarioDocLegacy(pv, sku));
  });
});

describe("minimoPaquetesDesdeFirestoreDoc", () => {
  it("prioriza minimoPaquetes sobre minimo/stockMinimo", () => {
    expect(
      minimoPaquetesDesdeFirestoreDoc({
        minimoPaquetes: 2,
        minimo: 200,
        stockMinimo: 200,
      })
    ).toBe(2);
  });
});

describe("stockMinimo / faltante paquetes", () => {
  it("PAP-PARAFINADO-X100: 2 pq × 100 = 200 und", () => {
    expect(stockMinimoDesdePaquetes(2, 100)).toBe(200);
  });

  it("faltantePaquetes con stock en paquetes", () => {
    expect(faltantePaquetesPedido(2, 0.5)).toBe(1.5);
    expect(faltantePaquetesPedido(2, 2)).toBe(0);
    expect(faltantePaquetesPedido(2, 3)).toBe(0);
  });
});

describe("combinarMinimosUsuarioInventario", () => {
  it("Firestore prevalece sobre localStorage para el mismo SKU", () => {
    const local = new Map([
      ["pap-parafinado-x100", 30],
      ["solo-local", 3],
    ]);
    const fs = new Map([["pap-parafinado-x100", 2]]);
    const m = combinarMinimosUsuarioInventario(fs, local);
    expect(m.get("pap-parafinado-x100")).toBe(2);
    expect(m.get("solo-local")).toBe(3);
  });
});

describe("minimoEfectivoInventario", () => {
  it("prioriza override PV; hoja solo fallback", () => {
    expect(minimoEfectivoInventario(2, 30)).toBe(2);
    expect(minimoEfectivoInventario(undefined, 30)).toBe(30);
    expect(minimoEfectivoInventario(null, null)).toBe(null);
  });
});
