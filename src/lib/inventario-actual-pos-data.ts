import {
  cantidadSaldoParaInsumoKit,
  type InventarioSaldoRow,
} from "@/lib/inventario-pos-firestore";
import { precioCompraParaInsumo, type MapaPreciosCarrito } from "@/lib/precios-compra-carrito";
import type { InsumoKitItem } from "@/types/inventario-pos";

export type FilaInformeInventarioActual = {
  sku: string;
  descripcion: string;
  unidad: string;
  saldo: number;
  precioCompra: number | null;
  valorStock: number | null;
};

export type DatosInformeInventarioActual = {
  puntoVenta: string;
  generadoIso: string;
  fuenteCatalogo: "sheet" | "firestore" | null;
  filas: FilaInformeInventarioActual[];
  resumen: {
    productosCatalogo: number;
    productosConSaldo: number;
    totalUnidades: number;
    totalValorStock: number;
  };
};

export function construirDatosInformeInventarioActual(params: {
  puntoVenta: string;
  insumos: InsumoKitItem[];
  saldoRows: InventarioSaldoRow[];
  mapaPreciosCarrito: MapaPreciosCarrito;
  fuenteCatalogo: "sheet" | "firestore" | null;
  generado?: Date;
}): DatosInformeInventarioActual {
  const filas: FilaInformeInventarioActual[] = [];
  let productosConSaldo = 0;
  let totalUnidades = 0;
  let totalValorStock = 0;

  const sorted = [...params.insumos].sort((a, b) =>
    a.descripcion.localeCompare(b.descripcion, "es", { sensitivity: "base" })
  );

  for (const it of sorted) {
    const saldo = cantidadSaldoParaInsumoKit(it, params.saldoRows);
    const saldoR = Math.round(saldo * 1000) / 1000;
    const precio = precioCompraParaInsumo(it, params.mapaPreciosCarrito);
    let valorStock: number | null = null;
    if (precio != null && precio > 0 && Number.isFinite(saldoR) && saldoR > 0) {
      valorStock = Math.round(saldoR * precio);
      totalValorStock += valorStock;
    }
    if (saldoR > 0) {
      productosConSaldo += 1;
      totalUnidades += saldoR;
    }
    filas.push({
      sku: it.sku,
      descripcion: it.descripcion,
      unidad: it.unidad,
      saldo: saldoR,
      precioCompra: precio,
      valorStock,
    });
  }

  return {
    puntoVenta: params.puntoVenta,
    generadoIso: (params.generado ?? new Date()).toISOString(),
    fuenteCatalogo: params.fuenteCatalogo,
    filas,
    resumen: {
      productosCatalogo: filas.length,
      productosConSaldo,
      totalUnidades: Math.round(totalUnidades * 1000) / 1000,
      totalValorStock: Math.round(totalValorStock),
    },
  };
}

export function nombreArchivoInformeInventarioActualPdf(d: DatosInformeInventarioActual): string {
  const pv = d.puntoVenta.replace(/[^\w\-]+/g, "_").slice(0, 40);
  const dt = new Date(d.generadoIso);
  const stamp = dt
    .toLocaleString("sv-SE", { timeZone: "America/Bogota" })
    .replace(/[\s:]/g, "")
    .replace(",", "_")
    .slice(0, 15);
  return `inventario_actual_${pv}_${stamp}.pdf`;
}

export function textoResumenInformeInventarioCorreo(d: DatosInformeInventarioActual): string {
  const r = d.resumen;
  return [
    `Informe de inventario actual — ${d.puntoVenta}`,
    "",
    `Productos en catálogo: ${r.productosCatalogo}`,
    `Productos con saldo > 0: ${r.productosConSaldo}`,
    `Total unidades en stock: ${r.totalUnidades.toLocaleString("es-CO", { maximumFractionDigits: 3 })}`,
    `Valor total en stock (precio compra × saldo): $ ${r.totalValorStock.toLocaleString("es-CO", { maximumFractionDigits: 0 })} COP`,
    "",
    "Adjunto: PDF con detalle por producto (código, unidad, saldo, precio de compra y valor en stock).",
    "",
    "Maria Chorizos POS",
  ].join("\n");
}
