import { auth } from "@/lib/firebase";

export function normalizarDocumentoClubMillasInput(raw: string): string {
  return raw.replace(/\s/g, "").replace(/[.\-]/g, "").trim();
}

export function documentoListoParaClubMillas(raw: string): boolean {
  return normalizarDocumentoClubMillasInput(raw).length >= 5;
}

/** Mensaje legible para el cajero cuando el POS no pudo enviar SMTP. */
export function mensajeErrorCorreoClubMillas(raw: string): string {
  const r = (raw ?? "").toLowerCase();
  if (r.includes("535") || r.includes("authentication failed") || r.includes("invalid login")) {
    return (
      "No se pudo enviar el correo: el servidor SMTP del POS rechazó usuario o contraseña (error 535). " +
      "En local: revisá SMTP_HOST/SMTP_USER/SMTP_PASS o ZOHO_SMTP_* en .env.local (contraseña de aplicación Zoho), " +
      "o definí POS_DEPLOY_PROXY_URL=https://maria-chorizos-pos.vercel.app para enviar con la config de producción. " +
      "En Vercel del POS: mismas variables que el informe de cierre de turno."
    );
  }
  if (r.includes("553") || r.includes("sender") || r.includes("relay")) {
    return "No se pudo enviar el correo: el remitente SMTP no está autorizado (error 553). Revisá SMTP_FROM o ZOHO_SMTP_FROM en el servidor del POS.";
  }
  if (r.includes("correo no configurado") || r.includes("zoho_smtp incompleto")) {
    return (
      "El POS no tiene correo configurado para enviar la clave. Agregá SMTP_* o ZOHO_SMTP_* o RESEND_* " +
      "(mismo que informe de turno), o POS_DEPLOY_PROXY_URL en desarrollo local."
    );
  }
  return raw.trim() || "No se pudo enviar el correo de recuperación.";
}

export type RecuperarClaveClubMillasDocumentoResult =
  | { ok: true; message: string; correoEnmascarado?: string; pinRenovado?: boolean }
  | { ok: false; message: string };

/** Recuperación de clave del portal club-de-millas (solo documento, correo del socio en WMS). */
export async function recuperarClaveClubMillasPorDocumento(
  documentoRaw: string
): Promise<RecuperarClaveClubMillasDocumentoResult> {
  const documento = normalizarDocumentoClubMillasInput(documentoRaw);
  if (documento.length < 5) {
    return { ok: false, message: "Escribí el documento completo del cliente (mínimo 5 dígitos)." };
  }
  if (!auth?.currentUser) {
    return { ok: false, message: "Iniciá sesión de nuevo." };
  }

  try {
    const token = await auth.currentUser.getIdToken();
    const res = await fetch("/api/pos_club_millas_recuperar_clave", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ documento }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      message?: string;
      correoEnmascarado?: string;
      pinRenovado?: boolean;
    };
    if (!res.ok || !data.ok) {
      const crudo = data.message ?? "No se pudo enviar el correo de recuperación.";
      return {
        ok: false,
        message: mensajeErrorCorreoClubMillas(crudo),
      };
    }
    return {
      ok: true,
      message: data.message ?? "Correo enviado.",
      ...(data.correoEnmascarado ? { correoEnmascarado: data.correoEnmascarado } : {}),
      ...(data.pinRenovado ? { pinRenovado: true } : {}),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error de red.";
    const red =
      msg.includes("fetch failed") || msg.includes("Failed to fetch")
        ? "Sin conexión con el servidor POS. Reintentá en unos segundos."
        : msg;
    return {
      ok: false,
      message: mensajeErrorCorreoClubMillas(red),
    };
  }
}
