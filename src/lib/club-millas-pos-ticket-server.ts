import { randomBytes, randomInt } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";

export const CLUB_MILLAS_COP_POR_MILLA = 9000;
export const CLUB_POS_QR_PREFIX = "BACATA-CLUB-V1-";
export const CLUB_MILLAS_POS_TICKETS = "club_de_millas_pos_tickets";
export const CLUB_MILLAS_CODIGOS_CORTOS_COLLECTION = "club_de_millas_codigos_cortos";
export const CLUB_MILLAS_SOCIOS_COLLECTION = "club_de_millas_socios";
export const CLUB_MILLAS_MOVIMIENTOS_COLLECTION = "club_de_millas_movimientos";

const CHARSET_CODIGO_CORTO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function millasDesdeMontoCop(montoCop: number): number {
  if (!Number.isFinite(montoCop) || montoCop < 0) return 0;
  return Math.floor(montoCop / CLUB_MILLAS_COP_POR_MILLA);
}

export function generarTokenTicketPos(): string {
  return randomBytes(16).toString("hex");
}

export function construirPayloadQrClub(token: string): string {
  return `${CLUB_POS_QR_PREFIX}${token}`;
}

function generarCodigoCortoClubMillas(): string {
  let s = "";
  for (let i = 0; i < 6; i++) {
    s += CHARSET_CODIGO_CORTO[randomInt(CHARSET_CODIGO_CORTO.length)];
  }
  return s;
}

export async function generarCodigoCortoClubMillasUnico(db: Firestore): Promise<string | null> {
  for (let i = 0; i < 12; i++) {
    const candidato = generarCodigoCortoClubMillas();
    const ref = db.collection(CLUB_MILLAS_CODIGOS_CORTOS_COLLECTION).doc(candidato);
    const snap = await ref.get();
    if (!snap.exists) return candidato;
  }
  return null;
}
