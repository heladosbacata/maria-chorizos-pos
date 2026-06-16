import { describe, expect, it } from "vitest";
import type { VentaGuardadaLocal } from "@/lib/pos-ventas-local-storage";
import {
  filtrarVentasCajeroPorRangoMs,
  resolverRangoFechaHoraCajero,
} from "./reporte-ventas-rango-cajero";

function venta(iso: string, total = 1000): VentaGuardadaLocal {
  return {
    id: `v-${iso}`,
    fechaYmd: iso.slice(0, 10),
    isoTimestamp: iso,
    puntoVenta: "PV Test",
    total,
    lineas: [{ lineId: "1", sku: "SKU", descripcion: "Prod", cantidad: 1, precioUnitario: total }],
  };
}

describe("reporte-ventas-rango-cajero", () => {
  it("resuelve rango válido en horario Colombia", () => {
    const r = resolverRangoFechaHoraCajero({
      desdeYmd: "2026-06-16",
      desdeHora: "08:00",
      hastaYmd: "2026-06-16",
      hastaHora: "12:30",
    });
    expect(r).not.toBeNull();
    expect(r!.periodoLabel).toContain("—");
    expect(r!.desdeMs).toBeLessThan(r!.hastaMs);
  });

  it("rechaza rango invertido", () => {
    const r = resolverRangoFechaHoraCajero({
      desdeYmd: "2026-06-16",
      desdeHora: "14:00",
      hastaYmd: "2026-06-16",
      hastaHora: "08:00",
    });
    expect(r).toBeNull();
  });

  it("filtra ventas por timestamp exacto", () => {
    const r = resolverRangoFechaHoraCajero({
      desdeYmd: "2026-06-16",
      desdeHora: "10:00",
      hastaYmd: "2026-06-16",
      hastaHora: "11:00",
    })!;
    const ventas = [
      venta("2026-06-16T09:59:00-05:00"),
      venta("2026-06-16T10:15:00-05:00"),
      venta("2026-06-16T11:00:59-05:00"),
      venta("2026-06-16T11:01:00-05:00"),
    ];
    const filtradas = filtrarVentasCajeroPorRangoMs(ventas, r.desdeMs, r.hastaMs);
    expect(filtradas.map((v) => v.id)).toEqual(["v-2026-06-16T10:15:00-05:00", "v-2026-06-16T11:00:59-05:00"]);
  });
});
