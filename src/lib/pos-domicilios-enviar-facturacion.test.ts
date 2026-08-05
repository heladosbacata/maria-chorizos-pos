import { describe, expect, it } from "vitest";
import { lineasVentaDesdePedidoDomicilio } from "@/lib/pos-domicilios-enviar-facturacion";
import type { PedidoDomicilio } from "@/types/pos-domicilios";

function pedidoBase(partial: Partial<PedidoDomicilio> = {}): PedidoDomicilio {
  return {
    id: "DOM-1001",
    puntoVenta: "Test",
    cliente: "Cliente",
    telefono: "3001234567",
    direccion: "Calle 1",
    total: 30000,
    metodoPago: "efectivo",
    canal: "web",
    estado: "LISTO_PARA_DESPACHO",
    creadoEnIso: new Date().toISOString(),
    items: ["1x Chorizo", "1x Arepa", "1x Bebida"],
    tiempoObjetivoMin: 35,
    ...partial,
  };
}

describe("lineasVentaDesdePedidoDomicilio", () => {
  it("reparte el total en las líneas y suma el mismo monto", () => {
    const lineas = lineasVentaDesdePedidoDomicilio(pedidoBase({ total: 10000 }));
    expect(lineas).toHaveLength(3);
    const suma = lineas.reduce((acc, l) => acc + l.precioUnitario * l.cantidad, 0);
    expect(suma).toBe(10000);
  });

  it("crea una línea genérica si no hay ítems", () => {
    const lineas = lineasVentaDesdePedidoDomicilio(pedidoBase({ items: [], total: 15000 }));
    expect(lineas).toHaveLength(1);
    expect(lineas[0]?.precioUnitario).toBe(15000);
  });
});
