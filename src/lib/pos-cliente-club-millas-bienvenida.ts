import { FieldValue, type DocumentReference } from "firebase-admin/firestore";
import {
  enviarBienvenidaClienteClubMillasPorCorreo,
  generarPinClubMillas4Digitos,
} from "@/lib/email-bienvenida-cliente-club-millas";
import { headersClubMillasPosSecretHaciaWms } from "@/lib/club-millas-wms-secret-header";
import { getWmsPublicBaseUrl } from "@/lib/wms-public-base";

export const CAMPO_PIN_CLUB_MILLAS_POS = "clubMillasPinAcceso";

const WMS_UPSERT_PATH_DEFAULT = "/api/club-de-millas/pos/upsert-socio";

export type ClientePosFirestoreLike = {
  puntoVenta?: string;
  tipoCliente?: string;
  tipoIdentificacion?: string;
  numeroIdentificacion?: string;
  nombres?: string;
  apellidos?: string;
  razonSocial?: string;
  email?: string;
  indicativoTelefono?: string;
  telefono?: string;
  cajeroTurnoId?: string;
  cajeroNombre?: string;
  [CAMPO_PIN_CLUB_MILLAS_POS]?: string;
};

function str(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
}

export function nombreDisplayDesdeClientePos(c: ClientePosFirestoreLike): string {
  if (c.tipoCliente === "empresa") {
    return str(c.razonSocial) || "Cliente";
  }
  const nombre = [str(c.nombres), str(c.apellidos)].filter(Boolean).join(" ").trim();
  return nombre || "Cliente";
}

export function telefonoCompletoDesdeClientePos(c: ClientePosFirestoreLike): string {
  const ind = str(c.indicativoTelefono).replace(/\D/g, "");
  const tel = str(c.telefono).replace(/\D/g, "");
  return `${ind}${tel}`.replace(/\D/g, "");
}

