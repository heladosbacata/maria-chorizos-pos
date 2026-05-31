import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { hashClubMillasClave } from "@/lib/club-millas-clave-hash";
import {
  construirCorreoRecuperacionClaveClubMillas,
  enmascararCorreoClubMillas,
} from "@/lib/club-millas-correo-recuperacion";
import { generarPinClubMillas4Digitos } from "@/lib/email-bienvenida-cliente-club-millas";

const CLUB_MILLAS_PIN_RECUPERACION_FIELD = "pinAccesoRecuperacion";

export function normalizarDocumentoClubMillasPos(raw: string): string {
  return String(raw ?? "")
    .replace(/\D/g, "")
    .trim();
}

function esPinClubMillasValido(pin: string): boolean {
  return /^\d{4}$/.test(pin.trim());
}

function leerPinRecuperacionGuardado(d: Record<string, unknown>): string | null {
  const raw = d[CLUB_MILLAS_PIN_RECUPERACION_FIELD];
  if (typeof raw === "string" && esPinClubMillasValido(raw)) return raw.trim();
  return null;
}

export type PrepararRecuperacionClubMillasPosResult =
  | {
      ok: true;
      correoDestino: string;
      correoEnmascarado: string;
      pinRenovado: boolean;
      subject: string;
      text: string;
      html: string;
    }
  | { ok: false; error: string; codigo?: "sin_cuenta" | "sin_correo" };

/** Prepara PIN y cuerpo del correo leyendo `club_de_millas_socios` (mismo Firestore que el WMS). */
export async function prepararRecuperacionClaveClubMillasEnPos(
  db: Firestore,
  documentoRaw: string
): Promise<PrepararRecuperacionClubMillasPosResult> {
  const documento = normalizarDocumentoClubMillasPos(documentoRaw);
  if (documento.length < 5) {
    return { ok: false, error: "Indica un documento válido (mínimo 5 dígitos).", codigo: "sin_cuenta" };
  }

  const col = db.collection("club_de_millas_socios");
  let snap = await col.where("documento", "==", documento).limit(1).get();
  if (snap.empty && /^\d+$/.test(documento)) {
    const n = Number(documento);
    if (Number.isSafeInteger(n) && n > 0) {
      snap = await col.where("documento", "==", n).limit(1).get();
    }
  }

  if (snap.empty) {
    return {
      ok: false,
      error: "No encontramos una cuenta del Club de Millas con ese documento.",
      codigo: "sin_cuenta",
    };
  }

  const docRef = snap.docs[0];
  const d = docRef.data() as Record<string, unknown>;
  const correo = String(d.correo ?? d.email ?? "")
    .trim()
    .toLowerCase();

  if (!correo || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
    return {
      ok: false,
      error:
        "Tu cuenta no tiene un correo registrado. Acercate a tu punto de venta María Chorizos para actualizar tus datos.",
      codigo: "sin_correo",
    };
  }

  let pin = leerPinRecuperacionGuardado(d);
  let pinRenovado = false;
  if (!pin) {
    pin = generarPinClubMillas4Digitos();
    pinRenovado = true;
    await docRef.ref.set(
      {
        claveHash: hashClubMillasClave(pin),
        [CLUB_MILLAS_PIN_RECUPERACION_FIELD]: pin,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  const nombreCompleto = String(d.nombreCompleto ?? "").trim();
  const { subject, text, html } = construirCorreoRecuperacionClaveClubMillas({
    nombreDisplay: nombreCompleto,
    pin,
    documento,
  });

  return {
    ok: true,
    correoDestino: correo,
    correoEnmascarado: enmascararCorreoClubMillas(correo),
    pinRenovado,
    subject,
    text,
    html,
  };
}
