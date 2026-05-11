import { auth } from "@/lib/firebase";

function normalizarDocumentoInput(raw: string): string {
  return raw.replace(/\s/g, "").replace(/[.\-]/g, "").trim();
}

export type ConsultaPlanMillasResult =
  | { ok: true; registrado: boolean; message?: string }
  | { ok: false; message: string };

/**
 * Consulta en el WMS si el documento ya está registrado en el plan de millas (fidelización).
 * Usa el proxy `/api/pos_fidelizacion_consulta_documento` (Bearer Firebase del cajero).
 */
export async function consultarDocumentoPlanMillasWms(documentoRaw: string): Promise<ConsultaPlanMillasResult> {
  const documento = normalizarDocumentoInput(documentoRaw);
  if (documento.length < 3) {
    return { ok: false, message: "Escribí un número de documento válido (mínimo 3 caracteres sin contar puntos ni guiones)." };
  }

  const token = (await auth?.currentUser?.getIdToken().catch(() => null)) ?? null;
  const headers: HeadersInit = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const res = await fetch(
      `/api/pos_fidelizacion_consulta_documento?documento=${encodeURIComponent(documento)}`,
      { headers }
    );
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      registrado?: boolean;
      message?: string;
    };
    if (data && data.ok === false) {
      return { ok: false, message: data.message ?? "No se pudo validar el documento." };
    }
    return {
      ok: true,
      registrado: Boolean(data.registrado),
      ...(typeof data.message === "string" && data.message.trim() ? { message: data.message.trim() } : {}),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error de red";
    return { ok: false, message: msg.includes("Failed to fetch") ? "Sin conexión. Reintentá en unos segundos." : msg };
  }
}
