export function emailComprobanteValido(s: string): boolean {
  const t = s.trim();
  if (!t || t.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

export type LineaComprobanteCorreo = {
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
};

export type PayloadComprobanteCorreo = {
  comprobante: string;
  tipoLabel: string;
  total: number;
  fechaIso: string;
  puntoVenta: string;
  lineas: LineaComprobanteCorreo[];
  clienteNombre?: string;
  clienteNit?: string;
  facturaElectronica?: { numero?: string; cufe?: string };
  mensaje?: string;
};

function pesos(n: number): string {
  return `$ ${n.toLocaleString("es-CO", { maximumFractionDigits: 0 })}`;
}

export function construirCorreoComprobantePos(p: PayloadComprobanteCorreo): {
  subject: string;
  text: string;
  html: string;
} {
  const comprobante = p.comprobante.trim() || "Comprobante";
  const tipo = p.tipoLabel.trim() || "Documento";
  const pv = p.puntoVenta.trim();
  const cliente = p.clienteNombre?.trim() || "Consumidor final";
  const nit = p.clienteNit?.trim();
  const feNum = p.facturaElectronica?.numero?.trim();
  const cufe = p.facturaElectronica?.cufe?.trim();
  const mensaje = p.mensaje?.trim();

  const lineasTxt = p.lineas
    .map((l) => {
      const sub = Math.round(l.cantidad * l.precioUnitario * 100) / 100;
      return `  · ${l.descripcion} × ${l.cantidad} = ${pesos(sub)}`;
    })
    .join("\n");

  const lineasHtml = p.lineas
    .map((l) => {
      const sub = Math.round(l.cantidad * l.precioUnitario * 100) / 100;
      return `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee">${escapeHtml(l.descripcion)}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${l.cantidad}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${pesos(sub)}</td></tr>`;
    })
    .join("");

  const subject = `${tipo} ${comprobante} — ${pv}`;

  const bloques: string[] = [
    `Hola,`,
    ``,
    `Adjuntamos el resumen de tu ${tipo.toLowerCase()} del punto de venta ${pv}.`,
    ``,
    `Comprobante: ${comprobante}`,
    `Fecha: ${p.fechaIso}`,
    `Cliente: ${cliente}${nit ? ` · ${nit}` : ""}`,
    `Total: ${pesos(p.total)}`,
  ];
  if (feNum) bloques.push(`Nº factura electrónica: ${feNum}`);
  if (cufe) bloques.push(`CUFE: ${cufe}`);
  if (mensaje) {
    bloques.push(``, `Mensaje:`, mensaje);
  }
  bloques.push(``, `Detalle:`, lineasTxt, ``, `— Maria Chorizos POS`);

  const text = bloques.join("\n");

  const html = `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;color:#111;max-width:560px;margin:0 auto;padding:16px">
<p>Hola,</p>
<p>Resumen de tu <strong>${escapeHtml(tipo.toLowerCase())}</strong> del punto <strong>${escapeHtml(pv)}</strong>.</p>
<table style="width:100%;border-collapse:collapse;font-size:14px;margin:12px 0">
<tr><td style="padding:4px 0;color:#666">Comprobante</td><td style="padding:4px 0;text-align:right;font-weight:600">${escapeHtml(comprobante)}</td></tr>
<tr><td style="padding:4px 0;color:#666">Fecha</td><td style="padding:4px 0;text-align:right">${escapeHtml(p.fechaIso)}</td></tr>
<tr><td style="padding:4px 0;color:#666">Cliente</td><td style="padding:4px 0;text-align:right">${escapeHtml(cliente)}${nit ? `<br><span style="font-size:12px;color:#666">${escapeHtml(nit)}</span>` : ""}</td></tr>
<tr><td style="padding:4px 0;color:#666">Total</td><td style="padding:4px 0;text-align:right;font-weight:700">${pesos(p.total)}</td></tr>
${feNum ? `<tr><td style="padding:4px 0;color:#666">Nº FE</td><td style="padding:4px 0;text-align:right;font-family:monospace;font-size:12px">${escapeHtml(feNum)}</td></tr>` : ""}
${cufe ? `<tr><td style="padding:4px 0;color:#666;vertical-align:top">CUFE</td><td style="padding:4px 0;text-align:right;font-family:monospace;font-size:10px;word-break:break-all">${escapeHtml(cufe)}</td></tr>` : ""}
</table>
${mensaje ? `<p style="background:#f9fafb;border-left:3px solid #d97706;padding:10px 12px;font-size:14px">${escapeHtml(mensaje)}</p>` : ""}
<table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:8px">
<thead><tr style="background:#f3f4f6"><th style="padding:8px;text-align:left">Producto</th><th style="padding:8px;text-align:right">Cant.</th><th style="padding:8px;text-align:right">Subtotal</th></tr></thead>
<tbody>${lineasHtml}</tbody>
</table>
<p style="margin-top:24px;font-size:12px;color:#6b7280">— Maria Chorizos POS</p>
</body></html>`;

  return { subject, text, html };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
