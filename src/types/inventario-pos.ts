/**
 * Ítem normalizado desde `DB_Franquicia_Insumos_Kit` (campos fuente flexibles).
 * Para escalar con muchos documentos, en Firestore conviene:
 * - `posCatalogoGlobal: true` en ítems de todos los PV, o
 * - `posCatalogoPvCodes: ["COD_PV", "__ALL__"]` (incluye `"__ALL__"` para globales), o
 * - un campo PV (`puntoVenta`, `PV`, etc.) igual al código del perfil del cajero.
 */
export interface InsumoKitItem {
  id: string;
  sku: string;
  descripcion: string;
  unidad: string;
  categoria?: string;
  /** Punto de venta asociado en el documento fuente, si existe. */
  puntoVentaOrigen?: string;
  /** Mínimo sugerido leído de la hoja DB_Franquicia_Insumos_Kit / columnas tipo «mínimo», «stock mínimo». */
  minimoSugeridoSheet?: number;
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
