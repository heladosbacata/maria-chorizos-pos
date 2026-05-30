import { LOGO_ORG_URL, MARIA_CHORIZOS_IG_HANDLE } from "@/lib/brand";
import {
  INVITACION_CLUB_TIRILLA_CUERPO,
  INVITACION_CLUB_TIRILLA_LLAMADO,
  INVITACION_CLUB_TIRILLA_TITULO,
} from "@/lib/club-millas-invitacion-ticket";
import {
  MENSAJE_TIRILLA_CLUB_CODIGO_LABEL,
  MENSAJE_TIRILLA_CLUB_FRECUENTE_PASO1,
  MENSAJE_TIRILLA_CLUB_FRECUENTE_PASO2,
  MENSAJE_TIRILLA_CLUB_FRECUENTE_TITULO,
  contenidoQrEscaneableClubMillasDesdeTicket,
  esCodigoCortoTirillaClubMillas,
} from "@/lib/fidelizacion-qr";
import {
  MENSAJE_TIRILLA_CLUB_CONSULTA_PASO,
  MENSAJE_TIRILLA_CLUB_GANADAS_LABEL,
  MENSAJE_TIRILLA_CLUB_SALDO_LABEL,
  MENSAJE_TIRILLA_CLUB_SALDO_TITULO,
  MENSAJE_TIRILLA_CLUB_ACUMULADO_AUTO,
} from "@/lib/club-millas-consulta-url";
import {
  esAvisoErrorClubMillasEnTicket,
  ticketTieneQrAcumulacionClubMillas,
  ticketTieneSaldoClubMillasEnTirilla,
} from "@/lib/club-millas-invitacion-ticket";
import {
  MENSAJE_DOMICILIOS_TIRILLA_LINEA1,
  MENSAJE_DOMICILIOS_TIRILLA_LINEA2,
} from "@/lib/domicilios-qr-ticket";
import { fechaHoraColombia } from "@/lib/fecha-colombia";
import { loadImpresionPrefs } from "@/lib/impresion-pos-storage";
import type { ImpresionPosPrefs, TamanoPapelTicket, TicketVentaPayload } from "@/types/impresion-pos";

/** Ancho en caracteres monoespaciados según rollo (58 mm ≈ 32 cols en térmicas típicas). */
export function columnasTicketPorTamanoPapel(tam: TamanoPapelTicket): number {
  if (tam === "58mm") return 32;
  if (tam === "80mm") return 42;
  return 48;
}

/**
 * Texto seguro para ESC/POS / CP437: quita acentos y sustituye símbolos problemáticos
 * (evita "?" por puntos medios o viñetas).
 */
export function textoTicketSeguro(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ñ/g, "n")
    .replace(/Ñ/g, "N")
    .replace(/\u00B7/g, " - ")
    .replace(/\u2022/g, "* ")
    .replace(/\u2013|\u2014/g, "-")
    .replace(/[^\x20-\x7E\n\r]/g, "");
}

export type OpcionesTextoTicketPlano = {
  /**
   * En impresión térmica directa (QZ) el QR va por comandos ESC/POS; no hace falta volcar el JSON en líneas de texto.
   */
  omitirBloqueFidelizacionTexto?: boolean;
  /** En QZ el saldo + QR consulta van por ESC/POS; evita duplicar en texto plano. */
  omitirBloqueClubSaldoTexto?: boolean;
  /** En QZ el bloque domicilios va por ESC/POS al inicio; evita duplicar el mensaje en texto plano. */
  omitirBloqueDomiciliosTexto?: boolean;
  /** En QZ el bloque invitacion club va por ESC/POS al final; evita duplicar en texto plano. */
  omitirBloqueInvitacionClubTexto?: boolean;
};

