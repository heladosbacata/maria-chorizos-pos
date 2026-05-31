import { auth } from "@/lib/firebase";

export function normalizarDocumentoClubMillasInput(raw: string): string {
  return raw.replace(/\s/g, "").replace(/[.\-]/g, "").trim();
}

export function documentoListoParaClubMillas(raw: string): boolean {
  return normalizarDocumentoClubMillasInput(raw).length >= 5;
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
      return {
        ok: false,
        message: data.message ?? "No se pudo enviar el correo de recuperación.",
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
    return {
      ok: false,
      message:
        msg.includes("fetch failed") || msg.includes("Failed to fetch")
          ? "Sin conexión con el servidor POS. Reintentá en unos segundos."
          : msg,
    };
  }
}
