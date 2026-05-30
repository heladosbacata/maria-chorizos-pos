import { describe, expect, it } from "vitest";
import {
  COP_POR_MILLA_CLUB,
  millasGanadasPorMontoCop,
  millasSaldoProyectadoTrasCompra,
} from "@/lib/club-millas-calculo-venta";

describe("club-millas-calculo-venta", () => {
  it("1 milla cada 9000 COP", () => {
    expect(millasGanadasPorMontoCop(COP_POR_MILLA_CLUB)).toBe(1);
    expect(millasGanadasPorMontoCop(17_999)).toBe(1);
    expect(millasGanadasPorMontoCop(18_000)).toBe(2);
    expect(millasGanadasPorMontoCop(8_999)).toBe(0);
  });

  it("proyecta saldo tras compra", () => {
    expect(millasSaldoProyectadoTrasCompra(10, 18_000)).toBe(12);
  });
});
