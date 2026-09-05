/**
 * Sync Índice de satisfacción al Franquiciado ↔ API Firestore (Admin).
 * Local sigue siendo caché / offline.
 *
 * Enlace futuro WMS: áreas con estrellas ≤3 llevan `respuestaWms` + `seguimientoWmsAreaIds`
 * / `seguimientoWmsPendiente` en Firestore para que administración responda desde el WMS.
 */

import {
  normalizarRegistroMes,
  type AreasCalificacionMap,
  type IndiceSatisfaccionMes,
} from "@/lib/indice-satisfaccion-franquiciado";
import { puntoVentaFirestoreClave } from "@/lib/pos-domicilios-pv-clave";
import {
  fusionarMesesIndiceLocal,
  leerIndiceSatisfaccionMes,
  listarMesesIndiceSatisfaccion,
  persistirIndiceSatisfaccionMesLocal,
  preferirRegistroMasReciente,
} from "@/lib/indice-satisfaccion-franquiciado-storage";

export const COL_INDICE_SATISFACCION = "pos_indice_satisfaccion_franquiciado";

export function puntoVentaClaveIndice(puntoVenta: string): string {
  return puntoVentaFirestoreClave(puntoVenta) || "sin_pv";
}

export function docIdIndiceSatisfaccion(puntoVenta: string, ym: string): string {
  return `${puntoVentaClaveIndice(puntoVenta)}__${ym.trim()}`;
}

export type SyncIndiceResult = {
  ok: boolean;
  registro: IndiceSatisfaccionMes;
  fuente: "nube" | "local" | "ambos";
  message?: string;
};

export async function guardarIndiceSatisfaccionCloud(opts: {
  token: string;
  puntoVenta: string;
  ym: string;
  areas: AreasCalificacionMap;
}): Promise<{ ok: boolean; registro?: IndiceSatisfaccionMes; message?: string }> {
  const token = opts.token.trim();
  const puntoVenta = opts.puntoVenta.trim();
  const ym = opts.ym.trim();
  if (!token || !puntoVenta || !ym) {
    return { ok: false, message: "Falta token, punto de venta o mes." };
  }
  try {
    const res = await fetch("/api/pos_indice_satisfaccion", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ puntoVenta, ym, areas: opts.areas }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      message?: string;
      registro?: unknown;
    };
    if (!res.ok || json.ok !== true) {
      return {
        ok: false,
        message: typeof json.message === "string" ? json.message : `Error ${res.status}`,
      };
    }
    const registro = normalizarRegistroMes(ym, json.registro);
    return { ok: true, registro };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Error de red" };
  }
}

export async function leerIndiceSatisfaccionCloud(opts: {
  token: string;
  puntoVenta: string;
  ym: string;
}): Promise<{ ok: boolean; registro: IndiceSatisfaccionMes | null; message?: string }> {
  const token = opts.token.trim();
  const puntoVenta = opts.puntoVenta.trim();
  const ym = opts.ym.trim();
  if (!token || !puntoVenta || !ym) {
    return { ok: false, registro: null, message: "Falta token, punto de venta o mes." };
  }
  try {
    const qs = new URLSearchParams({ puntoVenta, ym });
    const res = await fetch(`/api/pos_indice_satisfaccion?${qs}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      message?: string;
      registro?: unknown | null;
    };
    if (!res.ok || json.ok !== true) {
      return {
        ok: false,
        registro: null,
        message: typeof json.message === "string" ? json.message : `Error ${res.status}`,
      };
    }
    if (!json.registro) return { ok: true, registro: null };
    return { ok: true, registro: normalizarRegistroMes(ym, json.registro) };
  } catch (e) {
    return {
      ok: false,
      registro: null,
      message: e instanceof Error ? e.message : "Error de red",
    };
  }
}

export async function listarIndiceSatisfaccionAnioCloud(opts: {
  token: string;
  puntoVenta: string;
  anio: number;
}): Promise<{ ok: boolean; registros: IndiceSatisfaccionMes[]; message?: string }> {
  const token = opts.token.trim();
  const puntoVenta = opts.puntoVenta.trim();
  if (!token || !puntoVenta || !Number.isFinite(opts.anio)) {
    return { ok: false, registros: [], message: "Falta token, punto de venta o año." };
  }
  try {
    const qs = new URLSearchParams({ puntoVenta, anio: String(opts.anio) });
    const res = await fetch(`/api/pos_indice_satisfaccion?${qs}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      message?: string;
      registros?: unknown[];
    };
    if (!res.ok || json.ok !== true) {
      return {
        ok: false,
        registros: [],
        message: typeof json.message === "string" ? json.message : `Error ${res.status}`,
      };
    }
    const regs = Array.isArray(json.registros)
      ? json.registros.map((r) => {
          const o = r && typeof r === "object" ? (r as { ym?: string }) : {};
          const ym = typeof o.ym === "string" ? o.ym : "";
          return normalizarRegistroMes(ym, r);
        }).filter((r) => r.guardadoAt && /^\d{4}-\d{2}$/.test(r.ym))
      : [];
    return { ok: true, registros: regs };
  } catch (e) {
    return {
      ok: false,
      registros: [],
      message: e instanceof Error ? e.message : "Error de red",
    };
  }
}

