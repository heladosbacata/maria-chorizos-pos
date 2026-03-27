export type MetodoImpresionPos = "navegador" | "directa";

export type TamanoPapelTicket = "80mm" | "58mm" | "A4";

export interface ImpresionPosPrefs {
  metodo: MetodoImpresionPos;
  /** Nombre exacto de impresora en el sistema; vacío = predeterminada de Windows */
  impresoraNombre: string;
  tamanoPapel: TamanoPapelTicket;
  copias: number;
  margenSuperiorMm: number;
  margenInferiorMm: number;
  margenIzquierdaMm: number;
  margenDerechaMm: number;
  /** Reservado: ticket sin logo corporativo */
  impresionSimpleSinLogo: boolean;
  /** Si es true y método directa, al cobrar se imprime automáticamente */
  imprimirAutomaticoAlCobrar: boolean;
}

export interface TicketVentaLinea {
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
  detalleVariante?: string;
}

export interface TicketVentaPayload {
  titulo: string;
  puntoVenta: string;
  precuentaNombre: string;
  fechaHora: string;
  clienteNombre: string;
  tipoComprobanteLabel: string;
  vendedorLabel: string;
  lineas: TicketVentaLinea[];
  total: number;
  /** Pie del ticket (pre-cuenta vs venta cobrada). */
  notaPie?: string;
}
