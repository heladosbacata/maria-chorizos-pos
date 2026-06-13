import type { App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { parseCumpleCorto } from "@/lib/liga-cumpleanos-colombia";

const COL_TURNO_ACTIVO = "pos_turno_activo";
const COL_CAJEROS = "posCajerosTurno";
const COL_IDENTIFICADO = "pos_cajero_identificado";
const CAJERO_SESION = "__sesion_pos__";

const MESES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"] as const;

type CajeroCat = {
  fotoUrl: string;
  nombreDisplay: string;
  cumpleCorto: string;
  fechaNacimiento: string;
};

function cumpleCortoDesdeFecha(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  const corto = parseCumpleCorto(t);
  if (corto) {
    const mes = MESES_CORTO[corto.mes - 1] ?? "";
    return mes ? `${corto.dia} ${mes}` : "";
  }
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  const mes = MESES_CORTO[Number(m[2]) - 1] ?? "";
  return mes ? `${Number(m[3])} ${mes}` : "";
}

function strField(row: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function cajeroIdValido(id: string): boolean {
  return Boolean(id.trim()) && id.trim() !== CAJERO_SESION;
}

async function mapaCajerosPorIds(app: App, ids: string[]): Promise<Map<string, CajeroCat>> {
  const db = getFirestore(app);
  const unicos = Array.from(new Set(ids.filter(cajeroIdValido)));
  const out = new Map<string, CajeroCat>();
  for (let i = 0; i < unicos.length; i += 10) {
    const chunk = unicos.slice(i, i + 10);
    const refs = chunk.map((id) => db.collection(COL_CAJEROS).doc(id));
    const snaps = await db.getAll(...refs);
    for (const snap of snaps) {
      if (!snap.exists) continue;
      const raw = snap.data() as { ficha?: Record<string, unknown> };
      const ficha = raw.ficha ?? {};
      const nombres = String(ficha.nombres ?? "").trim();
      const apellidos = String(ficha.apellidos ?? "").trim();
      const nombreDisplay = `${nombres} ${apellidos}`.trim();
      const fechaNacimiento = String(ficha.fechaNacimiento ?? "").trim();
      out.set(snap.id, {
        fotoUrl: String(ficha.fotoUrl ?? "").trim(),
        nombreDisplay,
        cumpleCorto: cumpleCortoDesdeFecha(fechaNacimiento),
        fechaNacimiento,
      });
    }
  }
  return out;
}

/** Completa fotos/nombres/cumpleaños del ranking leyendo pos_turno_activo + posCajerosTurno. */
export async function enriquecerRankingLigaConFotos(
  app: App,
  rankingRaw: unknown[]
): Promise<unknown[]> {
  if (!rankingRaw.length) return rankingRaw;

  const db = getFirestore(app);
  const rows = rankingRaw.filter((r): r is Record<string, unknown> => Boolean(r && typeof r === "object"));
  const uids = Array.from(new Set(rows.map((r) => strField(r, "uid")).filter(Boolean)));

  const turnoPorUid = new Map<string, { cajeroTurnoId: string; cajeroNombre: string }>();
  for (let i = 0; i < uids.length; i += 10) {
    const chunk = uids.slice(i, i + 10);
    const refs = chunk.map((uid) => db.collection(COL_TURNO_ACTIVO).doc(uid));
    const snaps = await db.getAll(...refs);
    for (const snap of snaps) {
      if (!snap.exists) continue;
      const x = snap.data() as { cajeroTurnoId?: string; cajeroNombre?: string };
      const id = String(x.cajeroTurnoId ?? "").trim();
      if (cajeroIdValido(id)) {
        turnoPorUid.set(snap.id, {
          cajeroTurnoId: id,
          cajeroNombre: String(x.cajeroNombre ?? "").trim(),
        });
      }
    }
  }

  const identPorUid = new Map<string, { cajeroTurnoId: string; cajeroNombre: string }>();
  for (let i = 0; i < uids.length; i += 10) {
    const chunk = uids.slice(i, i + 10);
    const refs = chunk.map((uid) => db.collection(COL_IDENTIFICADO).doc(uid));
    const snaps = await db.getAll(...refs);
    for (const snap of snaps) {
      if (!snap.exists) continue;
      const x = snap.data() as { cajeroTurnoId?: string; cajeroNombre?: string; cajeroDocumento?: string };
      const id = String(x.cajeroTurnoId ?? "").trim();
      if (!cajeroIdValido(id) || !String(x.cajeroDocumento ?? "").trim()) continue;
      identPorUid.set(snap.id, {
        cajeroTurnoId: id,
        cajeroNombre: String(x.cajeroNombre ?? "").trim(),
      });
    }
  }

  const idsCajero: string[] = [];
  for (const row of rows) {
    const uid = strField(row, "uid");
    const directo = strField(row, "cajeroTurnoId", "cajeroId", "cajero_id");
    if (cajeroIdValido(directo)) idsCajero.push(directo);
    const turno = uid ? turnoPorUid.get(uid) : undefined;
    if (turno?.cajeroTurnoId) idsCajero.push(turno.cajeroTurnoId);
    const ident = uid ? identPorUid.get(uid) : undefined;
    if (ident?.cajeroTurnoId) idsCajero.push(ident.cajeroTurnoId);
  }

  const mapaCajeros = await mapaCajerosPorIds(app, idsCajero);

  return rows.map((row) => {
    const uid = strField(row, "uid");
    const turno = uid ? turnoPorUid.get(uid) : undefined;
    const ident = uid ? identPorUid.get(uid) : undefined;

    let cajeroTurnoId = strField(row, "cajeroTurnoId", "cajeroId", "cajero_id");
    if (!cajeroIdValido(cajeroTurnoId)) {
      cajeroTurnoId = turno?.cajeroTurnoId || ident?.cajeroTurnoId || "";
    }

    const cat = cajeroTurnoId ? mapaCajeros.get(cajeroTurnoId) : undefined;
    const out: Record<string, unknown> = { ...row };

    if (cajeroTurnoId) out.cajeroTurnoId = cajeroTurnoId;

    const fotoActual = strField(out, "cajeroFotoUrl", "cajero_foto_url", "fotoUrl");
    if (!fotoActual && cat?.fotoUrl) out.cajeroFotoUrl = cat.fotoUrl;

    const nombreActual = strField(out, "cajeroNombre", "nombreCajero");
    if (!nombreActual) {
      const nombre =
        cat?.nombreDisplay || turno?.cajeroNombre || ident?.cajeroNombre || "";
      if (nombre) out.cajeroNombre = nombre;
    }

    const cumpleActual = strField(out, "cajeroCumpleanosCorto", "cajero_cumpleanos_corto");
    if (!cumpleActual && cat?.cumpleCorto) out.cajeroCumpleanosCorto = cat.cumpleCorto;

    const fechaActual = strField(out, "cajeroFechaNacimiento", "fechaNacimiento");
    if (!fechaActual && cat?.fechaNacimiento) out.cajeroFechaNacimiento = cat.fechaNacimiento;

    return out;
  });
}