/** Guarda local + intenta nube. Si la nube falla, el local queda igual. */
export async function guardarIndiceSatisfaccionConSync(opts: {
  token: string | null;
  puntoVenta: string;
  ym: string;
  areas: AreasCalificacionMap;
  guardarLocal: (pv: string, ym: string, areas: AreasCalificacionMap) => IndiceSatisfaccionMes;
}): Promise<SyncIndiceResult> {
  const local = opts.guardarLocal(opts.puntoVenta, opts.ym, opts.areas);
  if (!opts.token?.trim()) {
    return { ok: true, registro: local, fuente: "local", message: "Sin sesión: quedó solo en este equipo." };
  }
  const cloud = await guardarIndiceSatisfaccionCloud({
    token: opts.token,
    puntoVenta: opts.puntoVenta,
    ym: opts.ym,
    areas: opts.areas,
  });
  if (cloud.ok && cloud.registro?.guardadoAt) {
    persistirIndiceSatisfaccionMesLocal(opts.puntoVenta, cloud.registro);
    return { ok: true, registro: cloud.registro, fuente: "ambos" };
  }
  return {
    ok: true,
    registro: local,
    fuente: "local",
    message: cloud.message
      ? `Guardado en este equipo. No se pudo sincronizar a la nube: ${cloud.message}`
      : "Guardado en este equipo. No se pudo sincronizar a la nube.",
  };
}

/** Carga mes: merge local ↔ nube (gana el más reciente) y refresca caché local. */
export async function cargarIndiceSatisfaccionMesConSync(opts: {
  token: string | null;
  puntoVenta: string;
  ym: string;
}): Promise<SyncIndiceResult> {
  const local = leerIndiceSatisfaccionMes(opts.puntoVenta, opts.ym);
  if (!opts.token?.trim()) {
    return {
      ok: true,
      registro: local.guardadoAt ? local : local,
      fuente: "local",
    };
  }
  const cloud = await leerIndiceSatisfaccionCloud({
    token: opts.token,
    puntoVenta: opts.puntoVenta,
    ym: opts.ym,
  });
  if (!cloud.ok) {
    return {
      ok: true,
      registro: local,
      fuente: "local",
    };
  }
  const preferido = preferirRegistroMasReciente(local, cloud.registro);
  if (preferido?.guardadoAt) {
    persistirIndiceSatisfaccionMesLocal(opts.puntoVenta, preferido);
    // Si solo estaba en local, subir a la nube en segundo plano (best-effort).
    if (local.guardadoAt && !cloud.registro?.guardadoAt && opts.token?.trim()) {
      void guardarIndiceSatisfaccionCloud({
        token: opts.token,
        puntoVenta: opts.puntoVenta,
        ym: opts.ym,
        areas: local.areas,
      }).then((up) => {
        if (up.ok && up.registro?.guardadoAt) {
          persistirIndiceSatisfaccionMesLocal(opts.puntoVenta, up.registro);
        }
      });
    }
    return {
      ok: true,
      registro: preferido,
      fuente: cloud.registro?.guardadoAt && local.guardadoAt ? "ambos" : cloud.registro?.guardadoAt ? "nube" : "local",
    };
  }
  return { ok: true, registro: local, fuente: "local" };
}

/** Lista año: trae nube, fusiona índice local y cachea cada registro. */
export async function cargarIndiceSatisfaccionAnioConSync(opts: {
  token: string | null;
  puntoVenta: string;
  anio: number;
}): Promise<{
  ok: boolean;
  yms: string[];
  porYm: Record<string, IndiceSatisfaccionMes>;
  message?: string;
}> {
  const pv = opts.puntoVenta.trim();
  const porYm: Record<string, IndiceSatisfaccionMes> = {};
  let yms = listarMesesIndiceSatisfaccion(pv).filter((y) => y.startsWith(`${opts.anio}-`));

  for (const ym of yms) {
    const loc = leerIndiceSatisfaccionMes(pv, ym);
    if (loc.guardadoAt) porYm[ym] = loc;
  }

  if (!opts.token?.trim()) {
    return { ok: true, yms: Object.keys(porYm).sort(), porYm };
  }

  const cloud = await listarIndiceSatisfaccionAnioCloud({
    token: opts.token,
    puntoVenta: pv,
    anio: opts.anio,
  });

  if (!cloud.ok) {
    return {
      ok: true,
      yms: Object.keys(porYm).sort(),
      porYm,
      message: cloud.message,
    };
  }

  for (const reg of cloud.registros) {
    const prev = porYm[reg.ym] ?? leerIndiceSatisfaccionMes(pv, reg.ym);
    const preferido = preferirRegistroMasReciente(prev, reg);
    if (preferido?.guardadoAt) {
      porYm[preferido.ym] = preferido;
      persistirIndiceSatisfaccionMesLocal(pv, preferido);
    }
  }

  yms = fusionarMesesIndiceLocal(
    pv,
    cloud.registros.map((r) => r.ym)
  ).filter((y) => y.startsWith(`${opts.anio}-`));

  return { ok: true, yms, porYm };
}
