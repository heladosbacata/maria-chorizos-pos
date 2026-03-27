import {
  addDoc,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { ClientePosFirestoreDoc, TipoClientePos } from "@/types/clientes-pos";

export const POS_CLIENTES_COLLECTION = "posClientes";

function str(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return String(v).trim();
}

function docToCliente(id: string, data: Record<string, unknown>): ClientePosFirestoreDoc {
  const tipoCliente = data.tipoCliente === "empresa" ? "empresa" : "persona";
  const dc = data.datosComplementarios;
  let datosComplementarios: Record<string, string> | undefined;
  if (dc && typeof dc === "object" && dc !== null && !Array.isArray(dc)) {
    const o: Record<string, string> = {};
    for (const [k, v] of Object.entries(dc as Record<string, unknown>)) {
      if (typeof v === "string" && v.trim()) o[k] = v.trim();
    }
    if (Object.keys(o).length) datosComplementarios = o;
  }
  return {
    id,
    puntoVenta: str(data.puntoVenta),
    tipoCliente,
    tipoIdentificacion: str(data.tipoIdentificacion),
    numeroIdentificacion: str(data.numeroIdentificacion),
    ...(str(data.digitoVerificacion) ? { digitoVerificacion: str(data.digitoVerificacion) } : {}),
    ...(str(data.nombres) ? { nombres: str(data.nombres) } : {}),
    ...(str(data.apellidos) ? { apellidos: str(data.apellidos) } : {}),
    ...(str(data.razonSocial) ? { razonSocial: str(data.razonSocial) } : {}),
    ...(str(data.email) ? { email: str(data.email) } : {}),
    ...(str(data.indicativoTelefono) ? { indicativoTelefono: str(data.indicativoTelefono) } : {}),
    ...(str(data.telefono) ? { telefono: str(data.telefono) } : {}),
    ...(datosComplementarios ? { datosComplementarios } : {}),
    createdByUid: str(data.createdByUid),
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

export function nombreDisplayCliente(c: ClientePosFirestoreDoc): string {
  if (c.tipoCliente === "empresa" && c.razonSocial?.trim()) return c.razonSocial.trim();
  const n = [c.nombres, c.apellidos].filter(Boolean).join(" ").trim();
  if (n) return n;
  return c.numeroIdentificacion || c.id.slice(0, 8);
}

/** Lista clientes del punto de venta (más recientes primero). */
export async function listarClientesPorPuntoVenta(puntoVenta: string, max: number = 400): Promise<ClientePosFirestoreDoc[]> {
  if (!db) return [];
  const pv = puntoVenta.trim();
  if (!pv) return [];
  try {
    const q = query(
      collection(db, POS_CLIENTES_COLLECTION),
      where("puntoVenta", "==", pv),
      orderBy("createdAt", "desc"),
      limit(max)
    );
    const snap = await getDocs(q);
    const out: ClientePosFirestoreDoc[] = [];
    snap.forEach((d) => {
      out.push(docToCliente(d.id, d.data() as Record<string, unknown>));
    });
    return out;
  } catch {
    try {
      const q2 = query(collection(db, POS_CLIENTES_COLLECTION), where("puntoVenta", "==", pv), limit(max));
      const snap = await getDocs(q2);
      const out: ClientePosFirestoreDoc[] = [];
      snap.forEach((d) => {
        out.push(docToCliente(d.id, d.data() as Record<string, unknown>));
      });
      out.sort((a, b) => {
        const sa = a.createdAt && typeof (a.createdAt as { seconds?: number }).seconds === "number" ? (a.createdAt as { seconds: number }).seconds : 0;
        const sb = b.createdAt && typeof (b.createdAt as { seconds?: number }).seconds === "number" ? (b.createdAt as { seconds: number }).seconds : 0;
        return sb - sa;
      });
      return out;
    } catch {
      return [];
    }
  }
}

export function filtrarClientesPorBusqueda(clientes: ClientePosFirestoreDoc[], texto: string): ClientePosFirestoreDoc[] {
  const q = texto.trim().toLowerCase();
  if (!q) return clientes;
  return clientes.filter((c) => {
    const blob = [
      nombreDisplayCliente(c),
      c.numeroIdentificacion,
      c.email,
      c.telefono,
      c.tipoIdentificacion,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return blob.includes(q);
  });
}

export interface CrearClientePosInput {
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
}

export async function crearClientePos(input: CrearClientePosInput): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  if (!db) return { ok: false, message: "Firestore no está disponible." };
  const pv = input.puntoVenta.trim();
  if (!pv) return { ok: false, message: "Falta punto de venta." };
  if (!input.tipoIdentificacion.trim()) return { ok: false, message: "Indica el tipo de identificación." };
  if (!input.numeroIdentificacion.trim()) return { ok: false, message: "Indica el número de identificación." };
  if (input.tipoCliente === "empresa") {
    if (!input.razonSocial?.trim()) return { ok: false, message: "Indica la razón social." };
  } else {
    if (!input.nombres?.trim() && !input.apellidos?.trim()) {
      return { ok: false, message: "Indica nombres o apellidos." };
    }
  }

  try {
    const ref = await addDoc(collection(db, POS_CLIENTES_COLLECTION), {
      puntoVenta: pv,
      tipoCliente: input.tipoCliente,
      tipoIdentificacion: input.tipoIdentificacion.trim(),
      numeroIdentificacion: input.numeroIdentificacion.trim(),
      ...(input.digitoVerificacion?.trim() ? { digitoVerificacion: input.digitoVerificacion.trim() } : {}),
      ...(input.nombres?.trim() ? { nombres: input.nombres.trim() } : {}),
      ...(input.apellidos?.trim() ? { apellidos: input.apellidos.trim() } : {}),
      ...(input.razonSocial?.trim() ? { razonSocial: input.razonSocial.trim() } : {}),
      ...(input.email?.trim() ? { email: input.email.trim().toLowerCase() } : {}),
      ...(input.indicativoTelefono?.trim() ? { indicativoTelefono: input.indicativoTelefono.trim() } : {}),
      ...(input.telefono?.trim() ? { telefono: input.telefono.trim() } : {}),
      ...(input.datosComplementarios && Object.keys(input.datosComplementarios).length
        ? { datosComplementarios: input.datosComplementarios }
        : {}),
      createdByUid: input.createdByUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return { ok: true, id: ref.id };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "No se pudo crear el cliente." };
  }
}
