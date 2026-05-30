/**
 * Contrato POS ↔ WMS: lo que imprime el QR debe ser legible por normalizarQrCodeParaAcumular (Mi plan).
 * Réplica mínima de clubMillasPosTicket.ts del WMS (sin importar el otro repo).
 */
import { describe, expect, it } from "vitest";
import {
  PREFIJO_TICKET_CLUB_MILLAS,
  construirUrlPortalClubMillasConCodigo,
  contenidoQrEscaneableClubMillasDesdeTicket,
  elegirContenidoQrTirillaClubMillas,
  extraerCodigoQrClubDesdeTextoLeido,
  generarQrTirillaClubMillas,
} from "@/lib/fidelizacion-qr";

const TOKEN = "BACATA-CLUB-V1-a1b2c3d4e5f6789012345678abcdef01";
const DOC = "1234567890";
const CODIGO_CORTO = "AB3K9M";

const CLUB_POS_QR_PREFIX = "BACATA-CLUB-V1-";
const CHARSET_CODIGO_CORTO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function esCodigoCortoWms(raw: string): boolean {
  const s = String(raw ?? "").replace(/\s+/g, "").trim().toUpperCase();
  if (s.length !== 6) return false;
  for (let i = 0; i < s.length; i++) {
    if (!CHARSET_CODIGO_CORTO.includes(s.charAt(i))) return false;
  }
  return true;
}

/** Réplica de normalizarQrCodeParaAcumular (WMS). */
function normalizarQrCodeParaAcumularWms(raw: string): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";

  const compacto = s.replace(/\s+/g, "").toUpperCase();
  if (esCodigoCortoWms(compacto)) return compacto;

  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      const c = u.searchParams.get("c")?.trim();
      if (c) return c;
      const pathMatch = u.pathname.match(/BACATA-CLUB-V1-[a-f0-9]{32}/i);
      if (pathMatch) return pathMatch[0]!;
    } catch {
      /* ignore */
    }
  }

  const idx = s.toUpperCase().indexOf(CLUB_POS_QR_PREFIX.toUpperCase());
  if (idx >= 0) {
    const slice = s.slice(idx).replace(/\s+/g, "");
    const re = new RegExp(
      `^${CLUB_POS_QR_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[a-f0-9]{32}$`,
      "i"
    );
    if (re.test(slice)) return slice;
  }

  return s;
}

function parseTokenTicketPosDesdeQrWms(qrRaw: string): string | null {
  const s = normalizarQrCodeParaAcumularWms(qrRaw);
  if (!s) return null;
  const needle = CLUB_POS_QR_PREFIX;
  const upper = s.toUpperCase();
  const idx = upper.indexOf(needle.toUpperCase());
  const candidato =
    idx >= 0 ? s.slice(idx, idx + needle.length + 32).replace(/\s+/g, "") : s.replace(/\s+/g, "");
  const re = new RegExp(`^${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([a-f0-9]{32})$`, "i");
  const m = candidato.match(re);
  return m ? m[1]!.toLowerCase() : null;
}

describe("compatibilidad POS QR con escáner WMS (Mi plan)", () => {
  it("URL del QR (mismo que tirilla) normaliza a token BACATA para acumular", () => {
    const qrUrl = construirUrlPortalClubMillasConCodigo(TOKEN, DOC);
    const contenidoQr = elegirContenidoQrTirillaClubMillas(TOKEN, qrUrl, DOC, CODIGO_CORTO);
    expect(contenidoQr).toBe(qrUrl);

    const norm = normalizarQrCodeParaAcumularWms(contenidoQr);
    expect(norm).toBe(TOKEN);
    expect(parseTokenTicketPosDesdeQrWms(contenidoQr)).toBe("a1b2c3d4e5f6789012345678abcdef01");
  });

  it("escaneo con cámara y escaneo en Mi plan leen el mismo contenido", async () => {
    const qrUrl = `https://maria-chorizos-wms.vercel.app/club-de-millas?c=${encodeURIComponent(TOKEN)}&documento=${DOC}`;
    const { contenidoImpreso, dataUrl } = await generarQrTirillaClubMillas(TOKEN, qrUrl, DOC, CODIGO_CORTO);
    expect(contenidoImpreso).toBe(qrUrl);
    expect(dataUrl).toMatch(/^data:image\/png;base64,/);

    const desdeTicket = contenidoQrEscaneableClubMillasDesdeTicket({
      fidelizacionPayloadTexto: contenidoImpreso,
      clubMillasCodigoCorto: CODIGO_CORTO,
    });
    expect(desdeTicket).toBe(qrUrl);

    expect(extraerCodigoQrClubDesdeTextoLeido(contenidoImpreso)).toBe(TOKEN);
    expect(normalizarQrCodeParaAcumularWms(contenidoImpreso)).toBe(TOKEN);
  });

  it("código de 6 letras (respaldo manual) no reemplaza URL en el QR", () => {
    const qrUrl = construirUrlPortalClubMillasConCodigo(TOKEN, DOC);
    expect(elegirContenidoQrTirillaClubMillas(TOKEN, qrUrl, DOC, CODIGO_CORTO)).toBe(qrUrl);
    expect(normalizarQrCodeParaAcumularWms(CODIGO_CORTO)).toBe(CODIGO_CORTO);
  });
});
