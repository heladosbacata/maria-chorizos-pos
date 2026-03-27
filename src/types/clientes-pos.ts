/** Cliente guardado en Firestore (`posClientes`) por punto de venta — base para fidelización. */

export type TipoClientePos = "persona" | "empresa";

export interface ClientePosFirestoreDoc {
  id: string;
  puntoVenta: string;
  tipoCliente: TipoClientePos;
  tipoIdentificacion: string;
  numeroIdentificacion: string;
  digitoVerificacion?: string;
  nombres?: string;
  apellidos?: string;
  razonSocial?: string;
  email?: string;
  indicativoTelefono?: string;
  telefono?: string;
  datosComplementarios?: Record<string, string>;
  createdByUid: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

/** Selección en carrito / envío de venta */
export interface ClienteVentaRef {
  id: string;
  /** Texto mostrado y enviado al WMS como nombre de cliente */
  nombreDisplay: string;
  numeroIdentificacion?: string;
  tipoIdentificacion?: string;
}

export const CONSUMIDOR_FINAL_ID = "__consumidor_final__";

export function esConsumidorFinal(ref: ClienteVentaRef): boolean {
  return ref.id === CONSUMIDOR_FINAL_ID;
}
