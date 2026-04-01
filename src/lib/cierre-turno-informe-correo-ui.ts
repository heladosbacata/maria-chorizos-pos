/**
 * Destinatarios y mensajes de UI para el informe de cierre de turno por correo (POS GEB).
 */

/** Copia fija a servicio al cliente Grupo Bacatá en todos los informes de cierre. */
export const INFORME_CIERRE_CC_SERVICIO_GRUPO_BACATA = "servicioalcliente@grupobacata.com";

function emailValidoInforme(s: string): boolean {
  const t = s.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

/**
 * Garantiza la copia a servicioalcliente@grupobacata.com y añade otros correos válidos que escriba el usuario.
 */
export function combinarCcInformeCierreTurno(extraDelUsuario: string): string {
  const fijo = INFORME_CIERRE_CC_SERVICIO_GRUPO_BACATA;
  const fijoLower = fijo.toLowerCase();
  const extras = extraDelUsuario
    .split(/[,;]/)
    .map((x) => x.trim())
    .filter((x) => emailValidoInforme(x) && x.toLowerCase() !== fijoLower);
  const unicos: string[] = [];
  const seen = new Set<string>();
  const add = (e: string) => {
    const k = e.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    unicos.push(e);
  };
  add(fijo);
  for (const e of extras) add(e);
  return unicos.join(", ");
}

const FRASES_MOTIVACIONALES = [
  "Cada cierre bien hecho es victoria en equipo: tu disciplina en caja impulsa a todo Grupo Bacatá.",
  "Un turno cerrado con orden y transparencia es señal de grandeza operativa. ¡Gracias por cuidar cada detalle!",
  "Hoy dejaste la caja impecable y el negocio más fuerte. Ese es el espíritu que nos hace crecer juntos.",
  "Tu esfuerzo en este turno se nota: confianza del cliente, números claros y cierre redondo. ¡Sigue así!",
  "Cerrar bien es abrir mejor el día siguiente. Gracias por tu compromiso con María Chorizos y el franquiciado.",
  "La excelencia no es un acto, es un hábito — y hoy lo demostraste al cerrar con precisión. ¡Bravo!",
] as const;

/** Mensaje tras enviar el informe por correo con éxito (variación aleatoria de la frase central). */
export function mensajeExitoMotivacionalInformeCierreTurno(): string {
  const i = Math.floor(Math.random() * FRASES_MOTIVACIONALES.length);
  const frase = FRASES_MOTIVACIONALES[i];
  return [
    "¡Turno cerrado con éxito!",
    "",
    frase,
    "",
    `Confirmamos el envío del informe por correo al franquiciado (según ID_Franquiciados) y copia a ${INFORME_CIERRE_CC_SERVICIO_GRUPO_BACATA}.`,
    "",
    "Gracias por tu esfuerzo. ¡Nos vemos en el próximo turno!",
  ].join("\n");
}
