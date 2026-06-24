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
  MENSAJE_TIRILLA_CLUB_SALDO_ANTES_LABEL,
  MENSAJE_TIRILLA_CLUB_SALDO_DESPUES_LABEL,
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

/** Ancho en caracteres monoespaciados según rollo (58 mm = Font A en térmicas típicas). */
export function columnasTicketPorTamanoPapel(tam: TamanoPapelTicket): number {
  if (tam === "58mm") return 30;
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
  /** Si se imprime saldo de Club sin QR (p. ej. FE), evita mostrar la instrucción de escaneo. */
  omitirPasoConsultaClubTexto?: boolean;
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
  const fe = payload.facturaElectronica;
  const esFacturaElectronica = Boolean(fe && (fe.cufe?.trim() || fe.numero?.trim()));
  rows.push(center(esFacturaElectronica ? "Factura Electronica de Venta" : payload.titulo));
  rows.push(center("POS GEB"));
  rows.push("-".repeat(W));
  rows.push(line(`PV: ${payload.puntoVenta}`));
  rows.push(line(`Cuenta: ${payload.precuentaNombre}`));
  rows.push(line(payload.fechaHora));
  if (esFacturaElectronica) {
    rows.push(center("ENCABEZADO DEL EMISOR"));
    rows.push(line(`Emisor: ${fe?.emisorNombre?.trim() || "Maria Chorizos"}`));
    if (fe?.emisorNit?.trim()) rows.push(line(`NIT emisor: ${fe.emisorNit.trim()}`));
    rows.push(line(`Punto: ${payload.puntoVenta}`));
    rows.push(center("DATOS DEL ADQUIRENTE"));
    rows.push(line(`Cliente: ${fe?.adquirenteNombre?.trim() || payload.clienteNombre}`));
    if (fe?.adquirenteNit?.trim()) rows.push(line(`Doc/NIT: ${fe.adquirenteNit.trim()}`));
  } else {
    rows.push(line(`Cliente: ${payload.clienteNombre}`));
  }
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
  if (esFacturaElectronica && fe) {
    rows.push("-".repeat(W));
    rows.push(center("FACTURA ELECTRONICA DE VENTA"));
    if (fe.numero?.trim()) rows.push(line(`No: ${fe.numero.trim()}`));
    rows.push(center("RESOLUCION DIAN"));
    if (fe.resolucionNumero?.trim()) rows.push(line(`Resolucion: ${fe.resolucionNumero.trim()}`));
    if (fe.prefijo?.trim()) rows.push(line(`Prefijo: ${fe.prefijo.trim()}`));
    if (fe.rangoDesde?.trim() || fe.rangoHasta?.trim()) {
      rows.push(line(`Rango: ${fe.rangoDesde?.trim() || "1"} al ${fe.rangoHasta?.trim() || "-"}`));
    }
    if (fe.cufe?.trim()) {
      rows.push(line("CUFE:"));
      const c = textoTicketSeguro(fe.cufe.trim());
      for (let i = 0; i < c.length; i += W) rows.push(line(c.slice(i, i + W)));
    }
    rows.push(line(`Proveedor tecnologico: ${fe.proveedorTecnologico?.trim() || "Alegra / e-provider Colombia"}`));
    if (fe.enviadoAt?.trim()) rows.push(line(`Emitido: ${fe.enviadoAt.trim()}`));
    rows.push(center("QR CUFE al final de tirilla"));
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
    rows.push(textoClubMillasSaldoTicketPlano(payload, W, !opciones?.omitirPasoConsultaClubTexto));
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

/** Doble altura + énfasis, sin doble ancho: más nítido en 58 mm que 0x30. */
function escPosTextoDobleAlturaNegrita(): string {
  return "\x1B\x21\x18";
}

function escPosTextoNormal(): string {
  return "\x1B\x21\x00";
}

function escPosReiniciarEstiloTexto(): string {
  return escPosTextoNormal() + escPosNegritaOff();
}

/** Negrita / énfasis (mejor legibilidad en térmicas ESC/POS). */
function escPosNegritaOn(): string {
  return "\x1B\x45\x01";
}

function escPosNegritaOff(): string {
  return "\x1B\x45\x00";
}

/** Doble golpe: aumenta la oscuridad en muchas térmicas ESC/POS sin cambiar el tamaño. */
function escPosDobleGolpeOn(): string {
  return "\x1B\x47\x01";
}

function escPosDobleGolpeOff(): string {
  return "\x1B\x47\x00";
}

/** Font A (12×24): más nítida que Font B en la mayoría de Xprinter / Epson. */
function escPosFontA(): string {
  return "\x1B\x4D\x00";
}

/**
 * Envuelve el ticket en texto plano con énfasis en título, separadores y total.
 * El QR sigue yendo aparte por comandos nativos (no se toca).
 */
function aplicarLegibilidadEscPosTextoPlano(plain: string, columnas: number): string {
  const lines = plain.split("\n");
  let out = escPosFontA() + escPosNegritaOn() + escPosDobleGolpeOn();
  let lineasTitulo = 0;
  for (const ln of lines) {
    const trimmed = ln.trim();
    const esSeparador = /^-+$/.test(trimmed);
    const esTotal = /^TOTAL:/i.test(trimmed);
    const esTitulo =
      lineasTitulo < 2 &&
      trimmed.length > 0 &&
      !trimmed.startsWith("PV:") &&
      !trimmed.startsWith("Cuenta:") &&
      !esSeparador &&
      ln === ln.trim() &&
      ln.length <= columnas;
    if (esTitulo) lineasTitulo += 1;

    if (esTotal) {
      out += escPosTextoDobleAlturaNegrita();
      out += ln + "\n";
      out += escPosReiniciarEstiloTexto() + escPosDobleGolpeOn() + escPosNegritaOn();
      continue;
    }
    if (esSeparador || esTitulo) {
      out += escPosNegritaOn();
      out += ln + "\n";
      continue;
    }
    out += ln + "\n";
  }
  out += escPosDobleGolpeOff() + escPosNegritaOff() + escPosTextoNormal();
  return out;
}

function esTamanoPapelTermico(tam: TamanoPapelTicket): boolean {
  return tam === "58mm" || tam === "80mm";
}

function formatoMillasTicket(n: number): string {
  return Math.max(0, Math.round(n)).toLocaleString("es-CO");
}

function millasAntesEnTicket(payload: TicketVentaPayload): number | undefined {
  const a = payload.clubMillasSaldoAntes;
  return a != null && Number.isFinite(a) ? Math.round(a) : undefined;
}

function millasDespuesEnTicket(payload: TicketVentaPayload): number | undefined {
  const d = payload.clubMillasSaldoTotal;
  if (d != null && Number.isFinite(d)) return Math.round(d);
  const antes = millasAntesEnTicket(payload);
  if (antes === undefined) return undefined;
  const g = payload.clubMillasGanadasCompra ?? 0;
  return antes + (Number.isFinite(g) ? Math.round(g) : 0);
}

function textoClubMillasSaldoTicketPlano(payload: TicketVentaPayload, ancho: number, incluirPasoConsulta = true): string {
  const center = (s: string) => {
    const t = textoTicketSeguro(s).slice(0, ancho);
    const pad = Math.max(0, Math.floor((ancho - t.length) / 2));
    return " ".repeat(pad) + t;
  };
  const antes = millasAntesEnTicket(payload);
  const despues = millasDespuesEnTicket(payload);
  const ganadas = payload.clubMillasGanadasCompra ?? 0;
  const rows: string[] = ["", center(MENSAJE_TIRILLA_CLUB_SALDO_TITULO)];
  rows.push(center(MENSAJE_TIRILLA_CLUB_ACUMULADO_AUTO));
  rows.push("");
  if (antes !== undefined) {
    rows.push(center(MENSAJE_TIRILLA_CLUB_SALDO_ANTES_LABEL));
    rows.push(center(formatoMillasTicket(antes)));
  }
  if (despues !== undefined) {
    rows.push(center(MENSAJE_TIRILLA_CLUB_SALDO_DESPUES_LABEL));
    rows.push(center(formatoMillasTicket(despues)));
  } else if (antes !== undefined) {
    rows.push(center(MENSAJE_TIRILLA_CLUB_SALDO_LABEL));
    rows.push(center(formatoMillasTicket(antes)));
  }
  if (ganadas > 0) {
    rows.push(center(MENSAJE_TIRILLA_CLUB_GANADAS_LABEL));
    rows.push(center(`+ ${formatoMillasTicket(ganadas)}`));
  }
  if (incluirPasoConsulta) rows.push(center(MENSAJE_TIRILLA_CLUB_CONSULTA_PASO));
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
  const linea = (ch = "=") => ch.repeat(W) + "\n";
  const etiqueta = (t: string) => {
    let s = escPosNegritaOn() + escPosTextoNormal();
    s += center(textoTicketSeguro(t)) + "\n";
    s += escPosReiniciarEstiloTexto();
    return s;
  };
  const cifra = (t: string) => {
    let s = escPosTextoDobleAlturaNegrita();
    s += center(textoTicketSeguro(t)) + "\n";
    s += escPosReiniciarEstiloTexto();
    return s;
  };
  const antes = millasAntesEnTicket(payload);
  const despues = millasDespuesEnTicket(payload);
  const ganadas = payload.clubMillasGanadasCompra ?? 0;
  const url = payload.clubMillasConsultaUrl?.trim() ?? "";
  let out = "\n";
  out += escPosFontA();
  out += escPosAlinearCentro();
  out += linea("=");
  out += etiqueta(MENSAJE_TIRILLA_CLUB_SALDO_TITULO);
  out += etiqueta(MENSAJE_TIRILLA_CLUB_ACUMULADO_AUTO);
  out += "\n";
  if (antes !== undefined) {
    out += etiqueta(MENSAJE_TIRILLA_CLUB_SALDO_ANTES_LABEL);
    out += cifra(formatoMillasTicket(antes));
  }
  if (despues !== undefined) {
    out += etiqueta(MENSAJE_TIRILLA_CLUB_SALDO_DESPUES_LABEL);
    out += cifra(formatoMillasTicket(despues));
  }
  if (ganadas > 0) {
    out += etiqueta(MENSAJE_TIRILLA_CLUB_GANADAS_LABEL);
    out += cifra(`+ ${formatoMillasTicket(ganadas)}`);
  }
  const pie = payload.clubMillasMensajePie?.trim();
  if (pie) out += etiqueta(pie);
  out += "\n";
  out += etiqueta(MENSAJE_TIRILLA_CLUB_CONSULTA_PASO);
  out += linea("=");
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

function escPosBloqueQrFacturaElectronica(fe: NonNullable<TicketVentaPayload["facturaElectronica"]>, columnas: number): string {
  const contenido = fe.qrContenido?.trim() || (fe.cufe?.trim() ? `CUFE:${fe.cufe.trim()}` : "");
  if (!contenido) return "";
  const W = columnas;
  const center = (t: string) => {
    const x = textoTicketSeguro(t).slice(0, W);
    const pad = Math.max(0, Math.floor((W - x.length) / 2));
    return " ".repeat(pad) + x;
  };
  let out = "\n";
  out += escPosAlinearCentro();
  out += center("VALIDACION ELECTRONICA DIAN") + "\n";
  out += center("QR / CUFE") + "\n\n";
  out += escPosQrCodigo(contenido);
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
  const cols = prefs ? columnasTicketPorTamanoPapel(prefs.tamanoPapel) : columnasTicketPorTamanoPapel("58mm");
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
  const rollo58 = prefs.tamanoPapel === "58mm";
  const termico = esTamanoPapelTermico(prefs.tamanoPapel);
  const anchoContenidoMm = rollo58 ? 54 : prefs.tamanoPapel === "80mm" ? 74 : 72;
  const qrDomPx = rollo58 ? 128 : 150;
  const qrClubPx = rollo58 ? 140 : 168;
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

  const fe = p.facturaElectronica;
  const esFacturaElectronica = Boolean(fe && (fe.cufe?.trim() || fe.numero?.trim()));
  const incluirQrPromocionales = !esFacturaElectronica;
  const tituloDocumento = esFacturaElectronica ? "Factura Electrónica de Venta" : p.titulo;
  const facturaElectronicaHtml =
    esFacturaElectronica && fe
      ? `<div class="fe-dian">
    <p class="fe-dian-t">Factura Electrónica de Venta</p>
    <div class="fe-section">
      <p class="fe-section-t">Encabezado del Emisor</p>
      <div class="fe-dian-row"><span class="fe-dian-k">Emisor</span>${escapeHtml(fe.emisorNombre?.trim() || "María Chorizos")}</div>
      ${
        fe.emisorNit?.trim()
          ? `<div class="fe-dian-row"><span class="fe-dian-k">NIT emisor</span>${escapeHtml(fe.emisorNit.trim())}</div>`
          : ""
      }
      <div class="fe-dian-row"><span class="fe-dian-k">Punto de venta</span>${escapeHtml(p.puntoVenta)}</div>
    </div>
    <div class="fe-section">
      <p class="fe-section-t">Datos del Adquirente</p>
      <div class="fe-dian-row"><span class="fe-dian-k">Cliente</span>${escapeHtml(fe.adquirenteNombre?.trim() || p.clienteNombre)}</div>
      ${
        fe.adquirenteNit?.trim()
          ? `<div class="fe-dian-row"><span class="fe-dian-k">Documento / NIT</span>${escapeHtml(fe.adquirenteNit.trim())}</div>`
          : ""
      }
    </div>
    <div class="fe-section">
      <p class="fe-section-t">Resolución y Rangos DIAN</p>
      ${
        fe.resolucionNumero?.trim()
          ? `<div class="fe-dian-row"><span class="fe-dian-k">Resolución</span>${escapeHtml(fe.resolucionNumero.trim())}</div>`
          : ""
      }
      ${
        fe.prefijo?.trim()
          ? `<div class="fe-dian-row"><span class="fe-dian-k">Prefijo</span>${escapeHtml(fe.prefijo.trim())}</div>`
          : ""
      }
      <div class="fe-dian-row"><span class="fe-dian-k">Rango autorizado</span>${escapeHtml(fe.rangoDesde?.trim() || "1")} al ${escapeHtml(fe.rangoHasta?.trim() || "—")}</div>
    </div>
    <div class="fe-section">
      <p class="fe-section-t">Identificación Electrónica</p>
      ${
        fe.numero?.trim()
          ? `<div class="fe-dian-row"><span class="fe-dian-k">Número factura</span>${escapeHtml(fe.numero.trim())}</div>`
          : ""
      }
      ${
        fe.cufe?.trim()
          ? `<div class="fe-dian-row"><span class="fe-dian-k">CUFE</span>${escapeHtml(fe.cufe.trim())}</div>`
          : ""
      }
      ${
        fe.enviadoAt?.trim()
          ? `<div class="fe-dian-row"><span class="fe-dian-k">Emitido</span>${escapeHtml(fe.enviadoAt.trim())}</div>`
          : ""
      }
      <div class="fe-dian-row"><span class="fe-dian-k">Proveedor tecnológico</span>${escapeHtml(fe.proveedorTecnologico?.trim() || "Alegra / e-provider Colombia")}</div>
    </div>
    <div class="fe-qr">
      <p class="fe-section-t">Código CUFE con QR</p>
      ${
        fe.qrDataUrl?.trim()
          ? `<img src="${escapeHtml(fe.qrDataUrl.trim())}" width="${rollo58 ? 128 : 150}" height="${rollo58 ? 128 : 150}" alt="QR CUFE DIAN" />`
          : `<div class="fe-qr-box">Espacio físico reservado para QR CUFE</div>`
      }
    </div>
  </div>`
      : "";

  const domiciliosBlock =
    incluirQrPromocionales && (p.domiciliosQrDataUrl?.trim() || p.domiciliosLandingUrl?.trim())
      ? `<div class="domicilios-promo">
          <p class="domicilios-msg">${escapeHtml(MENSAJE_DOMICILIOS_TIRILLA_LINEA1)}</p>
          <p class="domicilios-aqui">${escapeHtml(MENSAJE_DOMICILIOS_TIRILLA_LINEA2)}</p>
          ${
            p.domiciliosQrDataUrl?.trim()
              ? `<img src="${escapeHtml(p.domiciliosQrDataUrl)}" width="${qrDomPx}" height="${qrDomPx}" alt="QR pedidos a domicilio" />`
              : ""
          }
          <p class="domicilios-hint">Escanea y pide a domicilio</p>
        </div>
        <div class="rule"></div>`
      : "";

  const tieneSaldoClub = ticketTieneSaldoClubMillasEnTirilla(p);
  const antesClub = millasAntesEnTicket(p);
  const despuesClub = millasDespuesEnTicket(p);
  const ganadasClub = p.clubMillasGanadasCompra ?? 0;
  const qrConsultaClub = p.clubMillasConsultaQrDataUrl?.trim();
  const clubSaldoClass = termico ? "qr club-saldo-promo termico-claro" : "qr club-saldo-promo";
  const clubSaldoBlock = tieneSaldoClub
    ? `<div class="${clubSaldoClass}">
          <p class="club-saldo-sep" aria-hidden="true">${"=".repeat(rollo58 ? 24 : 28)}</p>
          <p class="qr-t">${escapeHtml(MENSAJE_TIRILLA_CLUB_SALDO_TITULO)}</p>
          <p class="qr-paso">${escapeHtml(MENSAJE_TIRILLA_CLUB_ACUMULADO_AUTO)}</p>
          ${
            antesClub !== undefined
              ? `<p class="club-saldo-label">${escapeHtml(MENSAJE_TIRILLA_CLUB_SALDO_ANTES_LABEL)}</p>
          <p class="club-saldo-valor club-saldo-antes">${escapeHtml(formatoMillasTicket(antesClub))}</p>`
              : ""
          }
          ${
            despuesClub !== undefined
              ? `<p class="club-saldo-label club-saldo-label-despues">${escapeHtml(MENSAJE_TIRILLA_CLUB_SALDO_DESPUES_LABEL)}</p>
          <p class="club-saldo-valor club-saldo-despues">${escapeHtml(formatoMillasTicket(despuesClub))}</p>`
              : ""
          }
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
          ${
            incluirQrPromocionales
              ? `<p class="qr-paso">${escapeHtml(MENSAJE_TIRILLA_CLUB_CONSULTA_PASO)}</p>`
              : ""
          }
          <p class="club-saldo-sep" aria-hidden="true">${"=".repeat(rollo58 ? 24 : 28)}</p>
          ${
            incluirQrPromocionales && qrConsultaClub
              ? `<img src="${escapeHtml(qrConsultaClub)}" width="${qrClubPx}" height="${qrClubPx}" alt="QR Mi plan Club de Millas" />`
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
  const qrFrecuenteBlock = incluirQrPromocionales && esBloqueClubLegacy
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
              ? `<img src="${escapeHtml(payload.fidelizacionQrDataUrl!)}" width="${qrClubPx}" height="${qrClubPx}" alt="" />`
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
    incluirQrPromocionales &&
    !tieneAcumulacionClub &&
    (p.clubMillasInvitacionQrDataUrl?.trim() || p.clubMillasInvitacionUrl?.trim())
      ? `<div class="club-invitacion-promo">
          <p class="club-invitacion-badge">Programa nacional</p>
          <p class="club-invitacion-titulo">${escapeHtml(INVITACION_CLUB_TIRILLA_TITULO)}</p>
          <p class="club-invitacion-llamado">${escapeHtml(INVITACION_CLUB_TIRILLA_LLAMADO)}</p>
          <p class="club-invitacion-cuerpo">${escapeHtml(INVITACION_CLUB_TIRILLA_CUERPO)}</p>
          ${
            p.clubMillasInvitacionQrDataUrl?.trim()
              ? `<img src="${escapeHtml(p.clubMillasInvitacionQrDataUrl)}" width="${qrClubPx}" height="${qrClubPx}" alt="QR Club de Millas" />`
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
  html {
    width: ${mm}mm;
    margin: 0 auto;
    background: #fff;
  }
  * { box-sizing: border-box; }
  * {
    color: #000 !important;
    opacity: 1 !important;
    text-shadow: none !important;
  }
  body {
    margin: 0;
    width: ${mm}mm;
    min-width: ${mm}mm;
    padding: ${rollo58 ? "1.5mm 0.8mm 2.5mm" : mm <= 80 ? "2mm 1.5mm 3mm" : "6mm"};
    font-family: ${termico ? '"Courier New", Courier, "Lucida Console", monospace' : 'ui-sans-serif, system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'};
    font-size: ${rollo58 ? "10pt" : termico ? "9.5pt" : "10pt"};
    line-height: ${termico ? "1.28" : "1.4"};
    -webkit-font-smoothing: ${termico ? "none" : "auto"};
    font-smooth: ${termico ? "never" : "auto"};
    text-rendering: ${termico ? "optimizeSpeed" : "auto"};
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    color: #000;
    background: #fff;
    display: flex;
    justify-content: center;
    align-items: flex-start;
  }
  .tirilla {
    width: ${termico ? `${anchoContenidoMm}mm` : "72mm"};
    max-width: 100%;
    margin: 0 auto;
    color: #000;
    font-weight: ${termico ? "700" : "500"};
  }
  .logo-wrap { text-align: center; margin-bottom: 6px; }
  .logo { margin-bottom: 4px; }
  .logo img { max-height: 44px; width: auto; object-fit: contain; display: inline-block; }
  .brand-name {
    text-align: center;
    font-weight: 800;
    font-size: ${termico ? "10pt" : "11px"};
    letter-spacing: ${termico ? "0.06em" : "0.2em"};
    color: #000;
    margin: 0 0 4px;
  }
  .brand-only {
    text-align: center;
    font-weight: 800;
    font-size: ${termico ? "10pt" : "11px"};
    letter-spacing: ${termico ? "0.06em" : "0.2em"};
    color: #000;
    margin-bottom: 4px;
  }
  .tagline {
    text-align: center;
    font-size: ${termico ? "9pt" : "8px"};
    font-weight: 700;
    letter-spacing: ${termico ? "0.04em" : "0.18em"};
    text-transform: uppercase;
    color: #000;
    margin: 0 0 2px;
  }
  .subtag {
    text-align: center;
    font-size: ${termico ? "8pt" : "7px"};
    color: #000;
    margin: 0 0 8px;
    letter-spacing: ${termico ? "0" : "0.12em"};
    font-weight: ${termico ? "700" : "500"};
  }
  .rule {
    height: 0;
    border: 0;
    border-top: 1px solid #000;
    margin: 8px 0;
  }
  .meta { font-size: ${termico ? "8.8pt" : "8.5px"}; line-height: 1.45; margin-bottom: 8px; font-weight: ${termico ? "700" : "500"}; }
  .meta-row { display: flex; justify-content: space-between; gap: 6px; margin: 3px 0; }
  .meta-k { color: #000; flex-shrink: 0; font-weight: 800; }
  .meta-v { text-align: right; font-weight: 800; word-break: break-word; }
  .li {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    font-size: ${termico ? "9.2pt" : "9px"};
    font-weight: ${termico ? "700" : "500"};
    margin: 6px 0;
    padding-bottom: 5px;
    border-bottom: 1px ${termico ? "solid #000" : "dotted #000"};
  }
  .li-t { flex: 1; min-width: 0; line-height: 1.35; }
  .li-p { font-weight: 900; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .muted { color: #000; font-weight: 700; font-size: ${termico ? "8pt" : "8px"}; }
  .iva-desglose {
    margin-top: 8px;
    padding: 6px 8px;
    background: #fff;
    border: 1px solid #000;
    border-radius: ${termico ? "0" : "4px"};
    font-size: ${termico ? "8.2pt" : "8px"};
    line-height: 1.45;
    font-weight: ${termico ? "700" : "500"};
  }
  .iva-row { display: flex; justify-content: space-between; gap: 8px; margin: 3px 0; }
  .iva-k { color: #000; font-weight: 800; }
  .iva-v { font-weight: 900; font-variant-numeric: tabular-nums; }
  .total {
    margin-top: 10px;
    padding: 8px 10px;
    background: #fff;
    color: #000;
    border: ${termico ? "2px solid #000" : "1px solid #000"};
    border-radius: ${termico ? "0" : "6px"};
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: ${termico ? "11pt" : "11px"};
    font-weight: 800;
    letter-spacing: ${termico ? "0" : "0.04em"};
  }
  .total span:last-child { font-variant-numeric: tabular-nums; }
  .nota {
    margin-top: 10px;
    font-size: ${termico ? "8pt" : "8px"};
    line-height: 1.4;
    color: #000;
    font-weight: ${termico ? "600" : "400"};
    text-align: center;
    padding: 0 2px;
  }
  .social {
    margin-top: 12px;
    padding-top: 10px;
    border-top: 2px solid #000;
    text-align: center;
  }
  .social-ig {
    font-size: 12px;
    font-weight: 800;
    color: #000;
    letter-spacing: 0.02em;
    margin: 0 0 4px;
  }
  .social-hint {
    font-size: 7.5px;
    color: #000;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    margin: 0 0 6px;
  }
  .social-brand {
    font-size: 7px;
    color: #000;
    letter-spacing: 0.1em;
    margin: 0;
  }
  .domicilios-promo {
    margin-bottom: 8px;
    padding: 8px 4px 6px;
    text-align: center;
    background: #fff;
    border: 1px solid #000;
    border-radius: ${termico ? "0" : "6px"};
  }
  .domicilios-msg {
    margin: 0;
    font-size: 8.5px;
    font-weight: 700;
    line-height: 1.35;
    color: #000;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .domicilios-aqui {
    margin: 2px 0 6px;
    font-size: 13px;
    font-weight: 900;
    letter-spacing: 0.2em;
    color: #000;
  }
  .domicilios-hint {
    margin: 4px 0 0;
    font-size: 7px;
    color: #000;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .domicilios-promo img { image-rendering: pixelated; display: inline-block; margin-top: 2px; }
  .club-invitacion-promo {
    margin-top: 12px;
    padding: 10px 6px 8px;
    text-align: center;
    background: #fff;
    border: 2px solid #000;
    border-radius: ${termico ? "0" : "8px"};
    box-shadow: none;
  }
  .club-invitacion-badge {
    margin: 0 0 4px;
    font-size: 7px;
    font-weight: 800;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #000;
  }
  .club-invitacion-titulo {
    margin: 0;
    font-size: 8px;
    font-weight: 800;
    line-height: 1.3;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #000;
  }
  .club-invitacion-llamado {
    margin: 4px 0 6px;
    font-size: 15px;
    font-weight: 900;
    letter-spacing: 0.12em;
    color: #000;
    text-shadow: none;
  }
  .club-invitacion-cuerpo {
    margin: 0 0 8px;
    font-size: 7.5px;
    font-weight: 600;
    line-height: 1.4;
    color: #000;
  }
  .club-invitacion-hint {
    margin: 6px 0 0;
    font-size: 7px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #000;
  }
  .club-invitacion-promo img { image-rendering: pixelated; display: inline-block; margin-top: 2px; }
  .qr { margin-top: 12px; text-align: center; padding-top: 10px; border-top: 1px dashed #000; }
  .club-frecuente-promo {
    padding: 8px 4px;
    background: #fff;
    border: 1px solid #000;
    border-radius: ${termico ? "0" : "6px"};
  }
  .qr-t { margin: 0 0 4px; font-size: 7.5px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.08em; color: #000; line-height: 1.3; }
  .qr-paso { margin: 0 0 4px; font-size: 7px; font-weight: 700; line-height: 1.35; color: #000; }
  .qr-codigo-label { margin: 6px 0 2px; font-size: 7px; font-weight: 900; letter-spacing: 0.12em; text-transform: uppercase; color: #000; }
  .qr-codigo-valor { margin: 0 0 8px; font-size: 18px; font-weight: 900; letter-spacing: 0.24em; color: #000; }
  .club-saldo-promo {
    margin-top: 10px;
    padding: 10px 8px;
    border: 2px solid #000;
    border-radius: ${termico ? "0" : "6px"};
    background: #fff;
    text-align: center;
  }
  .club-saldo-promo.termico-claro {
    padding: 6px 2px 8px;
    border: 1px solid #000;
    border-radius: 0;
    background: #fff;
    box-shadow: none;
  }
  .club-saldo-sep {
    margin: 4px 0;
    font-size: ${rollo58 ? "7pt" : "8pt"};
    font-weight: 700;
    letter-spacing: 0;
    color: #000;
    line-height: 1.1;
    overflow: hidden;
  }
  .club-saldo-promo.termico-claro .qr-t,
  .club-saldo-promo.termico-claro .qr-paso,
  .club-saldo-promo.termico-claro .club-saldo-label,
  .club-saldo-promo.termico-claro .club-ganadas-label,
  .club-saldo-promo.termico-claro .qr-s {
    color: #000;
    letter-spacing: 0;
    text-transform: none;
    font-size: ${rollo58 ? "7.5pt" : "8pt"};
    font-weight: 700;
    line-height: 1.35;
  }
  .club-saldo-promo.termico-claro .club-saldo-valor,
  .club-saldo-promo.termico-claro .club-ganadas-valor {
    margin: 2px 0 8px;
    font-size: ${rollo58 ? "18pt" : "20pt"};
    font-weight: 900;
    letter-spacing: 0.12em;
    line-height: 1.1;
    color: #000;
    font-variant-numeric: tabular-nums;
  }
  .club-saldo-promo.termico-claro .club-saldo-despues {
    font-size: ${rollo58 ? "20pt" : "22pt"};
    color: #000;
  }
  .club-saldo-promo.termico-claro .qr {
    border-top: 1px solid #000;
    margin-top: 8px;
    padding-top: 8px;
  }
  .club-saldo-label { margin: 8px 0 2px; font-size: 8px; font-weight: 900; letter-spacing: 0.08em; text-transform: uppercase; color: #000; }
  .club-saldo-valor { margin: 0 0 6px; font-size: ${rollo58 ? "22px" : "28px"}; font-weight: 900; line-height: 1.1; letter-spacing: 0.04em; color: #000; }
  .club-saldo-despues { font-size: ${rollo58 ? "24px" : "32px"}; color: #000; }
  .club-saldo-label-despues { margin-top: 8px; }
  .club-ganadas-label { margin: 4px 0 2px; font-size: 7px; font-weight: 800; color: #000; }
  .club-ganadas-valor { margin: 0 0 8px; font-size: 16px; font-weight: 900; color: #000; }
  .qr-s { margin: 6px 0 0; font-size: 7px; font-weight: 800; color: #000; text-transform: uppercase; letter-spacing: 0.06em; }
  .qr img { image-rendering: pixelated; display: inline-block; }
  .fe-dian {
    margin-top: 10px;
    padding: 8px 6px;
    background: #fff;
    border: 1px solid #000;
    border-radius: ${termico ? "0" : "4px"};
    font-size: ${termico ? "7.8pt" : "7.5px"};
    line-height: 1.35;
    word-break: break-all;
    font-weight: ${termico ? "700" : "500"};
  }
  .fe-dian-t {
    font-weight: 800;
    letter-spacing: 0.04em;
    color: #000;
    margin: 0 0 6px;
    text-align: center;
    font-size: 8px;
  }
  .fe-section { margin-top: 7px; padding-top: 6px; border-top: 1px dashed #000; }
  .fe-section-t { margin: 0 0 4px; font-size: 6.7px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.06em; color: #000; text-align: center; }
  .fe-dian-row { margin: 4px 0; color: #000; }
  .fe-dian-k { font-weight: 900; color: #000; display: block; margin-bottom: 2px; }
  .fe-qr { margin-top: 8px; padding-top: 7px; border-top: 1px dashed #000; text-align: center; }
  .fe-qr img { image-rendering: pixelated; display: inline-block; margin-top: 4px; }
  .fe-qr-box { margin: 6px auto 0; width: 128px; min-height: 92px; border: 1px dashed #000; display: flex; align-items: center; justify-content: center; padding: 6px; font-size: 6.5px; color: #000; text-transform: uppercase; font-weight: 800; }
  @media print {
    * {
      color: #000 !important;
      opacity: 1 !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      background: #fff !important;
      filter: contrast(1.25);
      display: flex !important;
      justify-content: center !important;
      width: ${mm}mm !important;
      min-width: ${mm}mm !important;
      padding-left: ${rollo58 ? "0.8mm" : mm <= 80 ? "1.5mm" : "6mm"} !important;
      padding-right: ${rollo58 ? "0.8mm" : mm <= 80 ? "1.5mm" : "6mm"} !important;
    }
    .tirilla {
      width: ${termico ? `${anchoContenidoMm}mm` : "72mm"} !important;
      max-width: 100% !important;
      margin-left: auto !important;
      margin-right: auto !important;
    }
    .total {
      background: #fff !important;
      color: #000 !important;
      border: 2px solid #000 !important;
    }
  }
</style></head><body>
<div class="tirilla">
  ${domiciliosBlock}
  ${logoHtml}
  <p class="tagline">${escapeHtml(tituloDocumento)}</p>
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
  ${facturaElectronicaHtml}
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

/** Muestra feedback inmediato mientras se prepara el ticket (mismo gesto de clic del usuario). */
export function mostrarVentanaTicketCargando(w: Window): void {
  try {
    w.document.open();
    w.document.write(
      '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/><title>Ticket</title></head>' +
        '<body style="margin:0;padding:20px;font:600 13px/1.4 Consolas,monospace;color:#111;background:#fff">' +
        "Preparando ticket para imprimir…</body></html>"
    );
    w.document.close();
  } catch {
    // ignore
  }
}

const QZ_IMPRESION_TIMEOUT_MS = 2800;

function esperarConTimeout<T>(promesa: Promise<T>, ms: number, etiqueta: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(etiqueta)), ms);
    promesa
      .then((v) => {
        window.clearTimeout(timer);
        resolve(v);
      })
      .catch((e) => {
        window.clearTimeout(timer);
        reject(e);
      });
  });
}

/** Conecta QZ en segundo plano al abrir caja (evita esperar al primer cobro). */
export async function qzPrecalentarConexion(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    await qzEnsureConnected();
  } catch {
    // QZ no instalado o apagado; el cobro hará fallback a navegador.
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
  if (p === "58mm") return { width: 58, height: 240 };
  if (p === "80mm") return { width: 80, height: 200 };
  return { width: 210, height: 297 };
}

export type OpcionesImpresionTicket = {
  /** Si el ticket ya pasó por enriquecerTicketTirillaAlCobrar, evita regenerar QR. */
  ticketYaEnriquecido?: boolean;
  /** Ventana abierta en el clic de «Imprimir» (antes de cualquier await). */
  ventanaNavegadorReservada?: Window | null;
};

export async function imprimirTicketVenta(
  prefs: ImpresionPosPrefs,
  payload: TicketVentaPayload,
  opciones?: OpcionesImpresionTicket
): Promise<void> {
  const ticketImp =
    opciones?.ticketYaEnriquecido || typeof window === "undefined"
      ? payload
      : await import("@/lib/enriquecer-ticket-tirilla-cobro").then((m) =>
          m.enriquecerTicketTirillaAlCobrar(payload, window.location.origin)
        );
  const ventana = opciones?.ventanaNavegadorReservada ?? null;

  if (prefs.metodo === "directa") {
    try {
      await esperarConTimeout(
        imprimirTicketConQz(prefs, ticketImp),
        QZ_IMPRESION_TIMEOUT_MS,
        "QZ timeout"
      );
      return;
    } catch (qzErr) {
      console.warn("Ticket venta: QZ falló o tardó demasiado, intentando navegador.", qzErr);
      imprimirTicketEnNavegador(ticketImp, ventana);
      return;
    }
  }
  imprimirTicketEnNavegador(ticketImp, ventana);
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
  const esFacturaElectronica = Boolean(
    payload.facturaElectronica && (payload.facturaElectronica.cufe?.trim() || payload.facturaElectronica.numero?.trim())
  );
  const incluirQrPromocionales = !esFacturaElectronica;
  const tieneSaldoClub = ticketTieneSaldoClubMillasEnTirilla(payload);
  const contenidoQrClub = contenidoQrEscaneableClubMillasDesdeTicket(payload);
  const domUrl = incluirQrPromocionales ? payload.domiciliosLandingUrl?.trim() : "";
  const invUrl = incluirQrPromocionales ? payload.clubMillasInvitacionUrl?.trim() : "";
  const tieneQrInvitacion = Boolean(payload.clubMillasInvitacionQrDataUrl?.trim());
  const plain = construirTextoTicketPlano(payload, cols, {
    ...(tieneSaldoClub && incluirQrPromocionales ? { omitirBloqueClubSaldoTexto: true } : {}),
    ...(esFacturaElectronica ? { omitirPasoConsultaClubTexto: true } : {}),
    ...((contenidoQrClub && !tieneSaldoClub) || esFacturaElectronica ? { omitirBloqueFidelizacionTexto: true } : {}),
    ...(domUrl || esFacturaElectronica ? { omitirBloqueDomiciliosTexto: true } : {}),
    ...(invUrl || esFacturaElectronica ? { omitirBloqueInvitacionClubTexto: true } : {}),
  });
  const bloqueDomicilios = domUrl ? escPosBloqueQrDomicilios(domUrl, cols) : "";
  const bloqueSaldoClub = incluirQrPromocionales && tieneSaldoClub ? escPosBloqueClubMillasSaldo(payload, cols) : "";
  const bloqueQrFacturaElectronica = payload.facturaElectronica
    ? escPosBloqueQrFacturaElectronica(payload.facturaElectronica, cols)
    : "";
  const bloqueQr =
    incluirQrPromocionales && !tieneSaldoClub && contenidoQrClub
      ? escPosBloqueQrFidelizacion(contenidoQrClub, cols, payload.clubMillasCodigoCorto)
      : "";
  const bloqueInvitacion =
    invUrl && !contenidoQrClub && !tieneSaldoClub
      ? escPosBloqueInvitacionClubMillas(invUrl, cols)
      : "";
  const init = "\x1B\x40";
  const abrirCajon = escPosAbrirCajon();
  const plainLegible = aplicarLegibilidadEscPosTextoPlano(plain, cols);
  const data = `${init}${bloqueDomicilios}${plainLegible}${bloqueQrFacturaElectronica}${bloqueSaldoClub}${bloqueQr}${bloqueInvitacion}\n\n${abrirCajon}\n\x1D\x56\x00`;
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
