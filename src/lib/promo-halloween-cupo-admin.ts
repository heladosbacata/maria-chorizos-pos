import { FieldValue, type DocumentData, type Firestore } from "firebase-admin/firestore";
import {
  PROMO_HALLOWEEN_CUPO_MAX,
  disponiblesPromoHalloween,
  esVentanaPromoHalloween,
  idDocumentoCupoPromoHalloween,
} from "@/lib/promo-halloween-pos";

const COLECCION_CUPO = "pos_promo_halloween_cupo";
const COLECCION_IDEM = "pos_promo_halloween_cupo_idem";

export type ResultadoCupoPromo = {
  ok: boolean;
  disponibles: number;
  cupoMax: number;
  vendidos: number;
  activa: boolean;
  already?: boolean;
  message?: string;
};

function leerVendidos(data: DocumentData | undefined): number {
  const n = Number(data?.vendidos ?? 0);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

export async function leerCupoPromoHalloweenAdmin(
  db: Firestore,
  puntoVenta: string,
  ahora: Date = new Date()
): Promise<ResultadoCupoPromo> {
  const ref = db.collection(COLECCION_CUPO).doc(idDocumentoCupoPromoHalloween(puntoVenta, ahora));
  const snap = await ref.get();
  const vendidos = snap.exists ? leerVendidos(snap.data()) : 0;
  return {
    ok: true,
    activa: esVentanaPromoHalloween(ahora),
    cupoMax: PROMO_HALLOWEEN_CUPO_MAX,
    vendidos,
    disponibles: disponiblesPromoHalloween(vendidos),
  };
}

/**
 * Descuenta o devuelve unidades de la promo del punto.
 * El mismo ventaId no descuenta dos veces ni devuelve dos veces.
 */
export async function aplicarMovimientoCupoPromo(
  db: Firestore,
  params: {
    puntoVenta: string;
    ventaId: string;
    cantidad: number;
    accion: "consumir" | "devolver";
    ahora?: Date;
  }
): Promise<ResultadoCupoPromo> {
  const ahora = params.ahora ?? new Date();
  const cantidad = Math.max(0, Math.round(params.cantidad));
  const ventaId = params.ventaId.trim();
  const docId = idDocumentoCupoPromoHalloween(params.puntoVenta, ahora);
  const cupoRef = db.collection(COLECCION_CUPO).doc(docId);
  const idemRef = db.collection(COLECCION_IDEM).doc(`${docId}__${ventaId}`);
  const activa = esVentanaPromoHalloween(ahora);

  if (!ventaId || !(cantidad > 0)) {
    return {
      ok: false,
      activa,
      cupoMax: PROMO_HALLOWEEN_CUPO_MAX,
      vendidos: 0,
      disponibles: 0,
      message: "Falta la venta o la cantidad de la promo.",
    };
  }

  return db.runTransaction(async (tx) => {
    const [cupoSnap, idemSnap] = await Promise.all([tx.get(cupoRef), tx.get(idemRef)]);
    const vendidos = cupoSnap.exists ? leerVendidos(cupoSnap.data()) : 0;
    const idem = idemSnap.exists ? idemSnap.data() : undefined;
    const base = {
      activa,
      cupoMax: PROMO_HALLOWEEN_CUPO_MAX,
      vendidos,
      disponibles: disponiblesPromoHalloween(vendidos),
    };

    if (params.accion === "consumir") {
      if (!activa) {
        return { ...base, ok: false, message: "La promo Halloween no está activa." };
      }
      if (idem?.accion === "consumir") {
        return { ...base, ok: true, already: true };
      }
      if (vendidos + cantidad > PROMO_HALLOWEEN_CUPO_MAX) {
        const disponibles = disponiblesPromoHalloween(vendidos);
        return {
          ...base,
          ok: false,
          disponibles,
          message: disponibles <= 0 ? "Promo no disponible" : `Solo quedan ${disponibles} unidades de la promo.`,
        };
      }
      const vendidosNext = vendidos + cantidad;
      tx.set(
        cupoRef,
        {
          vendidos: vendidosNext,
          cupoMax: PROMO_HALLOWEEN_CUPO_MAX,
          puntoVenta: params.puntoVenta,
          sku: "promoha",
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      tx.set(idemRef, {
        accion: "consumir",
        cantidad,
        ventaId,
        devuelto: false,
        at: FieldValue.serverTimestamp(),
      });
      return {
        ok: true,
        activa,
        cupoMax: PROMO_HALLOWEEN_CUPO_MAX,
        vendidos: vendidosNext,
        disponibles: disponiblesPromoHalloween(vendidosNext),
      };
    }

    if (!idem || idem.accion !== "consumir" || idem.devuelto === true) {
      return { ...base, ok: true, already: true };
    }
    const aDevolver = Math.min(leerVendidos({ vendidos: Number(idem.cantidad ?? cantidad) }), vendidos);
    const vendidosNext = vendidos - aDevolver;
    tx.set(
      cupoRef,
      {
        vendidos: vendidosNext,
        cupoMax: PROMO_HALLOWEEN_CUPO_MAX,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    tx.set(
      idemRef,
      { devuelto: true, devueltoAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
    return {
      ok: true,
      activa,
      cupoMax: PROMO_HALLOWEEN_CUPO_MAX,
      vendidos: vendidosNext,
      disponibles: disponiblesPromoHalloween(vendidosNext),
    };
  });
}
