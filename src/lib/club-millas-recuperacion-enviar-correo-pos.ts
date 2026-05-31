import { enviarCorreoComoInformePos } from "@/lib/enviar-correo-informe-pos-servidor";
import { mensajeErrorCorreoClubMillas } from "@/lib/recuperar-clave-club-millas-documento";

export async function enviarCorreoRecuperacionClubMillasDesdePos(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<{ ok: true; via: string } | { ok: false; message: string }> {
  const to = opts.to.trim().toLowerCase();
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return { ok: false, message: "Correo del socio inválido." };
  }

  const r = await enviarCorreoComoInformePos({
    to,
    subject: opts.subject.trim(),
    text: opts.text,
    html: opts.html,
  });

  if (!r.ok) {
    return { ok: false, message: mensajeErrorCorreoClubMillas(r.message) };
  }
  return { ok: true, via: r.via };
}
