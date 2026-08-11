import type { MediosPagoVentaGuardados } from "@/lib/medios-pago-venta";
import type { LineaVentaGuardada, VentaGuardadaLocal } from "@/lib/pos-ventas-local-storage";

/** Cuerpo para POST `/api/pos_venta_cloud` (copia de la venta en el navegador). */
export type PosVentaCloudBody = {
  ventaLocalId: string;
  fechaYmd: string;
  isoTimestamp: string;
  puntoVenta: string;
  total: number;
  lineas: LineaVentaGuardada[];
  turnoSesionId?: string;
  cajeroTurnoId?: string;
  cajeroNombre?: string;
  pagoResumen?: string;
  mediosPago?: MediosPagoVentaGuardados;
  /** `true` si el WMS aceptó el reporte; `false` si quedó solo POS / red. */
  wmsSincronizado: boolean;
  /** Venta operativa de $0 por premio Club de Millas, no venta monetaria. */
  esCanjeClubMillas?: boolean;
  tipoComprobanteAlCobro?: "factura_electronica" | "documento_interno";
  facturaElectronicaNumero?: string;
  facturaElectronicaCufe?: string;
  facturaElectronicaEnviadoAt?: string;
  clienteNombreVenta?: string;
  clienteNitVenta?: string;
  clienteEmailVenta?: string;
  comprobanteEmailEnviadoAt?: string;
  comprobanteEmailDestino?: string;
};

function ventaTieneWmsPendiente(v: VentaGuardadaLocal): boolean {
  return /pendiente\s+de\s+env[ií]o\s+por\s+internet/i.test(v.pagoResumen ?? "");
}

function bodyDesdeVentaLocal(v: VentaGuardadaLocal): PosVentaCloudBody {
  return {
    ventaLocalId: v.id,
    fechaYmd: v.fechaYmd,
    isoTimestamp: v.isoTimestamp,
    puntoVenta: v.puntoVenta,
    total: v.total,
    lineas: v.lineas,
    ...(v.turnoSesionId ? { turnoSesionId: v.turnoSesionId } : {}),
    ...(v.cajeroTurnoId ? { cajeroTurnoId: v.cajeroTurnoId } : {}),
    ...(v.cajeroNombre ? { cajeroNombre: v.cajeroNombre } : {}),
    ...(v.pagoResumen ? { pagoResumen: v.pagoResumen } : {}),
    ...(v.mediosPago ? { mediosPago: v.mediosPago } : {}),
    wmsSincronizado: !ventaTieneWmsPendiente(v),
    ...(v.tipoComprobanteAlCobro ? { tipoComprobanteAlCobro: v.tipoComprobanteAlCobro } : {}),
    ...(v.facturaElectronicaNumero ? { facturaElectronicaNumero: v.facturaElectronicaNumero } : {}),
    ...(v.facturaElectronicaCufe ? { facturaElectronicaCufe: v.facturaElectronicaCufe } : {}),
    ...(v.facturaElectronicaEnviadoAt ? { facturaElectronicaEnviadoAt: v.facturaElectronicaEnviadoAt } : {}),
    ...(v.clienteNombreVenta ? { clienteNombreVenta: v.clienteNombreVenta } : {}),
    ...(v.clienteNitVenta ? { clienteNitVenta: v.clienteNitVenta } : {}),
    ...(v.clienteEmailVenta ? { clienteEmailVenta: v.clienteEmailVenta } : {}),
    ...(v.comprobanteEmailEnviadoAt ? { comprobanteEmailEnviadoAt: v.comprobanteEmailEnviadoAt } : {}),
    ...(v.comprobanteEmailDestino ? { comprobanteEmailDestino: v.comprobanteEmailDestino } : {}),
  };
}

export async function registrarVentaPosCloud(
  idToken: string,
  body: PosVentaCloudBody
): Promise<{ ok: boolean; message?: string }> {
  const r = await fetch("/api/pos_venta_cloud", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(body),
  });
  const data = (await r.json().catch(() => ({}))) as { ok?: boolean; message?: string };
  if (!r.ok || !data.ok) {
    return { ok: false, message: data.message ?? `Error ${r.status}` };
  }
  return { ok: true };
}

/** Tras emitir FE: actualiza CUFE/número en Firestore (mismo doc que POST inicial). */
export async function actualizarFeVentaPosCloud(
  idToken: string,
  body: {
    ventaLocalId: string;
    facturaElectronicaNumero?: string;
    facturaElectronicaCufe?: string;
    facturaElectronicaEnviadoAt?: string;
  }
): Promise<{ ok: boolean; message?: string }> {
  const r = await fetch("/api/pos_venta_cloud", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ intent: "actualizar_fe", ...body }),
  });
  const data = (await r.json().catch(() => ({}))) as { ok?: boolean; message?: string };
  if (!r.ok || !data.ok) {
    return { ok: false, message: data.message ?? `Error ${r.status}` };
  }
  return { ok: true };
}

export async function anularVentaPosCloud(
  idToken: string,
  body: { ventaLocalId: string; motivo: string; anuladaEnIso: string }
): Promise<{ ok: boolean; message?: string }> {
  const r = await fetch("/api/pos_venta_cloud", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(body),
  });
  const data = (await r.json().catch(() => ({}))) as { ok?: boolean; message?: string };
  if (!r.ok || !data.ok) {
    return { ok: false, message: data.message ?? `Error ${r.status}` };
  }
  return { ok: true };
}

export async function listarVentasPosCloud(
  idToken: string,
  filtros?: { desde?: string; hasta?: string }
): Promise<VentaGuardadaLocal[]> {
  const params = new URLSearchParams();
  if (filtros?.desde) params.set("desde", filtros.desde);
  if (filtros?.hasta) params.set("hasta", filtros.hasta);
  const qs = params.toString();
  const r = await fetch(`/api/pos_ventas_cloud${qs ? `?${qs}` : ""}`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const data = (await r.json().catch(() => ({}))) as {
    ok?: boolean;
    ventas?: unknown;
    message?: string;
  };
  if (!r.ok || !data.ok || !Array.isArray(data.ventas)) {
    throw new Error(data.message ?? `Error ${r.status}`);
  }
  return data.ventas as VentaGuardadaLocal[];
}

export async function registrarVentaLocalPosCloud(
  idToken: string,
  venta: VentaGuardadaLocal
): Promise<{ ok: boolean; message?: string }> {
  const registrada = await registrarVentaPosCloud(idToken, bodyDesdeVentaLocal(venta));
  if (!registrada.ok) return registrada;

  if (venta.anulada) {
    const anulada = await anularVentaPosCloud(idToken, {
      ventaLocalId: venta.id,
      motivo: venta.anuladaMotivo?.trim() || "Venta anulada localmente",
      anuladaEnIso: venta.anuladaEnIso?.trim() || new Date().toISOString(),
    });
    if (!anulada.ok) return anulada;
  }

  return { ok: true };
}