export function construirTextoTicketPlano(
  payload: TicketVentaPayload,
  columnas: number = 42,
  opciones?: OpcionesTextoTicketPlano
): string {
  const W = columnas;
  const line = (s: string) => textoTicketSeguro(s).slice(0, W).padEnd(W);
  const center = (s: string) => {
    const t = textoTicketSeguro(s).slice(0, W);
    const pad = Math.max(0, Math.floor((W - t.length) / 2));
    return " ".repeat(pad) + t;
  };
  const rows: string[] = [];
  if (
    !opciones?.omitirBloqueDomiciliosTexto &&
    (payload.domiciliosLandingUrl?.trim() || payload.domiciliosQrDataUrl?.trim())
  ) {
    rows.push(center(textoTicketSeguro(MENSAJE_DOMICILIOS_TIRILLA_LINEA1)));
    rows.push(center(textoTicketSeguro(MENSAJE_DOMICILIOS_TIRILLA_LINEA2)));
    rows.push("");
  }
  rows.push(center(payload.titulo));
  rows.push(center("POS GEB"));
  rows.push("-".repeat(W));
  rows.push(line(`PV: ${payload.puntoVenta}`));
  rows.push(line(`Cuenta: ${payload.precuentaNombre}`));
  rows.push(line(payload.fechaHora));
  rows.push(line(`Cliente: ${payload.clienteNombre}`));
  rows.push(line(`Doc: ${payload.tipoComprobanteLabel}`));
  rows.push(line(`Vendedor: ${payload.vendedorLabel}`));
  rows.push("-".repeat(W));
  for (const l of payload.lineas) {
    const det = l.detalleVariante ? ` (${l.detalleVariante})` : "";
    const head = `${l.cantidad} x ${l.descripcion}${det}`.slice(0, W);
    rows.push(line(head));
    rows.push(line(`  $ ${l.subtotal.toLocaleString("es-CO")}`));
  }
  rows.push("-".repeat(W));
  const dIva = payload.desgloseIvaPreciosIncluidos;
  if (dIva && (dIva.subtotalSinIva > 0 || dIva.iva > 0)) {
    rows.push(line(`Subtotal (sin IVA): $ ${dIva.subtotalSinIva.toLocaleString("es-CO")}`));
    rows.push(line(`IVA ${dIva.tasaPorcentaje}%: $ ${dIva.iva.toLocaleString("es-CO")}`));
    rows.push("-".repeat(W));
  }
  rows.push(line(`TOTAL: $ ${payload.total.toLocaleString("es-CO")}`));
  const fe = payload.facturaElectronica;
  if (fe && (fe.cufe?.trim() || fe.numero?.trim())) {
    rows.push("-".repeat(W));
    rows.push(center("FACTURA ELECTRONICA (DIAN)"));
    if (fe.numero?.trim()) rows.push(line(`No: ${fe.numero.trim()}`));
    if (fe.cufe?.trim()) {
      rows.push(line("CUFE:"));
      const c = textoTicketSeguro(fe.cufe.trim());
      for (let i = 0; i < c.length; i += W) rows.push(line(c.slice(i, i + W)));
    }
    if (fe.enviadoAt?.trim()) rows.push(line(`Emitido: ${fe.enviadoAt.trim()}`));
  }
  rows.push("");
  rows.push(center(payload.notaPie ?? "Gracias por tu compra"));
  rows.push("");
  rows.push(center("----------------"));
  rows.push(center(`@${MARIA_CHORIZOS_IG_HANDLE}`));
  rows.push(center("Seguinos en Instagram"));
  rows.push(center("Maria Chorizos POS GEB"));
  rows.push("");
  if (ticketTieneSaldoClubMillasEnTirilla(payload) && !opciones?.omitirBloqueClubSaldoTexto) {
    rows.push(textoClubMillasSaldoTicketPlano(payload, W));
  } else if (payload.fidelizacionPayloadTexto?.trim() && !opciones?.omitirBloqueFidelizacionTexto) {
    rows.push(
      textoFidelizacionTicketPlano(
        payload.fidelizacionPayloadTexto.trim(),
        W,
        payload.clubMillasCodigoCorto
      )
    );
  }
  if (
    !opciones?.omitirBloqueInvitacionClubTexto &&
    !ticketTieneQrAcumulacionClubMillas(payload) &&
    (payload.clubMillasInvitacionUrl?.trim() || payload.clubMillasInvitacionQrDataUrl?.trim())
  ) {
    rows.push(textoInvitacionClubTicketPlano(W));
  }
  return rows.join("\n");
}

/**
 * QR Code en ESC/POS (GS ( k), compatible con la mayoría de térmicas Xprinter / clón Epson.
 * El contenido es UTF-8 (mismo JSON que el QR de la app).
 */
function escPosQrCodigo(payloadUtf8: string): string {
  const encoder = new TextEncoder();
  const data = encoder.encode(payloadUtf8);
  const maxBytes = 2048;
  const slice = data.length > maxBytes ? data.slice(0, maxBytes) : data;
  const storeLen = slice.length + 3;
  const pL = storeLen & 0xff;
  const pH = (storeLen >> 8) & 0xff;
  let s = "";
  s += "\x1D\x28\x6B\x04\x00\x31\x41\x32\x00";
  s += "\x1D\x28\x6B\x03\x00\x31\x43\x06";
  s += "\x1D\x28\x6B\x03\x00\x31\x45\x31";
  s += "\x1D\x28\x6B" + String.fromCharCode(pL, pH) + "\x31\x50\x30";
  for (let i = 0; i < slice.length; i++) {
    s += String.fromCharCode(slice[i]!);
  }
  s += "\x1D\x28\x6B\x03\x00\x31\x51\x30";
  return s;
}

function escPosAlinearCentro(): string {
  return "\x1B\x61\x01";
}

function escPosAlinearIzq(): string {
  return "\x1B\x61\x00";
}

function escPosTextoGrande(): string {
  return "\x1B\x21\x30";
}

function escPosTextoNormal(): string {
  return "\x1B\x21\x00";
}

function formatoMillasTicket(n: number): string {
  return Math.max(0, Math.round(n)).toLocaleString("es-CO");
}

function textoClubMillasSaldoTicketPlano(payload: TicketVentaPayload, ancho: number): string {
  const center = (s: string) => {
    const t = textoTicketSeguro(s).slice(0, ancho);
    const pad = Math.max(0, Math.floor((ancho - t.length) / 2));
    return " ".repeat(pad) + t;
  };
  const saldo = payload.clubMillasSaldoTotal ?? 0;
  const ganadas = payload.clubMillasGanadasCompra ?? 0;
  const rows: string[] = ["", center(MENSAJE_TIRILLA_CLUB_SALDO_TITULO)];
  rows.push(center(MENSAJE_TIRILLA_CLUB_ACUMULADO_AUTO));
  rows.push("");
  rows.push(center(MENSAJE_TIRILLA_CLUB_SALDO_LABEL));
  rows.push(center(formatoMillasTicket(saldo)));
  if (ganadas > 0) {
    rows.push(center(MENSAJE_TIRILLA_CLUB_GANADAS_LABEL));
    rows.push(center(`+ ${formatoMillasTicket(ganadas)}`));
  }
  rows.push(center(MENSAJE_TIRILLA_CLUB_CONSULTA_PASO));
  const pie = payload.clubMillasMensajePie?.trim();
  if (pie) rows.push(center(textoTicketSeguro(pie).slice(0, ancho)));
  rows.push("");
  return rows.join("\n");
}

