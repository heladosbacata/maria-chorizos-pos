import type { EstadoDomicilio, PedidoDomicilio } from "@/types/pos-domicilios";

export const ESTADOS_ACTIVOS_DOMICILIO: EstadoDomicilio[] = [
  "NUEVO",
  "ACEPTADO",
  "EN_PREPARACION",
  "LISTO_PARA_DESPACHO",
  "EN_ENTREGA",
];

export const RESPUESTAS_RAPIDAS_CHAT_DOMICILIO: readonly { id: string; etiqueta: string; texto: string }[] = [
  { id: "confirmar", etiqueta: "Confirmar orden", texto: "Buenas, ¿nos confirmás tu orden por favor? Gracias." },
  { id: "aceptado", etiqueta: "Pedido aceptado", texto: "Tu pedido fue aceptado. En breve comenzamos la preparación." },
  { id: "preparacion", etiqueta: "En preparación", texto: "Tu pedido está en preparación. Te avisamos cuando salga a entrega." },
  { id: "en-camino", etiqueta: "En camino", texto: "Tu pedido va en camino hacia tu dirección. ¡Gracias por tu compra!" },
  { id: "listo-recoger", etiqueta: "Listo para recoger", texto: "Tu pedido está listo para recoger en el punto. Te esperamos." },
  { id: "demora", etiqueta: "Demora", texto: "Te informamos que hay una demora un poco mayor de lo habitual. Gracias por tu paciencia." },
  { id: "direccion", etiqueta: "Confirmar dirección", texto: "¿Podés confirmarnos la dirección y una referencia para la entrega? Gracias." },
  { id: "pago-entrega", etiqueta: "Pago contraentrega", texto: "Recordá que el pago contraentrega se hace al recibir el pedido." },
  { id: "llamar", etiqueta: "Te llamamos", texto: "En un momento te contactamos por teléfono para coordinar." },
  { id: "gracias", etiqueta: "Gracias", texto: "Muchas gracias. Cualquier duda quedamos atentos." },
];

const MAX_CHARS_CHAT_DOMICILIO = 800;

export function formatoHoraChatDomicilio(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--:--";
  return new Intl.DateTimeFormat("es-CO", { hour: "2-digit", minute: "2-digit" }).format(d);
}

export function etiquetaEstadoDomicilio(estado: EstadoDomicilio): string {
  if (estado === "NUEVO") return "Nuevo";
  if (estado === "ACEPTADO") return "Aceptado";
  if (estado === "EN_PREPARACION") return "En preparación";
  if (estado === "LISTO_PARA_DESPACHO") return "Listo";
  if (estado === "EN_ENTREGA") return "En entrega";
  if (estado === "ENTREGADO") return "Entregado";
  return "Rechazado";
}

function formatoMoneda(valor: number): string {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(
    valor
  );
}

function etiquetaCanal(canal: PedidoDomicilio["canal"]): string {
  if (canal === "whatsapp") return "WhatsApp";
  if (canal === "qr") return "QR";
  return "Web";
}

function etiquetaPago(metodo: PedidoDomicilio["metodoPago"]): string {
  if (metodo === "datafono") return "Datáfono";
  if (metodo === "transferencia") return "Transferencia";
  return "Efectivo";
}

export function textoResumenPedidoParaConfirmacion(p: PedidoDomicilio): string {
  const nom = p.cliente.trim() || "Cliente";
  const lineasItems = p.items.map((x) => x.trim()).filter(Boolean);
  const itemsBloque =
    lineasItems.length > 0
      ? `Items:\n${lineasItems.map((x) => `• ${x}`).join("\n")}`
      : "Items: (sin detalle en el sistema)";
  const ref = p.referencia?.trim();
  const partes = [
    `Hola ${nom}, te enviamos el resumen del pedido ${p.id} para que lo confirmes.`,
    "",
    itemsBloque,
    "",
    `Total: ${formatoMoneda(p.total)}`,
    `Pago: ${etiquetaPago(p.metodoPago)}`,
    `Entrega: ${p.direccion.trim()}`,
    ref ? `Referencia: ${ref}` : null,
    `Teléfono: ${p.telefono.trim()}`,
    `Canal: ${etiquetaCanal(p.canal)}`,
    "",
    "Por favor confirmá que todo es correcto o indicanos cualquier cambio. ¡Gracias!",
  ].filter((x): x is string => x != null && x !== "");
  let msg = partes.join("\n");
  if (msg.length > MAX_CHARS_CHAT_DOMICILIO) {
    const sufijo = "\n…(mensaje acortado; hay más ítems en el pedido.)";
    const max = MAX_CHARS_CHAT_DOMICILIO - sufijo.length;
    msg = `${msg.slice(0, Math.max(0, max)).trimEnd()}${sufijo}`;
  }
  return msg;
}

export function keyChatSeenDomicilios(puntoVenta: string): string {
  return `pos_mc_domicilios_chat_seen_v1:${puntoVenta.trim().toLowerCase() || "global"}`;
}

export function leerMapaVistoChatDomicilios(puntoVenta: string): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(keyChatSeenDomicilios(puntoVenta));
    if (!raw) return {};
    const obj = JSON.parse(raw) as unknown;
    if (!obj || typeof obj !== "object") return {};
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).filter(([, v]) => typeof v === "string")
    ) as Record<string, string>;
  } catch {
    return {};
  }
}

export function guardarMapaVistoChatDomicilios(puntoVenta: string, mapa: Record<string, string>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(keyChatSeenDomicilios(puntoVenta), JSON.stringify(mapa));
  } catch {
    /* ignore */
  }
}

export function marcarChatDomicilioLeido(puntoVenta: string, pedidoId: string): void {
  const pid = pedidoId.trim();
  const pv = puntoVenta.trim();
  if (!pid || !pv) return;
  const prev = leerMapaVistoChatDomicilios(pv);
  prev[pid] = new Date().toISOString();
  guardarMapaVistoChatDomicilios(pv, prev);
}
