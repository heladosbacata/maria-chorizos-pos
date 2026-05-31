import { createHash } from "node:crypto";

/** Mismo hash que el WMS (login Club de Millas). */
export function hashClubMillasClave(clave: string): string {
  return createHash("sha256").update(clave).digest("hex");
}
