import { auth } from "@/lib/firebase";
import { emailDesdeFichaFranquiciado, getFranquiciadoPorPuntoVenta } from "@/lib/franquiciado-pos";
import type { ResumenReinicioInventario } from "@/lib/reiniciar-inventario-admin";

export type ReiniciarInventarioResult =
  | {
      ok: true;
      resumen: ResumenReinicioInventario;
      correoEnviado: boolean;
      correoDestino: string | null;
      avisoCorreo?: string;
    }
  | { ok: false; message: string };

export async function reiniciarInventarioPuntoVenta(puntoVenta: string): Promise<ReiniciarInventarioResult> {
  const pv = puntoVenta.trim();
  if (!pv) return { ok: false, message: "No hay punto de venta." };

  const user = auth?.currentUser;
  if (!user) return { ok: false, message: "Sesión expirada. Volvé a iniciar sesión." };

  const token = await user.getIdToken();
  let correoFranquiciado: string | undefined;
  try {
    const franq = await getFranquiciadoPorPuntoVenta(pv, token);
    const mail = emailDesdeFichaFranquiciado(franq.franquiciado ?? null);
    if (mail) correoFranquiciado = mail;
  } catch {
    /* WMS opcional */
  }

  const res = await fetch("/api/pos_reiniciar_inventario", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      puntoVenta: pv,
      ...(correoFranquiciado ? { correoFranquiciado } : {}),
    }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    message?: string;
    resumen?: ResumenReinicioInventario;
    correoEnviado?: boolean;
    correoDestino?: string | null;
    avisoCorreo?: string;
  };

  if (!res.ok || !data.ok) {
    return {
      ok: false,
      message: data.message ?? "No se pudo reiniciar el inventario.",
    };
  }

  return {
    ok: true,
    resumen: data.resumen ?? { legacyAjustados: 0, ensambleEnCero: 0, yaEnCero: 0 },
    correoEnviado: data.correoEnviado === true,
    correoDestino: data.correoDestino ?? null,
    ...(data.avisoCorreo ? { avisoCorreo: data.avisoCorreo } : {}),
  };
}
