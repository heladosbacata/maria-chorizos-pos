import type { VarianteArepaCombo, VarianteChorizo } from "@/lib/chorizo-variante-pos";
import type { DescuentoModoLinea } from "@/lib/item-cuenta-linea";
import type { ProductoPOS } from "./index";

/** Línea en la cuenta a cobrar (panel derecho). La edición no modifica el catálogo WMS. */
export interface ItemCuenta {
  lineId: string;
  producto: ProductoPOS;
  cantidad: number;
  varianteChorizo?: VarianteChorizo;
  varianteArepaCombo?: VarianteArepaCombo;
  variantes?: string[];
  precioUnitarioOverride?: number;
  descuentoModo?: DescuentoModoLinea;
  descuentoValor?: number;
  cargo1?: string;
}
