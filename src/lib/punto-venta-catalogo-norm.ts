/**
 * Normaliza el código de punto de venta para comparar hoja Google y Firestore
 * con el valor del perfil (espacios, mayúsculas, tildes).
 */
export function normPuntoVentaCatalogo(s: string): string {
  return String(s ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ");
}
