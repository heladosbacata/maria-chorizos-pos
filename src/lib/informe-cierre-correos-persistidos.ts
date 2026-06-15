const LS_LEGACY_CC = "pos_mc_informe_turno_cc_v1";

export type CorreosInformeCierrePersistidos = {
  /** Correos agregados por el cajero para copia opcional en cada cierre. */
  emails: string[];
  /** Subconjunto que recibirá el informe en el próximo cierre (ids = correo en minúsculas). */
  seleccionados: string[];
};

export function emailValidoInformeCierre(s: string): boolean {
  const t = s.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

function normPv(puntoVenta: string): string {
  return puntoVenta.trim().toLowerCase() || "global";
}

function storageKey(puntoVenta: string): string {
  return `pos_mc_informe_turno_correos_v2:${normPv(puntoVenta)}`;
}

function normEmail(e: string): string {
  return e.trim().toLowerCase();
}

function dedupeEmails(emails: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of emails) {
    const e = raw.trim();
    if (!e || !emailValidoInformeCierre(e)) continue;
    const k = normEmail(e);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return out;
}

function normalizarPersistidos(raw: unknown): CorreosInformeCierrePersistidos {
  if (!raw || typeof raw !== "object") {
    return { emails: [], seleccionados: [] };
  }
  const o = raw as Record<string, unknown>;
  const emails = dedupeEmails(Array.isArray(o.emails) ? o.emails.map(String) : []);
  const selRaw = Array.isArray(o.seleccionados) ? o.seleccionados.map((x) => normEmail(String(x))) : [];
  const emailSet = new Set(emails.map(normEmail));
  const seleccionados = selRaw.filter((k) => emailSet.has(k));
  const seleccionadosFinal =
    seleccionados.length > 0 ? seleccionados : emails.map(normEmail);
  return { emails, seleccionados: seleccionadosFinal };
}

function parsearCorreosDesdeTextoCc(cc: string): string[] {
  return dedupeEmails(cc.split(/[,;]/).map((x) => x.trim()));
}

export function cargarCorreosInformeCierrePersistidos(puntoVenta: string): CorreosInformeCierrePersistidos {
  if (typeof window === "undefined") {
    return { emails: [], seleccionados: [] };
  }
  try {
    const key = storageKey(puntoVenta);
    const raw = localStorage.getItem(key);
    if (raw) {
      return normalizarPersistidos(JSON.parse(raw) as unknown);
    }
    const legacy = localStorage.getItem(LS_LEGACY_CC)?.trim();
    if (legacy) {
      const emails = parsearCorreosDesdeTextoCc(legacy);
      if (emails.length > 0) {
        const migrado: CorreosInformeCierrePersistidos = {
          emails,
          seleccionados: emails.map(normEmail),
        };
        guardarCorreosInformeCierrePersistidos(puntoVenta, migrado);
        return migrado;
      }
    }
  } catch {
    /* ignore */
  }
  return { emails: [], seleccionados: [] };
}

export function guardarCorreosInformeCierrePersistidos(
  puntoVenta: string,
  data: CorreosInformeCierrePersistidos
): void {
  if (typeof window === "undefined") return;
  const emails = dedupeEmails(data.emails);
  const emailKeys = new Set(emails.map(normEmail));
  const seleccionados = data.seleccionados
    .map(normEmail)
    .filter((k) => emailKeys.has(k));
  const payload: CorreosInformeCierrePersistidos = {
    emails,
    seleccionados: seleccionados.length > 0 ? seleccionados : emails.map(normEmail),
  };
  try {
    localStorage.setItem(storageKey(puntoVenta), JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function correosInformeSeleccionadosParaEnvio(data: CorreosInformeCierrePersistidos): string[] {
  const emails = dedupeEmails(data.emails);
  const sel = new Set(data.seleccionados.map(normEmail));
  return emails.filter((e) => sel.has(normEmail(e)));
}

export function agregarCorreoInformeCierre(
  data: CorreosInformeCierrePersistidos,
  email: string
): { ok: true; data: CorreosInformeCierrePersistidos } | { ok: false; message: string } {
  const e = email.trim();
  if (!emailValidoInformeCierre(e)) {
    return { ok: false, message: "Ingresá un correo válido." };
  }
  const k = normEmail(e);
  if (data.emails.some((x) => normEmail(x) === k)) {
    return { ok: false, message: "Ese correo ya está en la lista." };
  }
  const emails = [...data.emails, e];
  const seleccionados = [...data.seleccionados, k];
  return { ok: true, data: { emails, seleccionados } };
}

export function quitarCorreoInformeCierre(
  data: CorreosInformeCierrePersistidos,
  email: string
): CorreosInformeCierrePersistidos {
  const k = normEmail(email);
  return {
    emails: data.emails.filter((x) => normEmail(x) !== k),
    seleccionados: data.seleccionados.filter((x) => x !== k),
  };
}

export function alternarSeleccionCorreoInforme(
  data: CorreosInformeCierrePersistidos,
  email: string,
  seleccionado: boolean
): CorreosInformeCierrePersistidos {
  const k = normEmail(email);
  const sel = new Set(data.seleccionados);
  if (seleccionado) sel.add(k);
  else sel.delete(k);
  return { ...data, seleccionados: Array.from(sel) };
}
