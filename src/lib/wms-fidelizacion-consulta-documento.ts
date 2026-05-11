import { auth } from "@/lib/firebase";
import type { PlanMillasClienteResumen } from "@/lib/plan-millas-validar-resumen";

function normalizarDocumentoInput(raw: string): string {
  return raw.replace(/\s/g, "").replace(/[.\-]/g, "").trim();
}

export type ConsultaPlanMillasResult =
  | { ok: true; registrado: boolean; message?: string; clientePlanMillas?: PlanMillasClienteResumen }
  | { ok: false; message: string };

/**
 * Consulta en el WMS (mismo dominio que el catálogo) si el documento está en el plan de millas.
 * Proxy: `/api/pos_fidelizacion_consulta_documento` → `GET|POST …/api/club-de-millas/pos/validar-documento`.
 * Solo acepta afiliación si la respuesta trae `registrado === true` (no basta con `ok`).
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
      { headers, cache: "no-store" }
    );
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      registrado?: boolean;
      message?: string;
      clientePlanMillas?: PlanMillasClienteResumen;
    };
    if (data && data.ok === false) {
      return { ok: false, message: data.message ?? "No se pudo validar el documento." };
    }
    /** Solo cuenta `registrado === true` del WMS (no basta con `ok`). */
    if (data?.ok === true && data.registrado === true) {
      return {
        ok: true,
        registrado: true,
        ...(data.clientePlanMillas && Object.keys(data.clientePlanMillas).length > 0
          ? { clientePlanMillas: data.clientePlanMillas }
          : {}),
      };
    }
    if (data?.ok === true) {
      return {
        ok: true,
        registrado: false,
        ...(typeof data.message === "string" && data.message.trim() ? { message: data.message.trim() } : {}),
      };
    }
    return { ok: false, message: "Respuesta inválida al validar el documento." };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error de red";
    return { ok: false, message: msg.includes("Failed to fetch") ? "Sin conexión. Reintentá en unos segundos." : msg };
  }
}
