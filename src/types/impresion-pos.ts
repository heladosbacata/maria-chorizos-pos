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
  /**
   * Desglose cuando los precios incluyen IVA (p. ej. factura electrónica / referencia DIAN).
   * No sustituye el detalle legal del PDF DIAN; es resumen en tirilla.
   */
  desgloseIvaPreciosIncluidos?: {
    subtotalSinIva: number;
    iva: number;
    tasaPorcentaje: number;
  };
  /** Pie del ticket (pre-cuenta vs venta cobrada). */
  notaPie?: string;
  /** PNG data URL del QR de pedidos web/QR del punto de venta (parte superior de la tirilla). */
  domiciliosQrDataUrl?: string;
  /** URL codificada en el QR de domicilios (impresión térmica ESC/POS). */
  domiciliosLandingUrl?: string;
  /** PNG data URL para impresión en navegador (programa cliente frecuente). */
  fidelizacionQrDataUrl?: string;
  /**
   * Contenido del QR en impresión térmica (URL del portal club-de-millas?codigo=…).
   * El token BACATA-CLUB-V1-… va en el parámetro; el WMS valida uso único al acumular.
   */
  fidelizacionPayloadTexto?: string;
  /** Si se emitió factura electrónica (DIAN) en este cobro. */
  facturaElectronica?: {
    numero?: string;
    cufe?: string;
    enviadoAt?: string;
  };
}