function escPosBloqueClubMillasSaldo(payload: TicketVentaPayload, columnas: number): string {
  const W = columnas;
  const center = (t: string) => {
    const x = textoTicketSeguro(t).slice(0, W);
    const pad = Math.max(0, Math.floor((W - x.length) / 2));
    return " ".repeat(pad) + x;
  };
  const saldo = payload.clubMillasSaldoTotal ?? 0;
  const ganadas = payload.clubMillasGanadasCompra ?? 0;
  const url = payload.clubMillasConsultaUrl?.trim() ?? "";
  let out = "\n";
  out += escPosAlinearCentro();
  out += center(textoTicketSeguro(MENSAJE_TIRILLA_CLUB_SALDO_TITULO)) + "\n";
  out += center(textoTicketSeguro(MENSAJE_TIRILLA_CLUB_ACUMULADO_AUTO)) + "\n\n";
  out += center(textoTicketSeguro(MENSAJE_TIRILLA_CLUB_SALDO_LABEL)) + "\n";
  out += escPosTextoGrande();
  out += center(formatoMillasTicket(saldo)) + "\n";
  out += escPosTextoNormal();
  if (ganadas > 0) {
    out += center(textoTicketSeguro(MENSAJE_TIRILLA_CLUB_GANADAS_LABEL)) + "\n";
    out += escPosTextoGrande();
    out += center(`+ ${formatoMillasTicket(ganadas)}`) + "\n";
    out += escPosTextoNormal();
  }
  out += "\n";
  out += center(textoTicketSeguro(MENSAJE_TIRILLA_CLUB_CONSULTA_PASO)) + "\n";
  if (url) {
    out += "\n";
    out += escPosQrCodigo(url);
    out += "\n";
  }
  out += "\n";
  out += escPosAlinearIzq();
  return out;
}

/**
 * Pulso de apertura de cajón (ESC p) para impresoras térmicas ESC/POS.
 * m=0 suele corresponder a pin 2 (conector RJ11).
 */
function escPosAbrirCajon(): string {
  return "\x1B\x70\x00\x19\xFA";
}

function escPosBloqueQrDomicilios(landingUrl: string, columnas: number): string {
  const W = columnas;
  const center = (t: string) => {
    const x = textoTicketSeguro(t).slice(0, W);
    const pad = Math.max(0, Math.floor((W - x.length) / 2));
    return " ".repeat(pad) + x;
  };
  let out = "\n";
  out += escPosAlinearCentro();
  out += center(textoTicketSeguro(MENSAJE_DOMICILIOS_TIRILLA_LINEA1)) + "\n";
  out += center(textoTicketSeguro(MENSAJE_DOMICILIOS_TIRILLA_LINEA2)) + "\n\n";
  out += escPosQrCodigo(landingUrl);
  out += "\n\n";
  out += escPosAlinearIzq();
  return out;
}

function escPosBloqueInvitacionClubMillas(urlInscripcion: string, columnas: number): string {
  const W = columnas;
  const center = (t: string) => {
    const x = textoTicketSeguro(t).slice(0, W);
    const pad = Math.max(0, Math.floor((W - x.length) / 2));
    return " ".repeat(pad) + x;
  };
  let out = "\n";
  out += escPosAlinearCentro();
  out += center("*** CLUB DE MILLAS ***") + "\n";
  out += center(textoTicketSeguro(INVITACION_CLUB_TIRILLA_LLAMADO)) + "\n";
  out += center("Premios a nivel nacional") + "\n\n";
  out += escPosQrCodigo(urlInscripcion);
  out += "\n";
  out += center("Escanea y registrate") + "\n\n";
  out += escPosAlinearIzq();
  return out;
}

function escPosBloqueQrFidelizacion(payloadJson: string, columnas: number, codigoCorto?: string): string {
  const W = columnas;
  const center = (t: string) => {
    const x = textoTicketSeguro(t).slice(0, W);
    const pad = Math.max(0, Math.floor((W - x.length) / 2));
    return " ".repeat(pad) + x;
  };
  const cod = codigoCorto?.trim().toUpperCase();
  let out = "\n";
  out += escPosAlinearCentro();
  out += center(textoTicketSeguro(MENSAJE_TIRILLA_CLUB_FRECUENTE_TITULO)) + "\n";
  out += center(textoTicketSeguro(MENSAJE_TIRILLA_CLUB_FRECUENTE_PASO1)) + "\n";
  out += center(textoTicketSeguro(MENSAJE_TIRILLA_CLUB_FRECUENTE_PASO2)) + "\n";
  if (cod && cod.length === 6) {
    out += center(textoTicketSeguro(MENSAJE_TIRILLA_CLUB_CODIGO_LABEL)) + "\n";
    out += center(cod) + "\n";
  }
  out += "\n";
  out += escPosQrCodigo(payloadJson);
  out += "\n\n";
  out += escPosAlinearIzq();
  return out;
}

/**
 * Mismo texto que verá el ticket impreso por navegador (sin bloque JSON duplicado si hay QR en imagen).
 * Para mostrar en pantalla antes de imprimir.
 */
export function textoParaPrevisualizacionTicket(payload: TicketVentaPayload): string {
  const tieneQrFid = Boolean(payload.fidelizacionQrDataUrl?.trim());
  const tieneQrInvitacion = Boolean(payload.clubMillasInvitacionQrDataUrl?.trim());
  const prefs = typeof window !== "undefined" ? loadImpresionPrefs() : null;
  const cols = prefs ? columnasTicketPorTamanoPapel(prefs.tamanoPapel) : 32;
  return construirTextoTicketPlano(
    tieneQrFid ? { ...payload, fidelizacionPayloadTexto: undefined } : payload,
    cols,
    {
      ...(tieneQrFid ? { omitirBloqueFidelizacionTexto: true } : {}),
      ...(tieneQrInvitacion ? { omitirBloqueInvitacionClubTexto: true } : {}),
    }
  );
}

