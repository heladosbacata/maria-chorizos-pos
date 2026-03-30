/**
 * Limpia datos operativos del POS en este navegador (ventas, turno, colas, mínimos locales).
 * No borra: impresora GEB, fotos/ficha de cajero, emails del informe de cierre, ni campos del contrato en pantalla.
 */

function debeEliminarClaveReinicioFabrica(key: string): boolean {
  if (key.startsWith("pos_mc_ventas_cajero_v2:")) return true;
  if (key === "pos_mc_ventas_cajero_v1") return true;
  if (key.startsWith("pos_mc_turno_abierto_v1:")) return true;
  if (key.startsWith("pos_mc_turnos_hist_v1:")) return true;
  if (key === "pos_mc_wms_ensamble_pendiente_v1") return true;
  if (key === "pos_mc_ventas_pendientes_wms_v1") return true;
  if (key === "pos_mc_ultimo_ensamble_v1") return true;
  if (key.startsWith("pos-inv-minimos-v1:")) return true;
  return false;
}

export function reiniciarPosFabricaLocalStorage(): { clavesEliminadas: number } {
  if (typeof window === "undefined") return { clavesEliminadas: 0 };
  const keys: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) keys.push(k);
    }
  } catch {
    return { clavesEliminadas: 0 };
  }
  let n = 0;
  for (const key of keys) {
    if (!debeEliminarClaveReinicioFabrica(key)) continue;
    try {
      localStorage.removeItem(key);
      n++;
    } catch {
      /* ignore */
    }
  }
  return { clavesEliminadas: n };
}
