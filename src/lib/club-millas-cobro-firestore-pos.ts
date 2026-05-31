import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { normalizarDocumentoClubMillasPos } from "@/lib/club-millas-preparar-recuperacion-pos";
import {
  CLUB_MILLAS_CODIGOS_CORTOS_COLLECTION,
  CLUB_MILLAS_MOVIMIENTOS_COLLECTION,
  CLUB_MILLAS_POS_TICKETS,
  CLUB_MILLAS_SOCIOS_COLLECTION,
  construirPayloadQrClub,
  generarCodigoCortoClubMillasUnico,
  generarTokenTicketPos,
  millasDesdeMontoCop,
} from "@/lib/club-millas-pos-ticket-server";

export type CobroClubMillasFirestoreResult =
  | {
      ok: true;
      puntosSumados: number;
      saldoMillas: number;
      qrPayload: string;
      codigoCorto?: string;
      millas: number;
      montoTotalCop: number;
      mensaje: string;
      yaAcumulado?: boolean;
    }
  | { ok: true; omitido: true; codigo: "monto_insuficiente"; message: string }
  | { ok: false; message: string; saldoMillas?: number; yaAcumulado?: boolean };

async function resolverSocioIdPorDocumento(db: Firestore, documento: string): Promise<string | null> {
  const col = db.collection(CLUB_MILLAS_SOCIOS_COLLECTION);
  let snap = await col.where("documento", "==", documento).limit(1).get();
  if (snap.empty && /^\d+$/.test(documento)) {
    const n = Number(documento);
    if (Number.isSafeInteger(n) && n > 0) {
      snap = await col.where("documento", "==", n).limit(1).get();
    }
  }
  if (snap.empty) return null;
  return snap.docs[0].id;
}

/**
 * Registra ticket POS y acumula millas en Firestore (misma lógica que WMS registrar-ticket + acumular-millas).
 * Usa Firebase Admin del POS; no requiere CLUB_MILLAS_POS_SECRET.
 */
export async function cobrarClienteFrecuenteClubMillasEnFirestore(
  db: Firestore,
  opts: {
    documento: string;
    socioId?: string;
    montoTotalCop: number;
    puntoVenta?: string;
    idFacturaPos?: string;
    cajaId?: string;
    ventaId?: string;
  }
): Promise<CobroClubMillasFirestoreResult> {
  const documento = normalizarDocumentoClubMillasPos(opts.documento);
  if (documento.length < 5) {
    return { ok: false, message: "Documento del cliente inválido." };
  }

  const montoTotalCop = Math.round(opts.montoTotalCop);
  const millas = millasDesdeMontoCop(montoTotalCop);
  if (millas < 1) {
    return {
      ok: true,
      omitido: true,
      codigo: "monto_insuficiente",
      message: `El total no alcanza el mínimo ($${(9000).toLocaleString("es-CO")} COP por milla).`,
    };
  }

  let socioId = String(opts.socioId ?? "").trim();
  if (!socioId) {
    const resuelto = await resolverSocioIdPorDocumento(db, documento);
    if (!resuelto) {
      return {
        ok: false,
        message: "No encontramos socio del Club de Millas con ese documento.",
      };
    }
    socioId = resuelto;
  }

  const token = generarTokenTicketPos();
  const qrPayload = construirPayloadQrClub(token);
  const codigoCorto = await generarCodigoCortoClubMillasUnico(db);
  if (!codigoCorto) {
    return { ok: false, message: "No se pudo generar el código de tirilla. Reintentá." };
  }

  const ticketRef = db.collection(CLUB_MILLAS_POS_TICKETS).doc(token);
  const socioRef = db.collection(CLUB_MILLAS_SOCIOS_COLLECTION).doc(socioId);
  const ventaKey = opts.ventaId?.trim().slice(0, 120);
  const movimientoId = ventaKey ? `pos_venta_${ventaKey}` : `pos_ticket_${token}`;
  const movRef = db.collection(CLUB_MILLAS_MOVIMIENTOS_COLLECTION).doc(movimientoId);

  try {
    const resultado = await db.runTransaction(async (tx) => {
      const socioSnap = await tx.get(socioRef);
      if (!socioSnap.exists) {
        throw Object.assign(new Error("No encontramos la cuenta del socio."), { status: 404 });
      }

      const socio = socioSnap.data() as Record<string, unknown>;
      const docSocio = String(socio.documento ?? "").replace(/\D/g, "").trim();
      if (docSocio && docSocio !== documento) {
        throw Object.assign(new Error("El documento no coincide con el socio."), { status: 403 });
      }

      const movSnap = await tx.get(movRef);
      if (movSnap.exists) {
        const saldoActual = Number(socio.millasAcumuladas ?? 0) || 0;
        throw Object.assign(new Error("DUPLICADO"), {
          code: "DUPLICADO",
          saldoMillas: saldoActual,
        });
      }

      const saldoActual = Number(socio.millasAcumuladas ?? 0) || 0;
      const nuevoSaldo = saldoActual + millas;

      tx.set(
        ticketRef,
        {
          montoTotalCop,
          millas,
          codigoCorto,
          idFacturaPos: opts.idFacturaPos?.trim() || null,
          cajaId: opts.cajaId?.trim() || null,
          puntoVenta: opts.puntoVenta?.trim() || null,
          documentoSocio: documento,
          socioIdPos: socioId,
          ventaId: opts.ventaId?.trim() || null,
          consumido: true,
          consumidoPorSocioId: socioId,
          consumidoEn: FieldValue.serverTimestamp(),
          createdAt: FieldValue.serverTimestamp(),
          origen: "pos_firestore_direct",
        },
        { merge: true }
      );

      tx.set(
        db.collection(CLUB_MILLAS_CODIGOS_CORTOS_COLLECTION).doc(codigoCorto),
        {
          token,
          consumido: true,
          consumidoEn: FieldValue.serverTimestamp(),
          createdAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      tx.set(
        socioRef,
        {
          millasAcumuladas: nuevoSaldo,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      tx.set(movRef, {
        socioId,
        documento,
        tipo: "ACUMULACION_POS_COBRO",
        ticketToken: token,
        qrCode: qrPayload,
        puntos: millas,
        montoTotalCop,
        idFacturaPos: opts.idFacturaPos?.trim() || null,
        ventaId: opts.ventaId?.trim() || null,
        createdAt: FieldValue.serverTimestamp(),
      });

      return { nuevoSaldo, millas };
    });

    return {
      ok: true,
      puntosSumados: resultado.millas,
      saldoMillas: resultado.nuevoSaldo,
      qrPayload,
      codigoCorto,
      millas: resultado.millas,
      montoTotalCop,
      mensaje: `Sumaste ${resultado.millas} milla(s). Saldo: ${resultado.nuevoSaldo.toLocaleString("es-CO")} millas.`,
    };
  } catch (e) {
    const err = e as { message?: string; code?: string; saldoMillas?: number; status?: number };
    if (err.code === "DUPLICADO" || err.message === "DUPLICADO") {
      const saldo = typeof err.saldoMillas === "number" ? err.saldoMillas : undefined;
      return {
        ok: true,
        puntosSumados: 0,
        saldoMillas: saldo ?? 0,
        qrPayload,
        millas,
        montoTotalCop,
        mensaje: "Las millas de esta compra ya estaban registradas.",
        yaAcumulado: true,
      };
    }
    return {
      ok: false,
      message: err.message || "No se pudieron acumular millas en Firestore.",
      saldoMillas: err.saldoMillas,
    };
  }
}
