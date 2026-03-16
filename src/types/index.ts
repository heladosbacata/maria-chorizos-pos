export interface UserProfile {
  uid: string;
  email: string | null;
  puntoVenta?: string;
}

export interface VentaReporte {
  puntoVenta: string;
  valorVenta: number;
}

export interface BulkVentasPayload {
  fecha: string;
  uen: string;
  ventas: VentaReporte[];
}
