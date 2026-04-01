import { LOGO_ORG_URL, MARIA_CHORIZOS_IG_HANDLE } from "@/lib/brand";
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

export function construirTextoTicketPlano(payload: TicketVentaPayload, columnas: number = 42): string {
  const W = columnas;
  const line = (s: string) => textoTicketSeguro(s).slice(0, W).padEnd(W);
  const center = (s: string) => {
    const t = textoTicketSeguro(s).slice(0, W);
    const pad = Math.max(0, Math.floor((W - t.length) / 2));
    return " ".repeat(pad) + t;
  };
  const rows: string[] = [];
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
  if (payload.fidelizacionPayloadTexto?.trim()) {
    rows.push(textoFidelizacionTicketPlano(payload.fidelizacionPayloadTexto.trim(), W));
  }
  return rows.join("\n");
}

/**
 * Mismo texto que verá el ticket impreso por navegador (sin bloque JSON duplicado si hay QR en imagen).
 * Para mostrar en pantalla antes de imprimir.
 */
export function textoParaPrevisualizacionTicket(payload: TicketVentaPayload): string {
  const tieneQrImg = Boolean(payload.fidelizacionQrDataUrl?.trim());
  const prefs = typeof window !== "undefined" ? loadImpresionPrefs() : null;
  const cols = prefs ? columnasTicketPorTamanoPapel(prefs.tamanoPapel) : 32;
  return construirTextoTicketPlano(
    tieneQrImg ? { ...payload, fidelizacionPayloadTexto: undefined } : payload,
    cols
  );
}

function textoFidelizacionTicketPlano(payloadJson: string, ancho: number): string {
  const line = (s: string) => textoTicketSeguro(s).slice(0, ancho);
  const rows: string[] = [];
  rows.push(line("--- MARIA CHORIZOS ---"));
  rows.push(line("CLIENTE FRECUENTE"));
  rows.push(line("Escanear con app"));
  rows.push("");
  for (let i = 0; i < payloadJson.length; i += ancho) {
    rows.push(line(payloadJson.slice(i, i + ancho)));
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

  const qrBlock =
    payload.fidelizacionQrDataUrl?.trim() != null && payload.fidelizacionQrDataUrl.trim() !== ""
      ? `<div class="qr">
          <p class="qr-t">Cliente frecuente</p>
          <img src="${escapeHtml(payload.fidelizacionQrDataUrl)}" width="160" height="160" alt="" />
          <p class="qr-s">Escaneá con la app María Chorizos</p>
        </div>`
      : "";

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
  .qr { margin-top: 12px; text-align: center; padding-top: 10px; border-top: 1px dashed #cbd5e1; }
  .qr-t { margin: 0 0 6px; font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; color: #475569; }
  .qr-s { margin: 6px 0 0; font-size: 7px; color: #64748b; }
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

/** Conecta a QZ Tray; si ya hay sesión abierta, continúa. */
export async function qzEnsureConnected(): Promise<QzModule> {
  const qz = await importQz();
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
  const plain = construirTextoTicketPlano(payload, cols);
  const init = "\x1B\x40";
  const data = `${init}${plain}\n\n\n\x1D\x56\x00`;
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
