import { describe, expect, it } from "vitest";
import {
  construirPedidoSugerido,
  redondearAMultiploEmpaque,
  unidadesPorEmpaqueInsumo,
} from "./inventario-pedido-sugerido";
import { vistaSaldoConEmpaque } from "./inventario-cargue-presentacion";
import type { InsumoKitItem, InventarioMovimientoDoc } from "@/types/inventario-pos";

function mov(
  partial: Partial<InventarioMovimientoDoc> & Pick<InventarioMovimientoDoc, "insumoSku" | "delta" | "tipo">
): InventarioMovimientoDoc {
  return {
    id: partial.id ?? "m1",
    puntoVenta: "PV1",
    insumoId: partial.insumoId ?? partial.insumoSku,
    insumoSku: partial.insumoSku,
    insumoDescripcion: partial.insumoDescripcion ?? "",
    tipo: partial.tipo,
    delta: partial.delta,
    cantidadAnterior: 0,
    cantidadNueva: 0,
    notas: "",
    uid: "u",
    email: null,
    createdAt: partial.createdAt ?? { seconds: Math.floor(Date.now() / 1000) - 3600 },
  };
}

describe("inventario-pedido-sugerido", () => {
  it("redondea a múltiplo de empaque", () => {
    expect(redondearAMultiploEmpaque(10, 6)).toBe(12);
    expect(redondearAMultiploEmpaque(12, 6)).toBe(12);
    expect(redondearAMultiploEmpaque(1, 100)).toBe(100);
  });

  it("infiere empaque x6", () => {
    expect(unidadesPorEmpaqueInsumo({ sku: "PT-ARE-X6", descripcion: "Arepa x6", unidad: "und" })).toBe(6);
  });

  it("muestra saldo en paquetes y unidades", () => {
    const v = vistaSaldoConEmpaque(12, {
      sku: "PT-ARE-PETOQU-X6",
      descripcion: "Arepa Bocadillo x6",
      unidad: "und",
    });
    expect(v.saldoEnPaquetes).toBe(true);
    expect(v.paquetes).toBe(12);
    expect(v.unidadesEquivalentes).toBe(72);
    expect(v.textoPrincipal).toMatch(/12 paquetes/);
    expect(v.textoSecundario).toMatch(/72 und/);
  });

  it("sugiere pedido en paquetes (saldo ya es paquetes)", () => {
    const item: InsumoKitItem = {
      id: "1",
      sku: "PT-ARE-PETOQU-X6",
      descripcion: "Arepa Bocadillo x6",
      unidad: "und",
    };
    const ahora = new Date("2026-09-06T15:00:00-05:00");
    const sec = Math.floor(ahora.getTime() / 1000);
    const movimientos = [
      mov({
        insumoSku: "PT-ARE-PETOQU-X6",
        tipo: "venta_ensamble",
        delta: -42,
        createdAt: { seconds: sec - 2 * 86400 },
      }),
    ];
    // consumo 42 paq / 7 × 7 = 42 objetivo; saldo 12 paq → pedir 30 paq (= 180 und)
    const r = construirPedidoSugerido({
      puntoVenta: "PV1",
      insumos: [item],
      saldoRows: [{ insumoId: "1", insumoSku: "PT-ARE-PETOQU-X6", cantidad: 12 }],
      movimientos,
      minimoPorSku: new Map([["pt-are-petoqu-x6", 10]]),
      ahora,
    });
    expect(r.lineas).toHaveLength(1);
    expect(r.lineas[0].paquetesPedir).toBe(30);
    expect(r.lineas[0].unidadesEquivPedir).toBe(180);
    expect(r.lineas[0].saldoEnPaquetes).toBe(true);
  });

  it("prioriza reponer mínimo en paquetes", () => {
    const item: InsumoKitItem = {
      id: "2",
      sku: "BOL-PAPEL-X100",
      descripcion: "Bolsa papel x100",
      unidad: "und",
    };
    const r = construirPedidoSugerido({
      puntoVenta: "PV1",
      insumos: [item],
      saldoRows: [{ insumoId: "2", insumoSku: "BOL-PAPEL-X100", cantidad: 20 }],
      movimientos: [],
      minimoPorSku: { "bol-papel-x100": 100 },
    });
    expect(r.lineas).toHaveLength(1);
    expect(r.lineas[0].bajoMinimo).toBe(true);
    expect(r.lineas[0].paquetesPedir).toBe(80);
    expect(r.lineas[0].unidadesEquivPedir).toBe(8000);
  });
});
