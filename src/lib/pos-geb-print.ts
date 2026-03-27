import type { ImpresionPosPrefs, TicketVentaPayload } from "@/types/impresion-pos";

/** Evita caracteres fuera de CP437 en muchas térmicas; mantiene legibilidad. */
export function textoTicketSeguro(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E\n\r]/g, "?");
}

export function construirTextoTicketPlano(payload: TicketVentaPayload): string {
  const W = 42;
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
  rows.push("");
  rows.push(center(payload.notaPie ?? "Gracias por su compra"));
  rows.push("");
  return rows.join("\n");
}

export function imprimirTicketEnNavegador(payload: TicketVentaPayload): void {
  const body = construirTextoTicketPlano(payload).replace(/\n/g, "<br/>");
  const w = window.open("", "_blank", "width=420,height=640");
  if (!w) {
    throw new Error("Permite ventanas emergentes para imprimir desde el navegador.");
  }
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Ticket POS GEB</title>
    <style>
      body{font-family:ui-monospace,monospace;font-size:12px;padding:12px;max-width:360px;margin:0 auto;}
      @media print{@page{size:auto;margin:8mm}}
    </style></head><body><pre style="white-space:pre-wrap;font:inherit;margin:0">${body}</pre>
    <script>window.onload=function(){window.print();setTimeout(function(){window.close()},250);}</script>
    </body></html>`);
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
  const plain = construirTextoTicketPlano(payload);
  const init = "\x1B\x40";
  const data = `${init}${plain}\n\n\n\x1D\x56\x00`;
  await qz.print(config, [data]);
}

export async function probarImpresionQz(prefs: ImpresionPosPrefs): Promise<void> {
  const now = new Date().toLocaleString("es-CO");
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
