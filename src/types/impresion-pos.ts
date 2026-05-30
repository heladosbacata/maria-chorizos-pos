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
   * Contenido del QR impreso (URL club-de-millas?c=… por defecto, o token si NEXT_PUBLIC_CLUB_MILLAS_QR_MODO=token).
   * Debe coincidir con lo que lee el escáner del Club de Millas.
   */
  fidelizacionPayloadTexto?: string;
  /** Codigo de 6 caracteres (escaner premium / pegar en Mi plan). */
  clubMillasCodigoCorto?: string;
  /** Enlace web con ?c= y documento (ingreso manual si el QR no lee). */
  clubMillasLandingUrl?: string;
  /** QR de inscripcion al club (cuando no es cliente frecuente en el cobro). */
  clubMillasInvitacionQrDataUrl?: string;
  /** URL https://maria-chorizos-wms.vercel.app/club-de-millas para ESC/POS. */
  clubMillasInvitacionUrl?: string;
  /** Si se emitió factura electrónica (DIAN) en este cobro. */
  facturaElectronica?: {
    numero?: string;
    cufe?: string;
    enviadoAt?: string;
  };
}
