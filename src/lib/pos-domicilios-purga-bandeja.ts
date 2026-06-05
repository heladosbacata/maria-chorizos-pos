import type { Firestore } from "firebase-admin/firestore";
import { purgarChatsMemoriaPorPuntoVenta } from "@/lib/pos-domicilios-chat-memory-store";
import { setPedidosMemory } from "@/lib/pos-domicilios-memory-store";
import { puntoVentaFirestoreClave as normPv } from "@/lib/pos-domicilios-pv-clave";

/** Incrementar cuando haya que vaciar la bandeja de todos los PV una sola vez. */
export const BANDEJA_DOMICILIOS_PURGA_VERSION = 2;

export const COLL_DOMICILIOS_CONFIG = "posDomiciliosConfig";
const COLL_PEDIDOS = "posDomiciliosPedidos";
const COLL_CHAT = "posDomiciliosChats";

const globalForPurga = globalThis as typeof globalThis & {
  __posDomiciliosPurgaVersion__?: Map<string, number>;
};

function purgaMemMap(): Map<string, number> {
  if (!globalForPurga.__posDomiciliosPurgaVersion__) {
    globalForPurga.__posDomiciliosPurgaVersion__ = new Map();
  }
  return globalForPurga.__posDomiciliosPurgaVersion__;
}

function versionPurgaMemoria(pv: string): number {
  return purgaMemMap().get(pv.trim()) ?? 0;
}

function marcarPurgaMemoria(pv: string): void {
  purgaMemMap().set(pv.trim(), BANDEJA_DOMICILIOS_PURGA_VERSION);
}

async function refsColeccionPorPv(
  db: Firestore,
  coleccion: string,
  pv: string,
  nk: string
): Promise<FirebaseFirestore.DocumentReference[]> {
  const [byNorm, byPv] = await Promise.all([
    db.collection(coleccion).where("puntoVentaNorm", "==", nk).get(),
    db.collection(coleccion).where("puntoVenta", "==", pv).get(),
  ]);
  const refs = new Map<string, FirebaseFirestore.DocumentReference>();
  for (const doc of [...byNorm.docs, ...byPv.docs]) refs.set(doc.id, doc.ref);
  return Array.from(refs.values());
}

async function borrarRefsEnLotes(db: Firestore, refs: FirebaseFirestore.DocumentReference[]): Promise<void> {
  const CHUNK = 400;
  for (let i = 0; i < refs.length; i += CHUNK) {
    const batch = db.batch();
    for (const ref of refs.slice(i, i + CHUNK)) batch.delete(ref);
    await batch.commit();
  }
}

/** Vacía pedidos y chats de prueba en memoria (dev sin Firebase Admin). */
export function purgarBandejaDomiciliosMemoria(puntoVenta: string): boolean {
  const pv = puntoVenta.trim();
  if (!pv || versionPurgaMemoria(pv) >= BANDEJA_DOMICILIOS_PURGA_VERSION) return false;
  setPedidosMemory(pv, []);
  purgarChatsMemoriaPorPuntoVenta(pv);
  marcarPurgaMemoria(pv);
  return true;
}

/** Vacía pedidos y chats de prueba en Firestore (una vez por PV). */
export async function purgarBandejaDomiciliosFirestore(db: Firestore, puntoVenta: string): Promise<boolean> {
  const pv = puntoVenta.trim();
  if (!pv) return false;
  const nk = normPv(pv);
  const configRef = db.collection(COLL_DOMICILIOS_CONFIG).doc(nk);
  const configSnap = await configRef.get();
  const version =
    typeof configSnap.data()?.bandejaDomiciliosPurgaVersion === "number"
      ? configSnap.data()!.bandejaDomiciliosPurgaVersion
      : 0;
  if (version >= BANDEJA_DOMICILIOS_PURGA_VERSION) return false;

  const [pedidoRefs, chatRefs] = await Promise.all([
    refsColeccionPorPv(db, COLL_PEDIDOS, pv, nk),
    refsColeccionPorPv(db, COLL_CHAT, pv, nk),
  ]);
  await borrarRefsEnLotes(db, [...pedidoRefs, ...chatRefs]);

  await configRef.set({ bandejaDomiciliosPurgaVersion: BANDEJA_DOMICILIOS_PURGA_VERSION }, { merge: true });
  setPedidosMemory(pv, []);
  purgarChatsMemoriaPorPuntoVenta(pv);
  return true;
}