function textoInvitacionClubTicketPlano(ancho: number): string {
  const center = (s: string) => {
    const t = textoTicketSeguro(s).slice(0, ancho);
    const pad = Math.max(0, Math.floor((ancho - t.length) / 2));
    return " ".repeat(pad) + t;
  };
  const rows: string[] = ["", center("*** CLUB DE MILLAS ***")];
  rows.push(center(textoTicketSeguro(INVITACION_CLUB_TIRILLA_TITULO)));
  rows.push(center(textoTicketSeguro(INVITACION_CLUB_TIRILLA_LLAMADO)));
  rows.push(center(textoTicketSeguro(INVITACION_CLUB_TIRILLA_CUERPO).slice(0, ancho)));
  rows.push("");
  return rows.join("\n");
}

function textoFidelizacionTicketPlano(_payloadJson: string, ancho: number, codigoCorto?: string): string {
  const center = (s: string) => {
    const t = textoTicketSeguro(s).slice(0, ancho);
    const pad = Math.max(0, Math.floor((ancho - t.length) / 2));
    return " ".repeat(pad) + t;
  };
  const rows: string[] = ["", center(MENSAJE_TIRILLA_CLUB_FRECUENTE_TITULO)];
  rows.push(center(MENSAJE_TIRILLA_CLUB_FRECUENTE_PASO1));
  rows.push(center(MENSAJE_TIRILLA_CLUB_FRECUENTE_PASO2));
  const cod = codigoCorto?.trim().toUpperCase();
  if (cod && cod.length === 6) {
    rows.push(center(MENSAJE_TIRILLA_CLUB_CODIGO_LABEL));
    rows.push(center(cod));
  }
  rows.push("");
  return rows.join("\n");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatCopTicket(n: number): string {
  return n.toLocaleString("es-CO", { maximumFractionDigits: 0, minimumFractionDigits: 0 });
}

/** HTML de tirilla para impresión por navegador (UTF-8, ancho según prefs). */
function construirHtmlTirillaTicket(
  payload: TicketVentaPayload,
  prefs: ImpresionPosPrefs,
  origin: string
): string {
  const p = payload;
  const mm = prefs.tamanoPapel === "58mm" ? 58 : prefs.tamanoPapel === "80mm" ? 80 : 210;
  const logoSrc = `${origin}${LOGO_ORG_URL}`;
  const showLogo = !prefs.impresionSimpleSinLogo;

  const lineasHtml = p.lineas
    .map((l) => {
      const det = l.detalleVariante
        ? ` <span class="muted">(${escapeHtml(l.detalleVariante)})</span>`
        : "";
      const desc = `${escapeHtml(String(l.cantidad))} × ${escapeHtml(l.descripcion)}${det}`;
      return `<div class="li"><div class="li-t">${desc}</div><div class="li-p">$ ${escapeHtml(formatCopTicket(l.subtotal))}</div></div>`;
    })
    .join("");

  const dIva = p.desgloseIvaPreciosIncluidos;
  const desgloseIvaHtml =
    dIva && (dIva.subtotalSinIva > 0 || dIva.iva > 0)
      ? `<div class="iva-desglose">
    <div class="iva-row"><span class="iva-k">Subtotal (sin IVA)</span><span class="iva-v">$ ${escapeHtml(formatCopTicket(dIva.subtotalSinIva))}</span></div>
    <div class="iva-row"><span class="iva-k">IVA ${escapeHtml(String(dIva.tasaPorcentaje))}%</span><span class="iva-v">$ ${escapeHtml(formatCopTicket(dIva.iva))}</span></div>
  </div>`
      : "";

  const domiciliosBlock =
    p.domiciliosQrDataUrl?.trim() || p.domiciliosLandingUrl?.trim()
      ? `<div class="domicilios-promo">
          <p class="domicilios-msg">${escapeHtml(MENSAJE_DOMICILIOS_TIRILLA_LINEA1)}</p>
          <p class="domicilios-aqui">${escapeHtml(MENSAJE_DOMICILIOS_TIRILLA_LINEA2)}</p>
          ${
            p.domiciliosQrDataUrl?.trim()
              ? `<img src="${escapeHtml(p.domiciliosQrDataUrl)}" width="150" height="150" alt="QR pedidos a domicilio" />`
              : ""
          }
          <p class="domicilios-hint">Escanea y pide a domicilio</p>
        </div>
        <div class="rule"></div>`
      : "";

  const tieneSaldoClub = ticketTieneSaldoClubMillasEnTirilla(p);
  const saldoClub = p.clubMillasSaldoTotal ?? 0;
  const ganadasClub = p.clubMillasGanadasCompra ?? 0;
  const qrConsultaClub = p.clubMillasConsultaQrDataUrl?.trim();
  const clubSaldoBlock = tieneSaldoClub
    ? `<div class="qr club-saldo-promo">
          <p class="qr-t">${escapeHtml(MENSAJE_TIRILLA_CLUB_SALDO_TITULO)}</p>
          <p class="qr-paso">${escapeHtml(MENSAJE_TIRILLA_CLUB_ACUMULADO_AUTO)}</p>
          <p class="club-saldo-label">${escapeHtml(MENSAJE_TIRILLA_CLUB_SALDO_LABEL)}</p>
          <p class="club-saldo-valor">${escapeHtml(formatoMillasTicket(saldoClub))}</p>
          ${
            ganadasClub > 0
              ? `<p class="club-ganadas-label">${escapeHtml(MENSAJE_TIRILLA_CLUB_GANADAS_LABEL)}</p>
          <p class="club-ganadas-valor">+ ${escapeHtml(formatoMillasTicket(ganadasClub))}</p>`
              : ""
          }
          ${
            p.clubMillasMensajePie?.trim()
              ? `<p class="qr-paso">${escapeHtml(p.clubMillasMensajePie.trim())}</p>`
              : ""
          }
          <p class="qr-paso">${escapeHtml(MENSAJE_TIRILLA_CLUB_CONSULTA_PASO)}</p>
          ${
            qrConsultaClub
              ? `<img src="${escapeHtml(qrConsultaClub)}" width="168" height="168" alt="QR Mi plan Club de Millas" />`
              : ""
          }
          <p class="qr-s">Club de Millas Maria Chorizos</p>
        </div>`
    : "";

  const tieneQrFrecuenteImg = Boolean(payload.fidelizacionQrDataUrl?.trim());
  const codigoCortoFrec = p.clubMillasCodigoCorto?.trim().toUpperCase() ?? "";
  const msgClubFrec = p.fidelizacionPayloadTexto?.trim() ?? "";
  const tieneAcumulacionClub = ticketTieneQrAcumulacionClubMillas(p);
  const esAvisoClub = esAvisoErrorClubMillasEnTicket(p);
  const esBloqueClubLegacy = Boolean(!tieneSaldoClub && (tieneAcumulacionClub || esAvisoClub));
  const qrFrecuenteBlock = esBloqueClubLegacy
    ? `<div class="qr club-frecuente-promo">
          <p class="qr-t">${escapeHtml(MENSAJE_TIRILLA_CLUB_FRECUENTE_TITULO)}</p>
          ${
            esAvisoClub
              ? `<p class="qr-paso">${escapeHtml(msgClubFrec)}</p>`
              : `<p class="qr-paso">${escapeHtml(MENSAJE_TIRILLA_CLUB_FRECUENTE_PASO1)}</p>
          <p class="qr-paso">${escapeHtml(MENSAJE_TIRILLA_CLUB_FRECUENTE_PASO2)}</p>`
          }
          ${
            esCodigoCortoTirillaClubMillas(codigoCortoFrec)
              ? `<p class="qr-codigo-label">${escapeHtml(MENSAJE_TIRILLA_CLUB_CODIGO_LABEL)}</p>
          <p class="qr-codigo-valor">${escapeHtml(codigoCortoFrec)}</p>`
              : ""
          }
          ${
            tieneQrFrecuenteImg
              ? `<img src="${escapeHtml(payload.fidelizacionQrDataUrl!)}" width="160" height="160" alt="" />`
              : ""
          }
          ${
            p.clubMillasLandingUrl?.trim()
              ? `<p class="qr-paso" style="font-size:7px;word-break:break-all">${escapeHtml(p.clubMillasLandingUrl.trim())}</p>`
              : ""
          }
          <p class="qr-s">Club de Millas Maria Chorizos</p>
        </div>`
    : "";

  const qrInvitacionBlock =
    !tieneAcumulacionClub &&
    (p.clubMillasInvitacionQrDataUrl?.trim() || p.clubMillasInvitacionUrl?.trim())
      ? `<div class="club-invitacion-promo">
          <p class="club-invitacion-badge">Programa nacional</p>
          <p class="club-invitacion-titulo">${escapeHtml(INVITACION_CLUB_TIRILLA_TITULO)}</p>
          <p class="club-invitacion-llamado">${escapeHtml(INVITACION_CLUB_TIRILLA_LLAMADO)}</p>
          <p class="club-invitacion-cuerpo">${escapeHtml(INVITACION_CLUB_TIRILLA_CUERPO)}</p>
          ${
            p.clubMillasInvitacionQrDataUrl?.trim()
              ? `<img src="${escapeHtml(p.clubMillasInvitacionQrDataUrl)}" width="168" height="168" alt="QR Club de Millas" />`
              : ""
          }
          <p class="club-invitacion-hint">Escanea el QR · Registrate gratis</p>
        </div>`
      : "";

  const qrBlock = clubSaldoBlock || qrFrecuenteBlock || qrInvitacionBlock;

  const logoHtml = showLogo
    ? `<div class="logo-wrap"><div class="logo"><img src="${escapeHtml(logoSrc)}" alt="María Chorizos" /></div><div class="brand-name">MARÍA CHORIZOS</div></div>`
    : `<div class="brand-only">MARÍA CHORIZOS</div>`;

  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/><title>Ticket POS GEB</title>
<style>
  @page { size: ${mm}mm auto; margin: 0; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: ${mm <= 80 ? "2mm 2.5mm 3mm" : "6mm"};
    font-family: ui-sans-serif, system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    color: #111;
    background: #fff;
  }
  .tirilla {
    max-width: ${mm <= 80 ? mm + "mm" : "72mm"};
    margin: 0 auto;
  }
  .logo-wrap { text-align: center; margin-bottom: 6px; }
  .logo { margin-bottom: 4px; }
  .logo img { max-height: 44px; width: auto; object-fit: contain; display: inline-block; }
  .brand-name {
    text-align: center;
    font-weight: 800;
    font-size: 11px;
    letter-spacing: 0.2em;
    color: #b91c1c;
    margin: 0 0 4px;
  }
  .brand-only {
    text-align: center;
    font-weight: 800;
    font-size: 11px;
    letter-spacing: 0.2em;
    color: #b91c1c;
    margin-bottom: 4px;
  }
  .tagline {
    text-align: center;
    font-size: 8px;
    font-weight: 600;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #64748b;
    margin: 0 0 2px;
  }
  .subtag {
    text-align: center;
    font-size: 7px;
    color: #94a3b8;
    margin: 0 0 8px;
    letter-spacing: 0.12em;
  }
  .rule {
    height: 1px;
    background: linear-gradient(90deg, transparent, #cbd5e1 15%, #cbd5e1 85%, transparent);
    margin: 8px 0;
    border: 0;
  }
  .meta { font-size: 8.5px; line-height: 1.45; margin-bottom: 8px; }
  .meta-row { display: flex; justify-content: space-between; gap: 6px; margin: 3px 0; }
  .meta-k { color: #64748b; flex-shrink: 0; }
  .meta-v { text-align: right; font-weight: 500; word-break: break-word; }
  .li {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    font-size: 9px;
    margin: 6px 0;
    padding-bottom: 5px;
    border-bottom: 1px dotted #e2e8f0;
  }
  .li-t { flex: 1; min-width: 0; line-height: 1.35; }
  .li-p { font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .muted { color: #64748b; font-weight: 400; font-size: 8px; }
  .iva-desglose {
    margin-top: 8px;
    padding: 6px 8px;
    background: #f1f5f9;
    border-radius: 6px;
    font-size: 8px;
    line-height: 1.45;
  }
  .iva-row { display: flex; justify-content: space-between; gap: 8px; margin: 3px 0; }
  .iva-k { color: #64748b; font-weight: 600; }
  .iva-v { font-weight: 700; font-variant-numeric: tabular-nums; }
  .total {
    margin-top: 10px;
    padding: 8px 10px;
    background: #0f172a;
    color: #fff;
    border-radius: 6px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.04em;
  }
  .total span:last-child { font-variant-numeric: tabular-nums; }
  .nota {
    margin-top: 10px;
    font-size: 8px;
    line-height: 1.4;
    color: #475569;
    text-align: center;
    padding: 0 2px;
  }
  .social {
    margin-top: 12px;
    padding-top: 10px;
    border-top: 2px solid #e2e8f0;
    text-align: center;
  }
  .social-ig {
    font-size: 12px;
    font-weight: 800;
    color: #be185d;
    letter-spacing: 0.02em;
    margin: 0 0 4px;
  }
  .social-hint {
    font-size: 7.5px;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    margin: 0 0 6px;
  }
  .social-brand {
    font-size: 7px;
    color: #94a3b8;
    letter-spacing: 0.1em;
    margin: 0;
  }
  .domicilios-promo {
    margin-bottom: 8px;
    padding: 8px 4px 6px;
    text-align: center;
    background: linear-gradient(180deg, #ecfeff 0%, #fff 100%);
    border: 1px solid #a5f3fc;
    border-radius: 8px;
  }
  .domicilios-msg {
    margin: 0;
    font-size: 8.5px;
    font-weight: 700;
    line-height: 1.35;
    color: #0e7490;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .domicilios-aqui {
    margin: 2px 0 6px;
    font-size: 13px;
    font-weight: 900;
    letter-spacing: 0.2em;
    color: #0f766e;
  }
  .domicilios-hint {
    margin: 4px 0 0;
    font-size: 7px;
    color: #64748b;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .domicilios-promo img { image-rendering: pixelated; display: inline-block; margin-top: 2px; }
  .club-invitacion-promo {
    margin-top: 12px;
    padding: 10px 6px 8px;
    text-align: center;
    background: linear-gradient(165deg, #fef3c7 0%, #fff7ed 45%, #fff 100%);
    border: 2px solid #f59e0b;
    border-radius: 10px;
    box-shadow: 0 2px 0 #d97706;
  }
  .club-invitacion-badge {
    margin: 0 0 4px;
    font-size: 7px;
    font-weight: 800;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #b45309;
  }
  .club-invitacion-titulo {
    margin: 0;
    font-size: 8px;
    font-weight: 800;
    line-height: 1.3;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #78350f;
  }
  .club-invitacion-llamado {
    margin: 4px 0 6px;
    font-size: 15px;
    font-weight: 900;
    letter-spacing: 0.12em;
    color: #c2410c;
    text-shadow: 0 1px 0 #fff;
  }
  .club-invitacion-cuerpo {
    margin: 0 0 8px;
    font-size: 7.5px;
    font-weight: 600;
    line-height: 1.4;
    color: #92400e;
  }
  .club-invitacion-hint {
    margin: 6px 0 0;
    font-size: 7px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #b45309;
  }
  .club-invitacion-promo img { image-rendering: pixelated; display: inline-block; margin-top: 2px; }
  .qr { margin-top: 12px; text-align: center; padding-top: 10px; border-top: 1px dashed #cbd5e1; }
  .club-frecuente-promo {
    padding: 8px 4px;
    background: linear-gradient(180deg, #fffbeb 0%, #fff 100%);
    border: 1px solid #fcd34d;
    border-radius: 8px;
  }
  .qr-t { margin: 0 0 4px; font-size: 7.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: #92400e; line-height: 1.3; }
  .qr-paso { margin: 0 0 4px; font-size: 7px; font-weight: 600; line-height: 1.35; color: #b45309; }
  .qr-codigo-label { margin: 6px 0 2px; font-size: 7px; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; color: #92400e; }
  .qr-codigo-valor { margin: 0 0 8px; font-size: 18px; font-weight: 900; letter-spacing: 0.28em; color: #c2410c; }
  .club-saldo-promo {
    margin-top: 10px;
    padding: 10px 8px;
    border: 2px solid #f59e0b;
    border-radius: 8px;
    background: linear-gradient(180deg, #fffbeb 0%, #fff 100%);
    text-align: center;
  }
  .club-saldo-label { margin: 8px 0 2px; font-size: 8px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: #92400e; }
  .club-saldo-valor { margin: 0 0 6px; font-size: 28px; font-weight: 900; line-height: 1.1; letter-spacing: 0.04em; color: #c2410c; }
  .club-ganadas-label { margin: 4px 0 2px; font-size: 7px; font-weight: 700; color: #b45309; }
  .club-ganadas-valor { margin: 0 0 8px; font-size: 16px; font-weight: 800; color: #ea580c; }
  .qr-s { margin: 6px 0 0; font-size: 7px; font-weight: 700; color: #78350f; text-transform: uppercase; letter-spacing: 0.08em; }
  .qr img { image-rendering: pixelated; display: inline-block; }
  .fe-dian {
    margin-top: 10px;
    padding: 8px 6px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    font-size: 7.5px;
    line-height: 1.35;
    word-break: break-all;
  }
  .fe-dian-t {
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #0f172a;
    margin: 0 0 6px;
    text-align: center;
    font-size: 7px;
  }
  .fe-dian-row { margin: 4px 0; color: #334155; }
  .fe-dian-k { font-weight: 700; color: #64748b; display: block; margin-bottom: 2px; }
</style></head><body>
<div class="tirilla">
  ${domiciliosBlock}
  ${logoHtml}
  <p class="tagline">${escapeHtml(p.titulo)}</p>
  <p class="subtag">POS GEB · ${escapeHtml(p.fechaHora)}</p>
  <div class="rule"></div>
  <div class="meta">
    <div class="meta-row"><span class="meta-k">Punto de venta</span><span class="meta-v">${escapeHtml(p.puntoVenta)}</span></div>
    <div class="meta-row"><span class="meta-k">Cuenta</span><span class="meta-v">${escapeHtml(p.precuentaNombre)}</span></div>
    <div class="meta-row"><span class="meta-k">Cliente</span><span class="meta-v">${escapeHtml(p.clienteNombre)}</span></div>
    <div class="meta-row"><span class="meta-k">Documento</span><span class="meta-v">${escapeHtml(p.tipoComprobanteLabel)}</span></div>
    <div class="meta-row"><span class="meta-k">Vendedor</span><span class="meta-v">${escapeHtml(p.vendedorLabel)}</span></div>
  </div>
  <div class="rule"></div>
  ${lineasHtml}
  ${desgloseIvaHtml}
  <div class="total"><span>TOTAL</span><span>$ ${escapeHtml(formatCopTicket(p.total))}</span></div>
  ${
    p.facturaElectronica &&
    (p.facturaElectronica.cufe?.trim() || p.facturaElectronica.numero?.trim())
      ? `<div class="fe-dian">
    <p class="fe-dian-t">Factura electrónica (DIAN)</p>
    ${
      p.facturaElectronica.numero?.trim()
        ? `<div class="fe-dian-row"><span class="fe-dian-k">Número</span>${escapeHtml(p.facturaElectronica.numero.trim())}</div>`
        : ""
    }
    ${
      p.facturaElectronica.cufe?.trim()
        ? `<div class="fe-dian-row"><span class="fe-dian-k">CUFE</span>${escapeHtml(p.facturaElectronica.cufe.trim())}</div>`
        : ""
    }
    ${
      p.facturaElectronica.enviadoAt?.trim()
        ? `<div class="fe-dian-row"><span class="fe-dian-k">Emitido</span>${escapeHtml(p.facturaElectronica.enviadoAt.trim())}</div>`
        : ""
    }
  </div>`
      : ""
  }
  ${p.notaPie?.trim() ? `<p class="nota">${escapeHtml(p.notaPie.trim())}</p>` : `<p class="nota">Gracias por elegirnos — calidad y sabor en cada visita.</p>`}
  <div class="social">
    <p class="social-hint">Seguinos en redes</p>
    <p class="social-ig">@${escapeHtml(MARIA_CHORIZOS_IG_HANDLE)}</p>
    <p class="social-brand">María Chorizos · POS GEB</p>
  </div>
  ${qrBlock}
</div>
<script>window.onload=function(){window.print();setTimeout(function(){window.close()},300);}</script>
</body></html>`;
}

/**
 * Abre una ventana en blanco en el mismo evento de usuario (síncrono).
 * Úsala antes de `await` si luego puede hacerse fallback a impresión en navegador tras fallar QZ;
 * si no, el navegador bloquea `window.open` después del await.
 */
export function reservarVentanaTicketNavegador(): Window | null {
  try {
    return window.open("about:blank", "_blank", "width=420,height=640");
  } catch {
    return null;
  }
}

export function imprimirTicketEnNavegador(payload: TicketVentaPayload, ventanaExistente?: Window | null): void {
  const prefsNav = loadImpresionPrefs();
  const tieneQrImg = Boolean(payload.fidelizacionQrDataUrl?.trim());
  const p = tieneQrImg ? { ...payload, fidelizacionPayloadTexto: undefined } : payload;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const html = construirHtmlTirillaTicket(p, prefsNav, origin);
  const w =
    ventanaExistente != null && !ventanaExistente.closed
      ? ventanaExistente
      : window.open("", "_blank", "width=420,height=720");
  if (!w) {
    throw new Error("Permite ventanas emergentes para imprimir desde el navegador.");
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QzModule = any;

async function importQz(): Promise<QzModule> {
  const mod = await import("qz-tray");
  return mod.default;
}

/**
 * Si el despliegue tiene certificado/clave QZ y NEXT_PUBLIC_POS_QZ_SIGNING=1, configura certificado + firma
 * para que QZ muestre un sitio de confianza (no «Anonymous») y suela funcionar mejor «Recordar decisión».
 */
async function qzApplySigningIfConfigured(qz: QzModule): Promise<void> {
  if (typeof window === "undefined") return;
  if (process.env.NEXT_PUBLIC_POS_QZ_SIGNING !== "1") return;

  const { auth } = await import("@/lib/firebase");
  const token = await auth?.currentUser?.getIdToken();
  if (!token) return;

  const origin = window.location.origin;
  try {
    const rCert = await fetch(`${origin}/api/pos_qz_certificate`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!rCert.ok) return;
    const cert = await rCert.text();
    if (!cert.includes("BEGIN CERTIFICATE")) return;

    const alg = (process.env.NEXT_PUBLIC_POS_QZ_SIGN_ALGORITHM || "SHA512").toUpperCase();
    if (typeof qz.security?.setSignatureAlgorithm === "function") {
      qz.security.setSignatureAlgorithm(alg);
    }

    qz.security.setCertificatePromise(() => Promise.resolve(cert));

    qz.security.setSignaturePromise(async (toSign: string) => {
      const fresh = await auth?.currentUser?.getIdToken();
      if (!fresh) throw new Error("Sesión caducada. Volvé a iniciar sesión para imprimir con QZ.");
      const r = await fetch(`${origin}/api/pos_qz_sign`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${fresh}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ toSign }),
        cache: "no-store",
      });
      if (!r.ok) {
        const errText = await r.text();
        throw new Error(errText.slice(0, 200) || "Firma QZ rechazada por el servidor.");
      }
      return await r.text();
    });
  } catch (e) {
    console.warn("[POS] QZ: no se aplicó firma digital; seguirá el aviso de sitio sin firmar.", e);
  }
}

/** Conecta a QZ Tray; si ya hay sesión abierta, continúa. */
export async function qzEnsureConnected(): Promise<QzModule> {
  const qz = await importQz();
  await qzApplySigningIfConfigured(qz);
  try {
    await qz.websocket.connect();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("already exists")) {
      throw e;
    }
  }
  return qz;
}

export async function qzListarImpresoras(): Promise<string[]> {
  const qz = await qzEnsureConnected();
  const list = await qz.printers.find();
  if (Array.isArray(list)) return list as string[];
  if (list == null) return [];
  return [String(list)];
}

function tamanoPapelQzMm(p: ImpresionPosPrefs["tamanoPapel"]): { width: number; height: number } {
  if (p === "58mm") return { width: 58, height: 200 };
  if (p === "80mm") return { width: 80, height: 200 };
  return { width: 210, height: 297 };
}

export async function imprimirTicketConQz(prefs: ImpresionPosPrefs, payload: TicketVentaPayload): Promise<void> {
  const qz = await qzEnsureConnected();
  let printerName = prefs.impresoraNombre.trim();
  if (!printerName) {
    printerName = String(await qz.printers.getDefault());
  }
  const { width, height } = tamanoPapelQzMm(prefs.tamanoPapel);
  const config = qz.configs.create(printerName, {
    copies: prefs.copias,
    jobName: "POS GEB — Ticket",
    units: "mm",
    size: { width, height },
    margins: {
      top: prefs.margenSuperiorMm,
      bottom: prefs.margenInferiorMm,
      left: prefs.margenIzquierdaMm,
      right: prefs.margenDerechaMm,
    },
  });
  const cols = columnasTicketPorTamanoPapel(prefs.tamanoPapel);
  const tieneSaldoClub = ticketTieneSaldoClubMillasEnTirilla(payload);
  const contenidoQrClub = contenidoQrEscaneableClubMillasDesdeTicket(payload);
  const domUrl = payload.domiciliosLandingUrl?.trim();
  const invUrl = payload.clubMillasInvitacionUrl?.trim();
  const tieneQrInvitacion = Boolean(payload.clubMillasInvitacionQrDataUrl?.trim());
  const plain = construirTextoTicketPlano(payload, cols, {
    ...(tieneSaldoClub ? { omitirBloqueClubSaldoTexto: true } : {}),
    ...(contenidoQrClub && !tieneSaldoClub ? { omitirBloqueFidelizacionTexto: true } : {}),
    ...(domUrl ? { omitirBloqueDomiciliosTexto: true } : {}),
    ...(invUrl && tieneQrInvitacion ? { omitirBloqueInvitacionClubTexto: true } : {}),
  });
  const bloqueDomicilios = domUrl ? escPosBloqueQrDomicilios(domUrl, cols) : "";
  const bloqueSaldoClub = tieneSaldoClub ? escPosBloqueClubMillasSaldo(payload, cols) : "";
  const bloqueQr =
    !tieneSaldoClub && contenidoQrClub
      ? escPosBloqueQrFidelizacion(contenidoQrClub, cols, payload.clubMillasCodigoCorto)
      : "";
  const bloqueInvitacion =
    invUrl && !contenidoQrClub && !tieneSaldoClub
      ? escPosBloqueInvitacionClubMillas(invUrl, cols)
      : "";
  const init = "\x1B\x40";
  const abrirCajon = escPosAbrirCajon();
  const data = `${init}${bloqueDomicilios}${plain}${bloqueSaldoClub}${bloqueQr}${bloqueInvitacion}\n\n${abrirCajon}\n\x1D\x56\x00`;
  await qz.print(config, [data]);
}

export async function probarImpresionQz(prefs: ImpresionPosPrefs): Promise<void> {
  const now = fechaHoraColombia(new Date());
  await imprimirTicketConQz(prefs, {
    titulo: "DOCUMENTO DE PRUEBA",
    puntoVenta: "Punto de venta demo",
    precuentaNombre: "Pre-cuenta prueba",
    fechaHora: now,
    clienteNombre: "Consumidor final",
    tipoComprobanteLabel: "Doc. interno",
    vendedorLabel: "POS GEB",
    lineas: [
      {
        descripcion: "Producto de prueba",
        cantidad: 1,
        precioUnitario: 1000,
        subtotal: 1000,
      },
    ],
    total: 1000,
  });
}
