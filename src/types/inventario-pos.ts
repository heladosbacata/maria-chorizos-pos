/** Ítem normalizado desde `DB_Franquicia_Insumos_Kit` (campos fuente flexibles). */
export interface InsumoKitItem {
  id: string;
  sku: string;
  descripcion: string;
  unidad: string;
  categoria?: string;
  /** Punto de venta asociado en el documento fuente, si existe. */
  puntoVentaOrigen?: string;
}

export type TipoMovimientoInventario =
  | "cargue"
  | "salida_danio"
  | "ajuste_positivo"
  | "ajuste_negativo"
  | "merma"
  | "consumo_interno";

export interface InventarioMovimientoDoc {
  id: string;
  puntoVenta: string;
  insumoId: string;
  insumoSku: string;
  insumoDescripcion: string;
  tipo: TipoMovimientoInventario;
  /** Positivo = entrada al inventario; negativo = salida. */
  delta: number;
  cantidadAnterior: number;
  cantidadNueva: number;
  notas: string;
  /** Fecha del cargue/recepción indicada por el cajero (YYYY-MM-DD). Opcional en movimientos antiguos. */
  fechaCargue?: string;
  uid: string;
  email: string | null;
  createdAt?: unknown;
}
