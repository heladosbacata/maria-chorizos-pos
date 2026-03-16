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

/** Usuario devuelto por GET /api/chat/usuarios (WMS) para listar contactos del chat */
export interface ChatUsuario {
  uid: string;
  email: string | null;
  displayName?: string | null;
  photoURL?: string | null;
  puntoVenta?: string | null;
  esFranquiciado?: boolean;
}

/** Mensaje en Firestore (chats/{chatId}/messages) */
export interface ChatMessage {
  id: string;
  text: string;
  senderId: string;
  createdAt: { seconds: number; nanoseconds: number };
}

/** Producto para venta en POS — devuelto por GET /api/pos/productos/listar (WMS) */
export interface ProductoPOS {
  sku: string;
  descripcion: string;
  categoria?: string;
  precioUnitario: number;
  unidad?: string;
  urlImagen: string | null;
}
