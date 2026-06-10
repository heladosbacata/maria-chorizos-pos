/**
 * Reinicia saldos de inventario a cero (solo servidor / Firestore Admin).
 */
import type { App } from "firebase-admin/app";
import { FieldValue, getFirestore, type Firestore, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { normPuntoVentaCatalogo } from "@/lib/punto-venta-catalogo-norm";

const COL_SALDOS = "posInventarioSaldos";
const COL_MOVS = "posInventarioMovimientos";
const COL_ENS_SALDOS = "pos_inventario_ensamble_saldo";

const NOTAS_REINICIO =
  "Reinicio de inventario — todos los saldos llevados a cero (acción confirmada en Cargue inventario).";

export type ResumenReinicioInventario = {
  legacyAjustados: number;
  ensambleEnCero: number;
  yaEnCero: number;
};

function str(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return String(v).trim();
}

function cantidadDesdeDoc(data: Record<string, unknown>): number {
  const raw = data.cantidad ?? data.stock ?? data.saldo ?? data.qty ?? data.quantity ?? data.cantidadActual;
  const c = Number(raw);
  return Number.isFinite(c) ? c : 0;
}

async function listarDocsPorConsulta(
  db: Firestore,
  col: string,
  field: string,
  value: string
): Promise<QueryDocumentSnapshot[]> {
  const out: QueryDocumentSnapshot[] = [];
  let q = db.collection(col).where(field, "==", value).limit(400);
  while (true) {
    const snap = await q.get();
    if (snap.empty) break;
    out.push(...snap.docs);
    if (snap.size < 400) break;
    const last = snap.docs[snap.docs.length - 1]!;
    q = db.collection(col).where(field, "==", value).startAfter(last).limit(400);
  }
  return out;
}

export async function reiniciarInventarioPuntoVentaAdmin(
  app: App,
  params: {
    puntoVenta: string;
    uid: string;
    email: string | null;
  }
): Promise<{ ok: true; resumen: ResumenReinicioInventario } | { ok: false; message: string }> {
  const pv = params.puntoVenta.trim();
  if (!pv) return { ok: false, message: "Falta punto de venta." };

  const db = getFirestore(app);
  const pvClave = normPuntoVentaCatalogo(pv);
  const resumen: ResumenReinicioInventario = {
    legacyAjustados: 0,
    ensambleEnCero: 0,
    yaEnCero: 0,
  };

  try {
    const legacyDocs = await listarDocsPorConsulta(db, COL_SALDOS, "puntoVenta", pv);
    let batch = db.batch();
    let opCount = 0;

    const flushBatch = async () => {
      if (opCount === 0) return;
      await batch.commit();
      batch = db.batch();
      opCount = 0;
    };

    for (const docSnap of legacyDocs) {
      const data = docSnap.data() as Record<string, unknown>;
      const anterior = cantidadDesdeDoc(data);
      if (anterior === 0) {
        resumen.yaEnCero += 1;
        continue;
      }

      const insumoId = str(data.insumoId) || docSnap.id.split("__").pop() || docSnap.id;
      const insumoSku = str(data.insumoSku) || insumoId;
      const tipo = anterior > 0 ? "ajuste_negativo" : "ajuste_positivo";
      const delta = anterior > 0 ? -Math.abs(anterior) : Math.abs(anterior);

      batch.set(
        docSnap.ref,
        {
          puntoVenta: pv,
          insumoId,
          insumoSku,
          cantidad: 0,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      batch.set(db.collection(COL_MOVS).doc(), {
        puntoVenta: pv,
        insumoId,
        insumoSku,
        insumoDescripcion: insumoSku,
        tipo,
        delta,
        cantidadAnterior: anterior,
        cantidadNueva: 0,
        notas: NOTAS_REINICIO,
        uid: params.uid,
        email: params.email,
        createdAt: FieldValue.serverTimestamp(),
      });
      opCount += 2;
      resumen.legacyAjustados += 1;
      if (opCount >= 400) await flushBatch();
    }
    await flushBatch();

    const ensIds = new Set<string>();
    const ensDocs: QueryDocumentSnapshot[] = [];
    for (const d of await listarDocsPorConsulta(db, COL_ENS_SALDOS, "puntoVenta", pv)) {
      if (!ensIds.has(d.id)) {
        ensIds.add(d.id);
        ensDocs.push(d);
      }
    }
    if (pvClave) {
      for (const d of await listarDocsPorConsulta(db, COL_ENS_SALDOS, "puntoVentaClave", pvClave)) {
        if (!ensIds.has(d.id)) {
          ensIds.add(d.id);
          ensDocs.push(d);
        }
      }
    }

    batch = db.batch();
    opCount = 0;
    for (const docSnap of ensDocs) {
      const anterior = cantidadDesdeDoc(docSnap.data() as Record<string, unknown>);
      if (anterior === 0) continue;
      batch.set(
        docSnap.ref,
        {
          cantidad: 0,
          stock: 0,
          saldo: 0,
          updatedAt: FieldValue.serverTimestamp(),
          reiniciadoPorPos: true,
          reiniciadoEn: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      opCount += 1;
      resumen.ensambleEnCero += 1;
      if (opCount >= 400) await flushBatch();
    }
    await flushBatch();

    return { ok: true, resumen };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "No se pudo reiniciar el inventario.",
    };
  }
}
