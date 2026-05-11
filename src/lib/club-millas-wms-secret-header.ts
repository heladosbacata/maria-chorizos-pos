/**
 * Cabeceras hacia el WMS para rutas Club de Millas que autentican con el secreto compartido POS↔WMS
 * (`CLUB_MILLAS_POS_SECRET`). Igual que `registrar-ticket` y `upsert-socio`.
 */
export function headersClubMillasPosSecretHaciaWms(secret: string): HeadersInit {
  const raw = process.env.CLUB_MILLAS_WMS_SECRET_HEADER?.trim();
  if (raw) {
    const idx = raw.indexOf(":");
    if (idx > 0) {
      const name = raw.slice(0, idx).trim();
      const value = raw.slice(idx + 1).trim();
      if (name && value) {
        return { "Content-Type": "application/json", [name]: value };
      }
    }
  }
  /* Mismo nombre que documenta el WMS (HTTP trata las cabeceras sin distinguir mayúsculas). */
  return { "Content-Type": "application/json", "x-club-millas-pos-secret": secret };
}
