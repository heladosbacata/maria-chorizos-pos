import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

export const POS_DOCUMENTOS_COMERCIALES_COLLECTION = "posDocumentosComerciales";

export type TipoDocumentoComercial = "cotizacion" | "remision";

/** Línea persistida (sin id de UI) */
export interface LineaDocumentoFirestore {
  sku: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
}

export interface DocumentoComercialFirestoreDoc {
  id: string;
  tipo: TipoDocumentoComercial;
  numeroDocumento: string;
  fechaIso: string;
  puntoVenta: string;
  createdByUid: string;
  clienteNombre: string;
  clienteDocumento?: string;
  clienteTelefono?: string;
  eventoReferencia?: string;
  direccionEntrega?: string;
  observaciones?: string;
  lineas: LineaDocumentoFirestore[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

function snapToDoc(
  id: string,
  data: Record<string, unknown>
): DocumentoComercialFirestoreDoc | null {
  const tipo = data.tipo;
  if (tipo !== "cotizacion" && tipo !== "remision") return null;
  const lineasRaw = data.lineas;
  const lineas: LineaDocumentoFirestore[] = [];
  if (Array.isArray(lineasRaw)) {
    for (const row of lineasRaw) {
      if (!row || typeof row !== "object") continue;
      const o = row as Record<string, unknown>;
      const sku = typeof o.sku === "string" ? o.sku : "";
      const descripcion = typeof o.descripcion === "string" ? o.descripcion : "";
      const cantidad = typeof o.cantidad === "number" ? o.cantidad : Number(o.cantidad) || 0;
      const precioUnitario =
        typeof o.precioUnitario === "number" ? o.precioUnitario : Number(o.precioUnitario) || 0;
      if (sku || descripcion) lineas.push({ sku, descripcion, cantidad, precioUnitario });
    }
  }
  return {
    id,
    tipo,
    numeroDocumento: typeof data.numeroDocumento === "string" ? data.numeroDocumento : "",
    fechaIso: typeof data.fechaIso === "string" ? data.fechaIso : "",
    puntoVenta: typeof data.puntoVenta === "string" ? data.puntoVenta : "",
    createdByUid: typeof data.createdByUid === "string" ? data.createdByUid : "",
    clienteNombre: typeof data.clienteNombre === "string" ? data.clienteNombre : "",
    ...(typeof data.clienteDocumento === "string" && data.clienteDocumento
      ? { clienteDocumento: data.clienteDocumento }
      : {}),
    ...(typeof data.clienteTelefono === "string" && data.clienteTelefono
      ? { clienteTelefono: data.clienteTelefono }
      : {}),
    ...(typeof data.eventoReferencia === "string" && data.eventoReferencia
      ? { eventoReferencia: data.eventoReferencia }
      : {}),
    ...(typeof data.direccionEntrega === "string" && data.direccionEntrega
      ? { direccionEntrega: data.direccionEntrega }
      : {}),
    ...(typeof data.observaciones === "string" && data.observaciones
      ? { observaciones: data.observaciones }
      : {}),
    lineas,
    createdAt: data.createdAt as Timestamp | undefined,
    updatedAt: data.updatedAt as Timestamp | undefined,
  };
}

function tsMs(t: unknown): number {
  if (t instanceof Timestamp) return t.toMillis();
  return 0;
}

/**
 * Lista documentos del punto de venta y filtra por tipo en cliente (solo requiere índice en `puntoVenta`).
 */
export async function listarDocumentosComerciales(
  puntoVenta: string,
  tipo: TipoDocumentoComercial
): Promise<{ ok: true; items: DocumentoComercialFirestoreDoc[] } | { ok: false; message: string }> {
  if (!db) return { ok: false, message: "Firestore no está disponible." };
  const pv = puntoVenta.trim();
  if (!pv) return { ok: false, message: "Sin punto de venta." };
  try {
    const q = query(collection(db, POS_DOCUMENTOS_COMERCIALES_COLLECTION), where("puntoVenta", "==", pv));
    const snap = await getDocs(q);
    const items: DocumentoComercialFirestoreDoc[] = [];
    snap.forEach((d) => {
      const row = snapToDoc(d.id, d.data() as Record<string, unknown>);
      if (row && row.tipo === tipo) items.push(row);
    });
    items.sort((a, b) => tsMs(b.updatedAt) - tsMs(a.updatedAt));
    return { ok: true, items };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "No se pudo listar.",
    };
  }
}

export async function crearDocumentoComercial(params: {
  tipo: TipoDocumentoComercial;
  numeroDocumento: string;
  fechaIso: string;
  puntoVenta: string;
  createdByUid: string;
  clienteNombre: string;
  clienteDocumento?: string;
  clienteTelefono?: string;
  eventoReferencia?: string;
  direccionEntrega?: string;
  observaciones?: string;
  lineas: LineaDocumentoFirestore[];
}): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  if (!db) return { ok: false, message: "Firestore no está disponible." };
  try {
    const ref = await addDoc(collection(db, POS_DOCUMENTOS_COMERCIALES_COLLECTION), {
      tipo: params.tipo,
      numeroDocumento: params.numeroDocumento.trim(),
      fechaIso: params.fechaIso,
      puntoVenta: params.puntoVenta.trim(),
      createdByUid: params.createdByUid,
      clienteNombre: params.clienteNombre.trim(),
      ...(params.clienteDocumento?.trim() ? { clienteDocumento: params.clienteDocumento.trim() } : {}),
      ...(params.clienteTelefono?.trim() ? { clienteTelefono: params.clienteTelefono.trim() } : {}),
      ...(params.eventoReferencia?.trim() ? { eventoReferencia: params.eventoReferencia.trim() } : {}),
      ...(params.direccionEntrega?.trim() ? { direccionEntrega: params.direccionEntrega.trim() } : {}),
      ...(params.observaciones?.trim() ? { observaciones: params.observaciones.trim() } : {}),
      lineas: params.lineas.map((l) => ({
        sku: l.sku,
        descripcion: l.descripcion,
        cantidad: l.cantidad,
        precioUnitario: l.precioUnitario,
      })),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return { ok: true, id: ref.id };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "No se pudo guardar." };
  }
}

export async function actualizarDocumentoComercial(
  firestoreId: string,
  params: {
    numeroDocumento: string;
    fechaIso: string;
    clienteNombre: string;
    clienteDocumento?: string;
    clienteTelefono?: string;
    eventoReferencia?: string;
    direccionEntrega?: string;
    observaciones?: string;
    lineas: LineaDocumentoFirestore[];
  }
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!db) return { ok: false, message: "Firestore no está disponible." };
  try {
    await updateDoc(doc(db, POS_DOCUMENTOS_COMERCIALES_COLLECTION, firestoreId), {
      numeroDocumento: params.numeroDocumento.trim(),
      fechaIso: params.fechaIso,
      clienteNombre: params.clienteNombre.trim(),
      clienteDocumento: params.clienteDocumento?.trim() || null,
      clienteTelefono: params.clienteTelefono?.trim() || null,
      eventoReferencia: params.eventoReferencia?.trim() || null,
      direccionEntrega: params.direccionEntrega?.trim() || null,
      observaciones: params.observaciones?.trim() || null,
      lineas: params.lineas.map((l) => ({
        sku: l.sku,
        descripcion: l.descripcion,
        cantidad: l.cantidad,
        precioUnitario: l.precioUnitario,
      })),
      updatedAt: serverTimestamp(),
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "No se pudo actualizar." };
  }
}

export async function eliminarDocumentoComercial(
  firestoreId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!db) return { ok: false, message: "Firestore no está disponible." };
  try {
    await deleteDoc(doc(db, POS_DOCUMENTOS_COMERCIALES_COLLECTION, firestoreId));
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "No se pudo eliminar." };
  }
}
