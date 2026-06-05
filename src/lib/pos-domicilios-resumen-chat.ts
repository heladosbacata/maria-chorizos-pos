import type { PedidoDomicilio } from "@/types/pos-domicilios";

const MAX_CHARS_CHAT_DOMICILIO = 800;

function formatoMoneda(valor: number): string {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(
    valor
  );
}

function etiquetaPago(metodo: PedidoDomicilio["metodoPago"]): string {
  if (metodo === "datafono") return "Datáfono";
  if (metodo === "transferencia") return "Transferencia";
  return "Efectivo";
}

function etiquetaCanal(canal: PedidoDomicilio["canal"]): string {
  if (canal === "whatsapp") return "WhatsApp";
  if (canal === "qr") return "QR";
  return "Web";
}

/** Mensaje inicial del chat POS con resumen del pedido (máx. API). */
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

export function textoRechazoPedidoParaCliente(motivo: string): string {
  const m = motivo.trim() || "No pudimos procesar tu pedido en este momento.";
  return `Lo sentimos, no pudimos aceptar tu pedido en este momento.\n\nMotivo: ${m}\n\nSi tenés dudas, escribinos por este chat.`;
}

export function textoAceptacionPedidoParaCliente(): string {
  return "¡Tu pedido fue aceptado! En breve comenzamos la preparación. Gracias por elegirnos.";
}