export function emailValidoClientePos(email: string): boolean {
  const e = email.trim().toLowerCase();
  return Boolean(e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
}

export function resolverPinClubMillas(pinExistente?: string): string {
  const p = pinExistente?.trim() ?? "";
  if (/^\d{4}$/.test(p)) return p;
  return generarPinClubMillas4Digitos();
}

export function construirBodyWmsUpsertSocio(
  idFirestore: string,
  c: ClientePosFirestoreLike,
  pin: string
): Record<string, unknown> {
  const documento = str(c.numeroIdentificacion);
  const telefono = telefonoCompletoDesdeClientePos(c);
  let nombreCompleto = nombreDisplayDesdeClientePos(c);
  if (nombreCompleto.split(/\s+/).filter(Boolean).length < 2) {
    nombreCompleto = `${nombreCompleto} Cliente`.trim();
  }
  return {
    documento,
    numeroDocumento: documento,
    numeroIdentificacion: documento,
    nombreCompleto,
    correo: str(c.email).toLowerCase(),
    email: str(c.email).toLowerCase(),
    telefono,
    puntoVenta: str(c.puntoVenta),
    pinAccesoClubMillasInicial: pin,
    idDocumentoFirestore: idFirestore,
    origenAlta: "pos",
    registradoPorCajeroTurnoId: str(c.cajeroTurnoId) || null,
    registradoPorCajeroNombre: str(c.cajeroNombre) || null,
  };
}

export async function sincronizarPinClienteEnWms(
  idFirestore: string,
  c: ClientePosFirestoreLike,
  pin: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const raw = process.env.WMS_POS_CLIENTE_UPSERT_PATH?.trim() || WMS_UPSERT_PATH_DEFAULT;
  const secret = process.env.CLUB_MILLAS_POS_SECRET?.trim();
  if (!secret) {
    return { ok: false, error: "Falta CLUB_MILLAS_POS_SECRET en el servidor del POS." };
  }
  const base = getWmsPublicBaseUrl().replace(/\/$/, "");
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  const url = `${base}${path}`;
  try {
    const wmsRes = await fetch(url, {
      method: "POST",
      headers: headersClubMillasPosSecretHaciaWms(secret),
      body: JSON.stringify(construirBodyWmsUpsertSocio(idFirestore, c, pin)),
      cache: "no-store",
    });
    const data = (await wmsRes.json().catch(() => ({}))) as { ok?: boolean; error?: string; message?: string };
    if (!wmsRes.ok || data.ok === false) {
      return {
        ok: false,
        error: data.error || data.message || `WMS respondió HTTP ${wmsRes.status}.`,
      };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error de red al sincronizar con WMS." };
  }
}

export type AplicarBienvenidaClubMillasResult =
  | {
      ok: true;
      pin: string;
      correoEnviado: boolean;
      wmsSincronizado: boolean;
      correoError?: string;
      wmsError?: string;
    }
  | { ok: false; error: string };

/**
 * Genera o reutiliza PIN, sincroniza WMS (pinAccesoRecuperacion) y envía correo de bienvenida.
 */
export async function aplicarBienvenidaClubMillasACliente(
  ref: DocumentReference,
  c: ClientePosFirestoreLike,
  opts?: { pinExistente?: string; omitirCorreo?: boolean }
): Promise<AplicarBienvenidaClubMillasResult> {
  const email = str(c.email).toLowerCase();
  if (!emailValidoClientePos(email)) {
    return { ok: false, error: "El cliente no tiene un correo válido." };
  }
  if (!str(c.numeroIdentificacion)) {
    return { ok: false, error: "Falta número de identificación del cliente." };
  }
  if (!str(c.puntoVenta)) {
    return { ok: false, error: "Falta punto de venta del cliente." };
  }
  const tel = telefonoCompletoDesdeClientePos(c);
  if (tel.length < 7) {
    return { ok: false, error: "Falta teléfono válido del cliente (mínimo 7 dígitos)." };
  }
  const nombre = nombreDisplayDesdeClientePos(c);
  if (nombre.split(/\s+/).filter(Boolean).length < 2 && c.tipoCliente !== "empresa") {
    return { ok: false, error: "Indica nombre y apellido del cliente para el plan de millas." };
  }

  const pin = resolverPinClubMillas(opts?.pinExistente ?? str(c[CAMPO_PIN_CLUB_MILLAS_POS]));
  const wms = await sincronizarPinClienteEnWms(ref.id, c, pin);

  let correoEnviado = false;
  let correoError: string | undefined;
  if (!opts?.omitirCorreo) {
    const envio = await enviarBienvenidaClienteClubMillasPorCorreo({
      to: email,
      nombreDisplay: nombre,
      pin,
    });
    if (envio.ok) correoEnviado = true;
    else correoError = envio.error;
  }

  await ref.set(
    {
      [CAMPO_PIN_CLUB_MILLAS_POS]: pin,
      clubMillasBienvenidaCorreoEnviadoAt: correoEnviado
        ? FieldValue.serverTimestamp()
        : FieldValue.delete(),
      clubMillasPinSincronizadoWmsAt: wms.ok ? FieldValue.serverTimestamp() : FieldValue.delete(),
      ...(str(c.cajeroTurnoId) ? { clubMillasRegistradoPorCajeroTurnoId: str(c.cajeroTurnoId) } : {}),
      ...(str(c.cajeroNombre) ? { clubMillasRegistradoPorCajeroNombre: str(c.cajeroNombre) } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  if (!wms.ok && !correoEnviado) {
    return { ok: false, error: wms.error || correoError || "No se pudo sincronizar ni enviar correo." };
  }

  return {
    ok: true,
    pin,
    correoEnviado,
    wmsSincronizado: wms.ok,
    ...(correoError ? { correoError } : {}),
    ...(wms.ok ? {} : { wmsError: wms.error }),
  };
}
